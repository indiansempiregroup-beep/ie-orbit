from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import pytest

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ShopGodownStock,
    ShopProduct,
)
from apps.shopie.services.delivery import DeliveryService
from apps.shopie.services.fulfillment import FulfillmentService
from apps.shopie.services.godowns import GodownsService
from apps.shopie.services.orders import OrderService
from apps.shopie.tests.conftest import make_office

# Two offices ~12 km apart in Mumbai.
NEAR_A = ("19.076000", "72.877700")
NEAR_B = ("19.180000", "72.860000")


@dataclass
class CartLine:
    """Stands in for an unsaved ShopOrderLine when testing ranking directly."""

    product_id: UUID
    product_name: str
    quantity: Decimal
    line_total: Decimal


def _product(business: Business, name: str, stock: str, price: str = "100") -> ShopProduct:
    return ShopProduct.objects.create(
        tenant=business.tenant,
        business=business,
        name=name,
        price=Decimal(price),
        gst_rate=Decimal("0"),
        stock_on_hand=Decimal(stock),
    )


def _stock_at(business: Business, office_name: str, product: ShopProduct, qty: str) -> None:
    godowns = GodownsService().sync_office_godowns(tenant=business.tenant, business=business)
    godown = next(g for b, g in godowns if b.display_name == office_name)
    row, _ = ShopGodownStock.objects.get_or_create(
        tenant=business.tenant,
        business=business,
        godown=godown,
        product=product,
        defaults={"quantity": Decimal("0")},
    )
    row.quantity = Decimal(qty)
    row.save()


@pytest.mark.django_db
def test_every_office_gets_its_own_stock_location(shop_business: Business) -> None:
    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])

    offices = GodownsService().sync_office_godowns(
        tenant=shop_business.tenant, business=shop_business
    )

    assert [branch.display_name for branch, _ in offices] == ["Andheri", "Borivali"]
    assert {godown.branch_id for _, godown in offices} == {branch.id for branch, _ in offices}
    # Re-running is idempotent rather than creating duplicates.
    again = GodownsService().sync_office_godowns(
        tenant=shop_business.tenant, business=shop_business
    )
    assert [g.id for _, g in again] == [g.id for _, g in offices]


@pytest.mark.django_db
def test_primary_office_adopts_legacy_stock_location(shop_business: Business) -> None:
    legacy = GodownsService().create_godown(
        tenant=shop_business.tenant, business=shop_business, name="Main", is_default=True
    )
    assert legacy.branch_id is None

    primary = make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    adopted = GodownsService().ensure_office_godown(
        tenant=shop_business.tenant, business=shop_business, branch=primary
    )

    assert adopted.id == legacy.id
    assert adopted.branch_id == primary.id


@pytest.mark.django_db
def test_source_office_is_the_one_that_can_cover_the_order(shop_business: Business) -> None:
    near = make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    far = make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    product = _product(shop_business, "Widget", stock="12")
    _stock_at(shop_business, "Andheri", product, "1")
    _stock_at(shop_business, "Borivali", product, "10")

    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[{"product_id": str(product.id), "quantity": "5"}],
        fulfillment_mode=FulfillmentMode.POS,
        delivery_latitude=Decimal(NEAR_A[0]),
        delivery_longitude=Decimal(NEAR_A[1]),
    )

    fulfillment = order.metadata["fulfillment"]
    # The near office holds only 1 unit, so the far office wins on coverage.
    assert fulfillment["branch_id"] == str(far.id)
    assert fulfillment["branch_name"] == "Borivali"
    assert fulfillment["shortfall"] == []
    assert fulfillment["branch_id"] != str(near.id)


@pytest.mark.django_db
def test_nearest_office_wins_when_both_can_cover(shop_business: Business) -> None:
    near = make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    product = _product(shop_business, "Widget", stock="40")
    _stock_at(shop_business, "Andheri", product, "20")
    _stock_at(shop_business, "Borivali", product, "20")

    source = FulfillmentService().select_source_office(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[
            CartLine(
                product_id=product.id,
                product_name=product.name,
                quantity=Decimal("2"),
                line_total=Decimal("200.00"),
            )
        ],
        drop_latitude=Decimal(NEAR_A[0]),
        drop_longitude=Decimal(NEAR_A[1]),
    )

    assert source is not None
    assert source.branch.id == near.id
    assert source.is_complete
    assert source.distance_km is not None and source.distance_km < 1


@pytest.mark.django_db
def test_addressed_standalone_godown_can_fulfill_online_order(shop_business: Business) -> None:
    product = _product(shop_business, "Warehouse item", stock="10")
    godown = GodownsService().create_godown(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Bhiwandi warehouse",
        address_line1="Warehouse Road",
        city="Bhiwandi",
        state="Maharashtra",
        country="India",
        postal_code="421302",
        latitude=Decimal(NEAR_B[0]),
        longitude=Decimal(NEAR_B[1]),
        require_address=True,
    )
    ShopGodownStock.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        godown=godown,
        product=product,
        quantity=Decimal("8"),
    )
    make_office(
        shop_business,
        name="Andheri office",
        latitude=NEAR_A[0],
        longitude=NEAR_A[1],
        is_primary=True,
    )

    source = FulfillmentService().select_source_office(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[
            CartLine(
                product_id=product.id,
                product_name=product.name,
                quantity=Decimal("2"),
                line_total=Decimal("200.00"),
            )
        ],
        drop_latitude=Decimal(NEAR_B[0]),
        drop_longitude=Decimal(NEAR_B[1]),
    )

    assert source is not None
    assert source.branch is None
    assert source.godown == godown
    assert source.location["source_type"] == "godown"
    assert source.as_metadata()["pickup"]["postal_code"] == "421302"


