from __future__ import annotations

import json
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Branch, BranchStatus, Business
from apps.customers.models import Customer
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ShipmentStatus,
    ShopBusinessSettings,
    ShopShipment,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.shiprocket_standard import (
    ShiprocketStandardProvider,
    ShiprocketStandardService,
)
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shiprocket_ctx() -> tuple[Tenant, Business, Customer, object, Branch]:
    owner = User.objects.create_user(
        email="shiprocket-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="shiprocket-tenant", display_name="Shiprocket Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Shiprocket Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shiprocket-shop",
        business_name="Shiprocket Shop",
        display_name="Shiprocket Shop",
        selected_product="shopie",
        address_line1="Warehouse 1",
        city="Mumbai",
        state="Maharashtra",
        postal_code="400001",
        latitude=19.076,
        longitude=72.8777,
    )
    branch = Branch.objects.create(
        tenant=tenant,
        business=business,
        name="Primary",
        address_line1="Warehouse 1",
        city="Mumbai",
        state="Maharashtra",
        postal_code="400001",
        latitude=19.076,
        longitude=72.8777,
        is_primary=True,
        status=BranchStatus.ACTIVE,
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="SR-CUSTOMER",
        display_name="Shiprocket Customer",
        first_name="Shiprocket",
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
    settings = ShopBusinessSettings.objects.get(tenant=tenant, business=business)
    settings.delivery_integration = {
        "provider": "shiprocket_quick",
        "credentials": {"email": "api@example.com", "password": "secret"},
    }
    settings.metadata = {"courier_integration": {"enabled": True}}
    settings.save()
    return tenant, business, customer, product, branch


def _ready_delivery_order(ctx) -> object:
    tenant, business, customer, product, _branch = ctx
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
        delivery_state="Maharashtra",
        delivery_postal_code="422001",
        delivery_method="standard",
        lines=[{"product_id": product.id, "quantity": 1}],
        confirm=True,
    )
    order = OrderService().transition(
        tenant=tenant, business=business, order=order, status=OrderStatus.CONFIRMED, notify=False
    )
    return OrderService().transition(
        tenant=tenant, business=business, order=order, status=OrderStatus.READY, notify=False
    )


@pytest.mark.django_db
def test_shiprocket_standard_provider_prefers_non_quick_courier() -> None:
    provider = ShiprocketStandardProvider({"api_key": "tok"})
    company = provider._pick_courier(
        [
            {"courier_name": "SR Quick", "rate": "80"},
            {"courier_name": "Delhivery Surface", "rate": "90"},
        ]
    )
    assert company["courier_name"] == "Delhivery Surface"


@pytest.mark.django_db
def test_book_order_creates_shipment(monkeypatch, shiprocket_ctx) -> None:
    order = _ready_delivery_order(shiprocket_ctx)

    def fake_book_standard(self, payload):  # noqa: ANN001
        return {
            "provider": "shiprocket_standard",
            "shipment_id": "998877",
            "courier_company_id": "12",
            "courier_label": "Delhivery",
            "tracking_number": "SRX123456",
            "tracking_url": "https://shiprocket.co/tracking/SRX123456",
            "estimated_delivery_at": "2026-09-05",
            "fee": "65.00",
        }

    monkeypatch.setattr(ShiprocketStandardProvider, "book_standard", fake_book_standard)

    shipment = ShiprocketStandardService().book_order(order=order, notify_customer=False)
    order.refresh_from_db()

    assert shipment.tracking_number == "SRX123456"
    assert shipment.metadata["provider"] == "shiprocket_standard"
    assert order.status == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_process_webhook_updates_shipment_status(shiprocket_ctx) -> None:
    tenant, business, customer, product, _branch = shiprocket_ctx
    order = _ready_delivery_order(shiprocket_ctx)
    shipment = ShopShipment.objects.create(
        tenant=tenant,
        business=business,
        order=order,
        carrier="shiprocket",
        carrier_label="Delhivery",
        tracking_number="AWB-WEBHOOK",
        tracking_url="https://shiprocket.co/tracking/AWB-WEBHOOK",
        status=ShipmentStatus.SHIPPED,
    )
    shipment.metadata = {"provider": "shiprocket_standard", "shiprocket_shipment_id": "555"}
    shipment.save(update_fields=["metadata", "updated_at"])

    result = ShiprocketStandardService().process_webhook(
        business=business,
        body=json.dumps({"awb": "AWB-WEBHOOK", "shipment_status": "OUT FOR DELIVERY"}).encode(),
    )
    shipment.refresh_from_db()

    assert result["accepted"] is True
    assert shipment.status == ShipmentStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_book_order_requires_delivery_postal_code(shiprocket_ctx) -> None:
    tenant, business, customer, product, _branch = shiprocket_ctx
    order = OrderService().create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        delivery_address="12 MG Road",
        delivery_method="standard",
        lines=[{"product_id": product.id, "quantity": 1}],
        confirm=True,
    )
    order = OrderService().transition(
        tenant=tenant, business=business, order=order, status=OrderStatus.READY, notify=False
    )

    with pytest.raises(ValidationError):
        ShiprocketStandardService().book_order(order=order, notify_customer=False)
