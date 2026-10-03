from __future__ import annotations

from decimal import Decimal

import pytest

from apps.shopie.models import ShopBooksVoucher, ShopDocumentShareLink, ShopProduct, ShopSupplier
from apps.shopie.services.books import BooksService
from apps.shopie.services.documents import DocumentsService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.shop_documents import (
    LAYOUT_THERMAL,
    ShopDocumentService,
    _format_address_parts,
    _pos_bill_summary_from_payload,
    _reconcile_discount_parts,
)


def test_format_address_strips_plus_code_and_avoids_duplicates():
    formatted = _format_address_parts(
        line1="FR5W+JFH, Shivsai Colony, Shiv Colony, Dhankawadi, Pune, Maharashtra 411043, India",
        line2="Flat 701",
        city="Pune",
        state="Maharashtra",
        postal_code="411043",
        country="India",
    )
    assert "FR5W+JFH" not in formatted
    assert formatted.startswith("Flat 701")
    assert "Shivsai Colony" in formatted
    assert "Pune" in formatted
    # City/state/PIN/country already in the street line — no duplicated tail.
    assert formatted.count("Pune") == 1
    assert formatted.count("India") == 1
    assert "…" not in formatted


def test_discount_summary_does_not_double_count_coupon_and_bill():
    """Coupon applied at POS is also stored in bill_discount_* on older orders."""
    line, bill, coupon, reward = _reconcile_discount_parts(
        merchandise_gross=Decimal("3117.00"),
        line_total_sum=Decimal("2805.31"),
        line_discount_total=Decimal("0"),
        bill_discount_total=Decimal("264.15"),
        coupon_discount=Decimal("311.70"),
        coupon_code="SAVE10",
        reward_discount=Decimal("0"),
        voucher_discount_total=Decimal("311.69"),
    )
    assert line == Decimal("0.00")
    assert bill == Decimal("0.00")
    assert coupon == Decimal("311.69")
    assert reward == Decimal("0.00")

    summary = _pos_bill_summary_from_payload(
        {
            "merchandise_gross": "3117.00",
            "line_discount_total": "0",
            "bill_discount_total": "264.15",
            "coupon_discount": "311.70",
            "coupon_code": "SAVE10",
            "discount_total": "311.69",
            "taxable_value": "2377.38",
            "total": "2805.31",
            "lines": [{"total": "2805.31"}],
        }
    )
    assert summary["line_discount"] == Decimal("0.00")
    assert summary["bill_discount"] == Decimal("0.00")
    assert summary["coupon_discount"] == Decimal("311.69")
    assert summary["after_line"] == Decimal("3117.00")


def _product(business, *, name: str, price: str, gst_rate: str) -> ShopProduct:
    return ShopProduct.objects.create(
        tenant=business.tenant,
        business=business,
        name=name,
        sku=f"SKU-{name[:8].upper()}",
        price=Decimal(price),
        gst_rate=Decimal(gst_rate),
        stock_on_hand=Decimal("100"),
    )


