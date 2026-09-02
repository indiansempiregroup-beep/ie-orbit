from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import FulfillmentMode, OrderStatus, ProductStatus
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.shipment import ShipmentService
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shipment_ctx() -> tuple[Tenant, Business, Customer, object]:
    owner = User.objects.create_user(
        email="shipment-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="shipment-tenant", display_name="Shipment Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Shipment Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shipment-shop",
        business_name="Shipment Shop",
        display_name="Shipment Shop",
        selected_product="shopie",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="SHIP-CUSTOMER",
        display_name="Shipment Customer",
        first_name="Shipment",
        phone_number="+919988776655",
    )
    product = CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Test product",
            "price": Decimal("100"),
            "status": ProductStatus.ACTIVE,
            "track_inventory": False,
        },
    )
    return tenant, business, customer, product


@pytest.mark.django_db
def test_ship_order_creates_shipment_and_moves_out_for_delivery(shipment_ctx) -> None:
    tenant, business, customer, product = shipment_ctx

    DeliveryZoneService().create_zone(
        tenant=tenant,
        business=business,
        data={
            "name": "All India",
            "cities": [],
            "postal_prefixes": [],
            "fee": Decimal("49"),
            "enabled": True,
        },
    )

    order = OrderService().create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        delivery_address="12 MG Road, Nashik",
        delivery_city="Nashik",
        delivery_postal_code="422001",
        delivery_method="standard",
        lines=[{"product_id": product.id, "quantity": 1}],
        confirm=True,
    )
    order = OrderService().transition(
        tenant=tenant, business=business, order=order, status=OrderStatus.CONFIRMED, notify=False
    )
    order = OrderService().transition(
        tenant=tenant, business=business, order=order, status=OrderStatus.READY, notify=False
    )

    shipment = ShipmentService().ship_order(
        tenant=tenant,
        business=business,
        order=order,
        carrier="delhivery",
        tracking_number="AWB123456789",
        notify_customer=False,
    )
    order.refresh_from_db()

    assert shipment.carrier == "delhivery"
    assert shipment.tracking_number == "AWB123456789"
    assert "delhivery.com" in shipment.tracking_url
    assert order.status == OrderStatus.OUT_FOR_DELIVERY
    assert order.metadata["shipment"]["tracking_number"] == "AWB123456789"


@pytest.mark.django_db
def test_min_order_total_blocks_standard_delivery(shipment_ctx) -> None:
    tenant, business, customer, product = shipment_ctx

    DeliveryZoneService().create_zone(
        tenant=tenant,
        business=business,
        data={
            "name": "Premium zone",
            "cities": ["Nashik"],
            "postal_prefixes": [],
            "fee": Decimal("0"),
            "min_order_total": Decimal("500"),
            "enabled": True,
        },
    )

    with pytest.raises(ValidationError, match="Minimum order"):
        OrderService().create_order(
            tenant=tenant,
            business=business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.DELIVERY,
            delivery_address="12 MG Road, Nashik",
            delivery_city="Nashik",
            delivery_postal_code="422001",
            delivery_method="standard",
            lines=[{"product_id": product.id, "quantity": 1}],
            confirm=True,
        )
