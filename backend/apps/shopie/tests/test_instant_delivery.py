from decimal import Decimal
import json

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ShopDeliveryZone,
    ShopOrder,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.delivery import DeliveryService, normalize_partner_status
from apps.shopie.services.delivery.providers import MockDeliveryProvider
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Organization, Tenant


def test_mock_provider_quote_and_status_normalization() -> None:
    quote = MockDeliveryProvider().quote(
        {
            "pickup": {"latitude": 19.076, "longitude": 72.8777},
            "drop": {"latitude": 19.086, "longitude": 72.8877},
        }
    )
    assert quote.fee > Decimal("35")
    assert quote.eta_minutes >= 20
    assert normalize_partner_status("driver_assigned") == "rider_assigned"
    assert normalize_partner_status("out-for-delivery") == "picked_up"


@pytest.fixture
def delivery_ctx() -> tuple[Tenant, Business, Customer]:
    owner = User.objects.create_user(
        email="delivery-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="delivery-tenant",
        display_name="Delivery Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Delivery Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="delivery-shop",
        business_name="Delivery Shop",
        display_name="Delivery Shop",
        selected_product="shopie",
        address_line1="1 Shop Road",
        city="Mumbai",
        postal_code="400001",
        latitude=Decimal("19.076000"),
        longitude=Decimal("72.877700"),
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="DELIVERY-CUSTOMER",
        display_name="Delivery Customer",
        first_name="Delivery",
        phone_number="+919999999999",
    )
    ShopDeliveryZone.objects.create(
        tenant=tenant,
        business=business,
        name="Instant service area",
        instant_delivery_enabled=True,
    )
    return tenant, business, customer


@pytest.mark.django_db
def test_mock_quote_allocates_and_masks_credentials(delivery_ctx) -> None:
    tenant, business, _ = delivery_ctx
    service = DeliveryService()
    settings = service.update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={
            "provider": "mock",
            "charge_bearer": "split",
            "merchant_absorb_cap": "20",
            "credentials": {"api_key": "secret-key"},
        },
    )
    assert str(settings.delivery_integration["credentials"]["api_key"]).startswith("enc:")
    assert service.public_settings(settings)["delivery_integration"]["credentials"]["api_key"] == (
        "••••••••"
    )

    quote = service.quote(
        tenant=tenant,
        business=business,
        drop={
            "latitude": Decimal("19.086000"),
            "longitude": Decimal("72.887700"),
            "address": "2 Customer Road",
        },
        subtotal=Decimal("500"),
    )

    assert quote["available"] is True
    assert quote["provider"] == "mock"
    assert Decimal(quote["quoted_fee"]) == Decimal(quote["customer_fee"]) + Decimal(
        quote["merchant_fee"]
    )
    assert Decimal(quote["merchant_fee"]) == Decimal("20.00")


@pytest.mark.django_db
def test_customer_can_explicitly_choose_instant_delivery(delivery_ctx) -> None:
    tenant, business, customer = delivery_ctx
    DeliveryService().update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer"},
    )
    product = CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Instant item",
            "price": "250.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
        },
    )

    order = OrderService().create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        delivery_method="instant",
        delivery_address="2 Customer Road",
        delivery_city="Mumbai",
        delivery_postal_code="400002",
        delivery_latitude=Decimal("19.086000"),
        delivery_longitude=Decimal("72.887700"),
        lines=[{"product_id": str(product.id), "quantity": 1}],
    )

    assert order.metadata["delivery_method"] == "instant"
    assert order.metadata["delivery"]["quote_id"].startswith("mock_quote_")
    assert order.metadata["delivery"]["partner_status"] == "packing"


@pytest.mark.django_db
def test_instant_delivery_requires_an_enabled_delivery_zone(delivery_ctx) -> None:
    tenant, business, _ = delivery_ctx
    DeliveryService().update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer"},
    )
    zone = business.shop_delivery_zones.get()
    zone.instant_delivery_enabled = False
    zone.save(update_fields=["instant_delivery_enabled", "updated_at"])

    quote = DeliveryService().quote(
        tenant=tenant,
        business=business,
        drop={
            "latitude": Decimal("19.086000"),
            "longitude": Decimal("72.887700"),
            "address": "2 Customer Road",
        },
        subtotal=Decimal("500"),
    )

    assert quote == {
        "available": False,
        "reason": "instant_delivery_disabled_for_zone",
    }


