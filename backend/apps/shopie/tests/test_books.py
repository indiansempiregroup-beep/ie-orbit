from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import CashAccountType, ShopCashAccount, ShopProduct
from apps.shopie.services.books import BooksService
from apps.shopie.services.gst import split_gst
from apps.shopie.services.suppliers import SupplierService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="books-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="books-tenant", display_name="Books Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Books Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="books-biz",
        business_name="Books Biz",
        display_name="Books Biz",
        selected_product="shopie",
    )


@pytest.fixture
def customer(shop_business: Business) -> Customer:
    return Customer.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        customer_code="cust-1",
        first_name="Test",
        last_name="Buyer",
        display_name="Test Buyer",
    )


@pytest.fixture
def cash_account(shop_business: Business) -> ShopCashAccount:
    return ShopCashAccount.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Cash Drawer",
        account_type=CashAccountType.CASH,
        opening_balance=Decimal("500"),
        current_balance=Decimal("500"),
    )


def test_split_gst_intrastate_splits_evenly() -> None:
    result = split_gst(Decimal("1000"), Decimal("18"), interstate=False)
    assert result["cgst"] == Decimal("90.00")
    assert result["sgst"] == Decimal("90.00")
    assert result["igst"] == Decimal("0.00")
    assert result["tax_total"] == Decimal("180.00")


def test_split_gst_interstate_uses_igst() -> None:
    result = split_gst(Decimal("1000"), Decimal("18"), interstate=True)
    assert result["cgst"] == Decimal("0.00")
    assert result["igst"] == Decimal("180.00")


def test_compute_line_tax_inclusive_extracts_gst() -> None:
    from apps.shopie.services.gst import compute_line

    # MRP 118 inclusive of 18% GST → taxable 100, tax 18, total 118
    result = compute_line(
        {"qty": "1", "rate": "118", "gst_rate": "18", "tax_inclusive": True},
        interstate=False,
    )
    assert result["taxable"] == Decimal("100.00")
    assert result["total"] == Decimal("118.00")
    assert result["cgst"] + result["sgst"] == Decimal("18.00")


@pytest.mark.django_db
def test_sale_voucher_respects_product_tax_inclusive(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Inclusive Soap",
        price=Decimal("118.00"),
        tax_rate=Decimal("18"),
        gst_rate=Decimal("18"),
        stock_on_hand=Decimal("10"),
        metadata={"tax_inclusive": True},
    )
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "118", "gst_rate": "18"}],
            "amount_paid": "118",
            "cash_account_id": cash_account.id,
        },
    )
    assert voucher.tax_total == Decimal("18.00")
    assert voucher.total == Decimal("118.00")
    assert voucher.subtotal == Decimal("100.00")


@pytest.mark.django_db
def test_create_sale_voucher_updates_stock_ledger_and_cash(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Widget",
        price=Decimal("100"),
        gst_rate=Decimal("18"),
        hsn_sac="8471",
        stock_on_hand=Decimal("10"),
    )
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "2", "rate": "150", "gst_rate": "18"}],
            "amount_paid": "100",
            "cash_account_id": cash_account.id,
        },
    )
    assert voucher.total == Decimal("354.00")
    assert voucher.cgst_total == Decimal("27.00")
    assert voucher.sgst_total == Decimal("27.00")

    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("8")

    cash_account.refresh_from_db()
    assert cash_account.current_balance == Decimal("600.00")

    statement = books.party_statement(
        tenant=shop_business.tenant,
        business=shop_business,
        party_kind="customer",
        party_id=customer.id,
    )
    assert statement["closing_balance"] == "254.00"

    dashboard = books.get_dashboard_metrics(tenant=shop_business.tenant, business=shop_business)
    assert dashboard["to_collect"] == "254.00"


@pytest.mark.django_db
def test_gstr1_uses_customer_gstin_for_direct_books_sale(
    shop_business: Business, customer: Customer
) -> None:
    customer.gstin = "27ABCDE1234F1Z5"
    customer.save(update_fields=["gstin"])
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="GST Item",
        price=Decimal("100"),
        gst_rate=Decimal("18"),
        stock_on_hand=Decimal("5"),
    )
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "18"}],
        },
    )

    rows = books.gstr1_rows(tenant=shop_business.tenant, business=shop_business)

    row = next(item for item in rows if item["voucher_number"] == voucher.voucher_number)
    assert row["invoice_type"] == "B2B"
    assert row["customer_gstin"] == "27ABCDE1234F1Z5"
    assert row["customer_name"] == "Test Buyer"