@pytest.mark.django_db
def test_partial_coverage_records_backorder_and_still_confirms(shop_business: Business) -> None:
    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    product = _product(shop_business, "Widget", stock="30")
    _stock_at(shop_business, "Andheri", product, "2")
    _stock_at(shop_business, "Borivali", product, "4")

    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[{"product_id": str(product.id), "quantity": "6"}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
    )

    fulfillment = order.metadata["fulfillment"]
    assert fulfillment["branch_name"] == "Borivali"
    assert fulfillment["shortfall"][0]["needed"] == "6.000"
    assert fulfillment["shortfall"][0]["available"] == "4.000"
    assert order.status == OrderStatus.CONFIRMED
    # Business-wide stock still drops by the full quantity; the office goes negative
    # by the backordered amount so the two stay reconcilable.
    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("24.000")
    godowns = GodownsService().sync_office_godowns(
        tenant=shop_business.tenant, business=shop_business
    )
    borivali = next(g for b, g in godowns if b.display_name == "Borivali")
    borivali_stock = ShopGodownStock.objects.get(godown=borivali, product=product)
    assert borivali_stock.quantity == Decimal("-2.000")


@pytest.mark.django_db
def test_confirm_draws_from_the_source_office_only(shop_business: Business) -> None:
    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    product = _product(shop_business, "Widget", stock="50")
    _stock_at(shop_business, "Andheri", product, "1")
    _stock_at(shop_business, "Borivali", product, "30")

    OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[{"product_id": str(product.id), "quantity": "3"}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
    )

    godowns = GodownsService().sync_office_godowns(
        tenant=shop_business.tenant, business=shop_business
    )
    quantities = {
        branch.display_name: ShopGodownStock.objects.get(godown=godown, product=product).quantity
        for branch, godown in godowns
    }
    assert quantities == {"Andheri": Decimal("1.000"), "Borivali": Decimal("27.000")}


@pytest.mark.django_db
def test_shop_without_offices_keeps_working(shop_business: Business) -> None:
    product = _product(shop_business, "Widget", stock="10")

    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        lines=[{"product_id": str(product.id), "quantity": "2"}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
    )

    assert "fulfillment" not in order.metadata
    product.refresh_from_db()
    assert product.stock_on_hand == Decimal("8.000")


@pytest.mark.django_db
def test_office_availability_reports_quantity_per_office(shop_business: Business) -> None:
    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    product = _product(shop_business, "Widget", stock="9")
    _stock_at(shop_business, "Andheri", product, "4")
    _stock_at(shop_business, "Borivali", product, "5")

    offices = FulfillmentService().office_availability(
        tenant=shop_business.tenant,
        business=shop_business,
        product_ids=[product.id],
    )

    assert [(o["branch_name"], o["quantities"][str(product.id)]) for o in offices] == [
        ("Andheri", "4.000"),
        ("Borivali", "5.000"),
    ]
    assert offices[0]["is_primary"] is True


@pytest.mark.django_db
def test_pickup_prefers_primary_office_then_falls_back(shop_business: Business) -> None:
    service = DeliveryService()
    assert service.pickup_source(business=shop_business) is None

    make_office(shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1])
    primary = make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )

    source = service.pickup_source(business=shop_business)
    assert source is not None
    assert source["branch_id"] == str(primary.id)
    assert source["city"] == "Mumbai"

    # An explicit source office overrides the primary.
    borivali = next(b for b in shop_business.branches.all() if b.display_name == "Borivali")
    override = service.pickup_source(business=shop_business, branch=borivali)
    assert override is not None
    assert override["branch_id"] == str(borivali.id)


@pytest.mark.django_db
def test_enabling_delivery_requires_an_office_pin(
    shop_business: Business, customer: Customer
) -> None:
    from django.core.exceptions import ValidationError

    service = DeliveryService()
    with pytest.raises(ValidationError) as excinfo:
        service.update_settings(
            tenant=shop_business.tenant,
            business=shop_business,
            enabled=True,
            incoming={"provider": "mock"},
        )
    assert "Settings" in str(excinfo.value)

    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    settings = service.update_settings(
        tenant=shop_business.tenant,
        business=shop_business,
        enabled=True,
        incoming={"provider": "mock"},
    )
    assert settings.instant_delivery_enabled is True


@pytest.mark.django_db
def test_quote_pickup_uses_the_source_office(shop_business: Business) -> None:
    service = DeliveryService()
    make_office(
        shop_business, name="Andheri", latitude=NEAR_A[0], longitude=NEAR_A[1], is_primary=True
    )
    borivali = make_office(
        shop_business, name="Borivali", latitude=NEAR_B[0], longitude=NEAR_B[1]
    )
    service.update_settings(
        tenant=shop_business.tenant,
        business=shop_business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer"},
    )

    quote = service.quote(
        tenant=shop_business.tenant,
        business=shop_business,
        drop={
            "latitude": Decimal("19.086000"),
            "longitude": Decimal("72.887700"),
            "address": "2 Customer Road",
        },
        subtotal=Decimal("500"),
        branch=borivali,
    )

    assert quote["available"] is True
    assert quote["pickup"]["branch_id"] == str(borivali.id)
    # Coordinates must be JSON-safe so the quote can live on order metadata.
    assert isinstance(quote["pickup"]["latitude"], float)
    assert isinstance(quote["drop"]["latitude"], float)
