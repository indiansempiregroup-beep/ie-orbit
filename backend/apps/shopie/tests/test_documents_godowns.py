from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

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
def test_delivery_challan_dispatches_stock_only_once(
    shop_business: Business, customer: Customer
) -> None:
    product = ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Dispatch Item",
        price=Decimal("75"),
        gst_rate=Decimal("5"),
        stock_on_hand=Decimal("10"),
    )
    docs = DocumentsService()
    document = docs.create_document(
        tenant=shop_business.tenant,
        business=shop_business,
        doc_type=BooksDocumentType.DELIVERY_CHALLAN,
        customer=customer,
        lines=[{"product_id": product.id, "quantity": "3", "unit_price": "75", "tax_rate": "5"}],
    )

    dispatched = docs.convert_document(
        tenant=shop_business.tenant,
        business=shop_business,
        document=document,
    )

    product.refresh_from_db()
    document.refresh_from_db()
    assert dispatched.id == document.id
    assert document.status == BooksDocumentStatus.DISPATCHED
    assert product.stock_on_hand == Decimal("7.000")

    with pytest.raises(ValidationError, match="already dispatched"):
        docs.convert_document(
            tenant=shop_business.tenant,
            business=shop_business,
            document=document,
        )
    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("7.000")


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
def test_godown_update_edits_details_and_moves_default(shop_business: Business) -> None:
    godowns = GodownsService()
    main = godowns.create_godown(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Main",
        is_default=True,
        address_line1="1 Old Road",
        city="Mumbai",
        country="India",
        latitude="19.0760",
        longitude="72.8777",
    )
    spare = godowns.create_godown(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Spare",
        address_line1="2 New Road",
        city="Mumbai",
        country="India",
        latitude="19.1800",
        longitude="72.8600",
    )

    updated = godowns.update_godown(
        tenant=shop_business.tenant,
        business=shop_business,
        godown=spare,
        data={"name": "Warehouse", "code": "WH1", "is_default": True},
    )
    main.refresh_from_db()

    assert updated.name == "Warehouse"
    assert updated.code == "WH1"
    assert updated.is_default is True
    assert main.is_default is False


@pytest.mark.django_db
def test_godown_update_rejects_office_locations(shop_business: Business) -> None:
    from django.core.exceptions import ValidationError

    from apps.shopie.tests.conftest import make_office

    branch = make_office(
        shop_business, name="Andheri", latitude="19.0760", longitude="72.8777", is_primary=True
    )
    godowns = GodownsService()
    godown = godowns.ensure_office_godown(
        tenant=shop_business.tenant, business=shop_business, branch=branch
    )

    with pytest.raises(ValidationError):
        godowns.update_godown(
            tenant=shop_business.tenant,
            business=shop_business,
            godown=godown,
            data={"name": "Renamed"},
        )


@pytest.mark.django_db
def test_catalog_stock_maps_to_default_godown(shop_business: Business) -> None:
    from apps.shopie.models import ShopGodownStock, StockMovementType
    from apps.shopie.services.catalog import CatalogService

    godowns = GodownsService()
    main = godowns.create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Main", is_default=True
    )
    catalog = CatalogService()
    product = catalog.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"name": "Oil", "price": "40", "stock_on_hand": "10"},
    )
    row = ShopGodownStock.objects.get(godown=main, product=product)
    assert row.quantity == Decimal("10.000")
    product = catalog.adjust_stock(
        tenant=shop_business.tenant,
        business=shop_business,
        product=product,
        quantity_delta=Decimal("-3"),
        movement_type=StockMovementType.SALE,
        reason="POS sale",
    )
    row.refresh_from_db()
    assert product.stock_on_hand == Decimal("7.000")
    assert row.quantity == Decimal("7.000")


@pytest.mark.django_db
def test_initial_stock_goes_to_selected_godown(shop_business: Business) -> None:
    from apps.shopie.models import ShopGodownStock
    from apps.shopie.services.catalog import CatalogService

    godowns = GodownsService()
    godowns.create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Shop", is_default=True
    )
    warehouse = godowns.create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Warehouse"
    )
    product = CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"name": "Rice", "price": "80", "stock_on_hand": "8", "godown_id": warehouse.id},
    )
    row = ShopGodownStock.objects.get(godown=warehouse, product=product)
    assert row.quantity == Decimal("8.000")
    assert not ShopGodownStock.objects.filter(godown__name="Shop", product=product).exists()


@pytest.mark.django_db
def test_catalog_stock_skips_godown_when_none_exist(
    shop_business: Business, monkeypatch: pytest.MonkeyPatch
) -> None:
    from apps.businesses.services.entitlements import EntitlementService
    from apps.shopie.models import ShopGodownStock
    from apps.shopie.services.catalog import CatalogService

    # Single-office shop with no godowns entitlement: stock stays product-level.
    monkeypatch.setattr(EntitlementService, "has_feature", lambda *args, **kwargs: False)

    CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"name": "Soap", "price": "20", "stock_on_hand": "5"},
    )
    assert ShopGodownStock.objects.count() == 0


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