@pytest.mark.django_db
def test_dispatch_and_tracking_update_order(delivery_ctx) -> None:
    tenant, business, customer = delivery_ctx
    service = DeliveryService()
    service.update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer"},
    )
    quote = service.quote(
        tenant=tenant,
        business=business,
        drop={
            "latitude": Decimal("19.086000"),
            "longitude": Decimal("72.887700"),
            "address": "2 Customer Road",
        },
        subtotal=Decimal("500"),
    )
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-DELIVERY-1",
        status=OrderStatus.READY,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        currency="INR",
        total=Decimal("500"),
        delivery_address="2 Customer Road",
        metadata={
            "delivery": {
                **quote,
                "partner_status": "packing",
                "events": [],
            }
        },
    )

    dispatched = service.dispatch(order=order)
    delivery = dispatched.metadata["delivery"]
    assert delivery["booking_id"].startswith("mock_delivery_")
    assert delivery["partner_status"] == "rider_assigned"

    tracked = service.apply_tracking(
        order=dispatched,
        payload={
            "status": "out_for_delivery",
            "rider": {
                "name": "Ravi",
                "phone": "+919876543210",
                "location": {"lat": 19.08, "lng": 72.88},
            },
            "eta_minutes": 8,
        },
    )
    assert tracked.status == OrderStatus.OUT_FOR_DELIVERY
    assert tracked.metadata["delivery"]["partner_status"] == "picked_up"
    assert tracked.metadata["delivery"]["rider"]["name"] == "Ravi"


def test_shiprocket_logs_in_and_quotes_from_serviceability(monkeypatch) -> None:
    from apps.shopie.services.delivery.providers import ShiprocketQuickProvider

    calls: list[str] = []

    class FakeResponse:
        def __init__(self, payload: dict) -> None:
            self._payload = json.dumps(payload).encode()

        def read(self) -> bytes:
            return self._payload

        def __enter__(self):
            return self

        def __exit__(self, *args) -> None:
            return None

    def fake_urlopen(request, timeout=15):
        url = request.full_url
        calls.append(f"{request.get_method()} {url}")
        if url.endswith("/auth/login"):
            return FakeResponse({"token": "sr-token"})
        if "courier/serviceability" in url:
            return FakeResponse(
                {
                    "data": {
                        "available_courier_companies": [
                            {
                                "courier_company_id": 10,
                                "courier_name": "Delhivery Surface",
                                "rate": 80,
                                "estimated_delivery_days": "2",
                            },
                            {
                                "courier_company_id": 22,
                                "courier_name": "Shiprocket Quick",
                                "rate": 49,
                                "estimated_delivery_days": "0",
                            },
                        ]
                    }
                }
            )
        raise AssertionError(url)

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    quote = ShiprocketQuickProvider(
        {"email": "api-user@example.com", "password": "secret"}
    ).quote(
        {
            "pickup": {"postal_code": "400001", "latitude": 19.07, "longitude": 72.87},
            "drop": {"postal_code": "400002", "latitude": 19.08, "longitude": 72.88},
        }
    )

    assert quote.fee == Decimal("49")
    assert quote.eta_minutes == 45
    assert quote.provider == "shiprocket_quick"
    assert any("/auth/login" in item for item in calls)
    assert any("pickup_postcode=400001" in item for item in calls)


def test_shiprocket_quote_requires_pin_codes() -> None:
    from django.core.exceptions import ValidationError

    from apps.shopie.services.delivery.providers import ShiprocketQuickProvider

    with pytest.raises(ValidationError):
        ShiprocketQuickProvider({"api_key": "tok"}).quote(
            {
                "pickup": {"latitude": 19.07, "longitude": 72.87},
                "drop": {"latitude": 19.08, "longitude": 72.88},
            }
        )
