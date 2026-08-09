from decimal import Decimal

import pytest

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    BooksDocumentStatus,
    BooksDocumentType,
    ChequeStatus,
    LoanStatus,
    ShopCashAccount,
    ShopProduct,
)
from apps.shopie.services.cheques import ChequesService
from apps.shopie.services.documents import DocumentsService
from apps.shopie.services.godowns import GodownsService
from apps.shopie.services.loans import LoansService


@pytest.mark.django_db
def test_sale_order_converts_to_sale(
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
    docs = DocumentsService()
    document = docs.create_document(
        tenant=shop_business.tenant,
        business=shop_business,
        doc_type=BooksDocumentType.SALE_ORDER,
        customer=customer,
        lines=[{"product_id": product.id, "quantity": "2", "unit_price": "100", "tax_rate": "0"}],
    )
    assert document.doc_type == BooksDocumentType.SALE_ORDER
    voucher = docs.convert_document(
        tenant=shop_business.tenant,
        business=shop_business,
        document=document,
        amount_paid="0",
    )
    document.refresh_from_db()
    assert document.status == BooksDocumentStatus.CONVERTED
    assert voucher.total == Decimal("200.00")


@pytest.mark.django_db
def test_godown_transfer_moves_location_stock(shop_business: Business) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Bag",
        price=Decimal("50"),
        stock_on_hand=Decimal("20"),
    )
    godowns = GodownsService()
    main = godowns.create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Main", is_default=True
    )
    secondary = godowns.create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Secondary"
    )
    # Seed stock into main godown
    godowns._adjust_godown_stock(
        tenant=shop_business.tenant,
        business=shop_business,
        godown=main,
        product=product,
        delta=Decimal("10"),
    )
    transfer = godowns.transfer_stock(
        tenant=shop_business.tenant,
        business=shop_business,
        from_godown_id=main.id,
        to_godown_id=secondary.id,
        lines=[{"product_id": product.id, "quantity": "4"}],
    )
    assert transfer.from_godown_id == main.id
    from apps.shopie.models import ShopGodownStock

    main_stock = ShopGodownStock.objects.get(godown=main, product=product)
    sec_stock = ShopGodownStock.objects.get(godown=secondary, product=product)
    assert main_stock.quantity == Decimal("6.000")
    assert sec_stock.quantity == Decimal("4.000")


@pytest.mark.django_db
def test_cheque_clear_creates_payment_in(
    shop_business: Business, customer: Customer, cash_account: ShopCashAccount
) -> None:
    cheques = ChequesService()
    cheque = cheques.create_cheque(
        tenant=shop_business.tenant,
        business=shop_business,
        direction="in",
        amount="150",
        cheque_number="CHQ-1",
        customer=customer,
        cash_account=cash_account,
    )
    cleared = cheques.clear_cheque(
        tenant=shop_business.tenant,
        business=shop_business,
        cheque=cheque,
        cash_account_id=cash_account.id,
    )
    assert cleared.status == ChequeStatus.CLEARED
    assert cleared.linked_voucher_id is not None


@pytest.mark.django_db
def test_loan_repayment_closes_when_paid(
    shop_business: Business, customer: Customer
) -> None:
    loans = LoansService()
    loan = loans.create_loan(
        tenant=shop_business.tenant,
        business=shop_business,
        title="Advance",
        principal="100",
        customer=customer,
    )
    loans.record_repayment(
        tenant=shop_business.tenant, business=shop_business, loan=loan, amount="100"
    )
    loan.refresh_from_db()
    assert loan.balance == Decimal("0.00")
    assert loan.status == LoanStatus.CLOSED