@pytest.mark.django_db
def test_purchase_voucher_updates_supplier_ledger_and_stock(shop_business: Business) -> None:
    supplier = SupplierService().create_supplier(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"name": "Acme Supplies", "opening_balance": "1000"},
    )
    bank = ShopCashAccount.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Bank",
        account_type=CashAccountType.BANK,
    )
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Widget",
        price=Decimal("100"),
        gst_rate=Decimal("18"),
    )
    books = BooksService()
    voucher = books.create_purchase_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "supplier": supplier,
            "lines": [{"product_id": product.id, "qty": "10", "rate": "100", "gst_rate": "18"}],
            "amount_paid": "500",
            "cash_account_id": bank.id,
        },
    )
    assert voucher.total == Decimal("1180.00")
    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("10")

    statement = books.party_statement(
        tenant=shop_business.tenant,
        business=shop_business,
        party_kind="supplier",
        party_id=supplier.id,
    )
    # opening 1000 + purchase 1180 - paid 500 = 1680 owed to supplier
    assert statement["closing_balance"] == "1680.00"


@pytest.mark.django_db
def test_void_sale_voucher_reverses_effects(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Widget",
        price=Decimal("100"),
        stock_on_hand=Decimal("10"),
    )
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "2", "rate": "100", "gst_rate": "0"}],
            "amount_paid": "200",
            "cash_account_id": cash_account.id,
        },
    )
    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("8")

    voided = books.void_voucher(
        tenant=shop_business.tenant, business=shop_business, voucher=voucher
    )
    assert voided.status == "void"

    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("10")

    cash_account.refresh_from_db()
    assert cash_account.current_balance == Decimal("500.00")

    with pytest.raises(ValidationError):
        books.void_voucher(tenant=shop_business.tenant, business=shop_business, voucher=voided)


@pytest.mark.django_db
def test_payment_in_reduces_receivable(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    books = BooksService()
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant, business=shop_business, name="Widget", price=Decimal("100")
    )
    books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "0"}],
        },
    )
    books.create_payment_in(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"customer": customer, "cash_account_id": cash_account.id, "amount": "40"},
    )
    statement = books.party_statement(
        tenant=shop_business.tenant,
        business=shop_business,
        party_kind="customer",
        party_id=customer.id,
    )
    assert statement["closing_balance"] == "60.00"


@pytest.mark.django_db
def test_credit_note_returns_stock_and_reduces_receivable(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Widget",
        price=Decimal("100"),
        gst_rate=Decimal("0"),
        stock_on_hand=Decimal("10"),
    )
    books = BooksService()
    books.create_sale_voucher(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "2", "rate": "100", "gst_rate": "0"}],
        },
    )
    note = books.create_credit_note(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "100", "gst_rate": "0"}],
            "amount_paid": "0",
        },
    )
    assert note.voucher_type == "credit_note"
    assert note.total == Decimal("100.00")

    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("9")

    statement = books.party_statement(
        tenant=shop_business.tenant,
        business=shop_business,
        party_kind="customer",
        party_id=customer.id,
    )
    assert statement["closing_balance"] == "100.00"


@pytest.mark.django_db
def test_confirmed_pos_order_creates_sale_invoice(
    shop_business: Business, customer: Customer
) -> None:
    from apps.shopie.models import FulfillmentMode, ProductStatus, ShopBooksVoucher, VoucherType
    from apps.shopie.services.catalog import CatalogService
    from apps.shopie.services.orders import OrderService

    catalog = CatalogService()
    orders = OrderService()
    product = catalog.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Counter Item",
            "price": "50.00",
            "tax_rate": "0",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "20",
        },
    )
    order = orders.create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
        lines=[{"product_id": str(product.id), "quantity": 2}],
    )
    voucher = ShopBooksVoucher.objects.filter(
        tenant=shop_business.tenant,
        business=shop_business,
        linked_order=order,
        voucher_type=VoucherType.SALE,
    ).first()
    assert voucher is not None
    assert voucher.total == order.total
    assert voucher.amount_paid == order.total
    assert "Sale" in (voucher.notes or "")
