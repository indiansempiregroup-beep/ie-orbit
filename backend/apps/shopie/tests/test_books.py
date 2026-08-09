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