@pytest.mark.django_db
def test_sale_document_payload_pdf_and_share(shop_business, customer, cash_account):
    product = _product(shop_business, name="Soap", price="100.00", gst_rate="18")
    voucher = BooksService().create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "18"}],
            "amount_paid": "50",
            "cash_account_id": cash_account.id,
        },
    )
    assert isinstance(voucher, ShopBooksVoucher)
    shop_business.upi_vpa = "shop@upi"
    shop_business.save(update_fields=["upi_vpa", "updated_at"])

    docs = ShopDocumentService()
    payload = docs.build_payload(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="sale",
        document_id=voucher.id,
    )
    assert payload["number"] == voucher.voucher_number
    assert payload["kind"] == "sale"
    assert Decimal(payload["amount_due"]) > 0
    assert Decimal(payload["amount_paid"]) == Decimal("50.00")
    assert payload["upi_pay_url"]
    assert payload["lines"]
    assert "taxable_value" in payload
    assert Decimal(payload["taxable_value"]) == Decimal("100.00")
    assert Decimal(payload["cgst_total"]) + Decimal(payload["sgst_total"]) == Decimal(
        payload["tax_total"]
    )
    assert Decimal(payload["merchandise_gross"]) == Decimal("100.00")
    html = docs.render_html(payload)
    assert "TAX INVOICE" in html
    assert "Taxable" in html
    assert "Product discount" in html
    assert "Subtotal" in html
    assert "Received" in html
    assert "Balance due" in html
    assert "Amt" in html
    assert voucher.voucher_number in html
    assert "Amount in words" in html
    assert docs.build_pdf(payload, layout="a4").startswith(b"%PDF")
    assert docs.build_pdf(payload, layout=LAYOUT_THERMAL).startswith(b"%PDF")
    thermal_html = docs.render_html(payload, layout=LAYOUT_THERMAL)
    assert "thermal-items" in thermal_html
    assert "Bill to" in thermal_html
    assert "thermal-head" in thermal_html
    assert "Amt" in thermal_html
    assert "Received" in thermal_html
    assert "Product discount" in thermal_html

    link = docs.create_share_link(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="sale",
        document_id=voucher.id,
    )
    assert isinstance(link, ShopDocumentShareLink)
    assert "/open/shop-doc/" in docs.public_url_for(link)

    result = docs.send_document(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="sale",
        document_id=voucher.id,
        channels=["sms"],
    )
    assert result["channels"]["sms"]["status"] == "device_only"
    assert "View:" in result["channels"]["sms"]["message"]
    assert "Received" in result["channels"]["sms"]["message"]
    assert "Due" in result["channels"]["sms"]["message"]


@pytest.mark.django_db
def test_quotation_and_challan_document_kinds(shop_business, customer):
    product = _product(shop_business, name="Shampoo", price="200.00", gst_rate="18")
    quote = OrderService().create_quotation(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        lines=[{"product_id": product.id, "quantity": "1"}],
    )
    docs = ShopDocumentService()
    quote_payload = docs.build_payload(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="quotation",
        document_id=quote.id,
    )
    assert quote_payload["title"] == "QUOTATION"
    assert quote_payload["number"] == quote.quotation_number

    challan = DocumentsService().create_document(
        tenant=shop_business.tenant,
        business=shop_business,
        doc_type="delivery_challan",
        customer=customer,
        lines=[{"product_id": product.id, "quantity": "1"}],
    )
    challan_payload = docs.build_payload(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="delivery_challan",
        document_id=challan.id,
    )
    assert challan_payload["title"] == "DELIVERY CHALLAN"
    assert docs.build_pdf(challan_payload).startswith(b"%PDF")


@pytest.mark.django_db
def test_credit_and_debit_note_document_kinds(shop_business, customer):
    product = _product(shop_business, name="Returnable", price="100.00", gst_rate="18")
    books = BooksService()
    credit = books.create_credit_note(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "18"}],
            "amount_paid": "0",
        },
    )
    docs = ShopDocumentService()
    credit_payload = docs.build_payload(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="credit_note",
        document_id=credit.id,
    )
    assert credit_payload["kind"] == "credit_note"
    assert credit_payload["title"] == "CREDIT NOTE"
    assert credit_payload["number"] == credit.voucher_number
    assert "CREDIT NOTE" in docs.render_html(credit_payload)
    assert docs.build_pdf(credit_payload).startswith(b"%PDF")
    credit_link = docs.create_share_link(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="credit_note",
        document_id=credit.id,
    )
    assert isinstance(credit_link, ShopDocumentShareLink)
    assert credit_link.kind == "credit_note"

    supplier = ShopSupplier.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Vendor Co",
        phone="9876543210",
        email="vendor@example.com",
        gstin="27AAAAA0000A1Z5",
    )
    debit = books.create_debit_note(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "supplier": supplier,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "18"}],
            "amount_paid": "0",
            "metadata": {"supplier_gstin": supplier.gstin},
        },
    )
    debit_payload = docs.build_payload(
        tenant=shop_business.tenant,
        business=shop_business,
        kind="debit_note",
        document_id=debit.id,
    )
    assert debit_payload["kind"] == "debit_note"
    assert debit_payload["title"] == "DEBIT NOTE"
    assert debit_payload["number"] == debit.voucher_number
    assert debit_payload["buyer"]["name"] == "Vendor Co"
    assert debit_payload["customer_phone"] == "9876543210"
    assert debit_payload["customer_email"] == "vendor@example.com"
    assert docs.build_pdf(debit_payload).startswith(b"%PDF")
