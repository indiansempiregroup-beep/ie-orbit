import hashlib
import hmac
import json
from decimal import Decimal

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ShopDeliveryAttempt,
    ShopDeliveryWebhookEvent,
    ShopDeliveryZone,
    ShopOrder,
    ShopOrderTrackingEvent,
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


def test_mock_provider_advances_with_elapsed_time() -> None:
    provider = MockDeliveryProvider()
    fresh = provider.book({"eta_minutes": 20})

    assert provider.track(fresh["booking_id"])["partner_status"] == "rider_assigned"
    assert provider.track("mock_delivery_1700000000_abc")["partner_status"] == "delivered"
    # Bookings created before the id carried a timestamp must still track.
    assert provider.track("mock_delivery_abc")["partner_status"] == "rider_assigned"
    assert provider.track(fresh["booking_id"])["rider"]["name"] == "Demo rider"


def _quoted_order(delivery_ctx, service: DeliveryService) -> ShopOrder:
    """A delivery order that has a quote but no rider booking yet."""
    tenant, business, customer = delivery_ctx
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
    return ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-DELIVERY-LIFECYCLE",
        status=OrderStatus.READY,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        currency="INR",
        total=Decimal("500"),
        delivery_address="2 Customer Road",
        metadata={"delivery": {**quote, "partner_status": "packing", "events": []}},
    )


def _dispatched_order(delivery_ctx, service: DeliveryService) -> ShopOrder:
    return service.dispatch(order=_quoted_order(delivery_ctx, service))


@pytest.mark.django_db
def test_refresh_keeps_rider_details_when_payload_omits_them(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    assert order.metadata["delivery"]["rider"]["name"] == "Demo rider"

    refreshed = service.apply_tracking(
        order=order,
        payload={"status": "at_pickup", "eta_minutes": 5},
    )

    rider = refreshed.metadata["delivery"]["rider"]
    assert rider["name"] == "Demo rider"
    assert rider["phone"] == "+910000000000"
    assert service.live_payload(order=refreshed)["can_call_rider"] is True


@pytest.mark.django_db
def test_tracking_never_walks_backwards(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    order = service.apply_tracking(order=order, payload={"status": "picked_up"})
    assert order.status == OrderStatus.OUT_FOR_DELIVERY

    stale = service.apply_tracking(order=order, payload={"status": "rider_assigned"})

    assert stale.metadata["delivery"]["partner_status"] == "picked_up"
    assert stale.status == OrderStatus.OUT_FOR_DELIVERY

    delivered = service.apply_tracking(order=stale, payload={"status": "delivered"})
    late = service.apply_tracking(order=delivered, payload={"status": "nearby"})

    assert late.metadata["delivery"]["partner_status"] == "delivered"
    assert late.status == OrderStatus.COMPLETED


@pytest.mark.django_db
def test_failed_delivery_marks_the_order_delivery_failed(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    order = service.apply_tracking(order=order, payload={"status": "picked_up"})

    failed = service.apply_tracking(
        order=order,
        payload={"status": "failed", "reason": "Customer unreachable"},
    )

    assert failed.status == OrderStatus.DELIVERY_FAILED
    assert failed.metadata["delivery"]["partner_status"] == "failed"
    assert service.live_payload(order=failed)["subtitle"] == "Customer unreachable"


@pytest.mark.django_db
def test_failed_delivery_can_be_re_dispatched_to_a_new_rider(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    first_booking = order.metadata["delivery"]["booking_id"]
    order = service.apply_tracking(
        order=order,
        payload={"status": "cancelled", "reason": "Rider dropped the trip"},
    )
    # The dead booking is retired so a retry books a fresh rider.
    assert "booking_id" not in order.metadata["delivery"]
    assert order.metadata["delivery"]["attempts"][0]["booking_id"] == first_booking

    retried = service.dispatch(order=order)

    assert retried.status == OrderStatus.READY
    assert retried.metadata["delivery"]["booking_id"] != first_booking
    assert retried.metadata["delivery"]["partner_status"] == "rider_assigned"
    assert retried.metadata["delivery"]["rider"]["name"] == "Demo rider"
    assert service.live_payload(order=retried)["subtitle"] == ""


@pytest.mark.django_db
def test_merchant_can_cancel_a_failed_delivery_and_restock(delivery_ctx) -> None:
    tenant, business, _ = delivery_ctx
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    order = service.apply_tracking(order=order, payload={"status": "failed"})

    cancelled = OrderService().transition(
        tenant=tenant,
        business=business,
        order=order,
        status=OrderStatus.CANCELLED,
    )

    assert cancelled.status == OrderStatus.CANCELLED


@pytest.mark.django_db
def test_simulate_tracking_steps_through_the_lifecycle(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)

    order = service.simulate_tracking(order=order)
    assert order.metadata["delivery"]["partner_status"] == "at_pickup"
    assert order.status == OrderStatus.READY

    order = service.simulate_tracking(order=order)
    assert order.status == OrderStatus.OUT_FOR_DELIVERY

    order = service.simulate_tracking(order=order, status="delivered")
    assert order.status == OrderStatus.COMPLETED
    assert order.metadata["delivery"]["rider"]["name"] == "Demo rider"


@pytest.mark.django_db
def test_simulate_tracking_is_rejected_for_real_providers(delivery_ctx) -> None:
    from django.core.exceptions import ValidationError

    tenant, business, _ = delivery_ctx
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    service.update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "porter", "base_url": "https://porter.test", "api_key": "k"},
    )

    with pytest.raises(ValidationError, match="mock provider"):
        service.simulate_tracking(order=order)


@pytest.mark.django_db
def test_live_payload_reports_whether_a_rider_is_booked(delivery_ctx) -> None:
    from django.core.exceptions import ValidationError

    service = DeliveryService()
    order = _quoted_order(delivery_ctx, service)

    # Simulation needs a booking, so the UI must not offer it before dispatch.
    assert service.live_payload(order=order)["dispatched"] is False
    with pytest.raises(ValidationError, match="Dispatch the order"):
        service.simulate_tracking(order=order)

    dispatched = service.dispatch(order=order)

    assert service.live_payload(order=dispatched)["dispatched"] is True


@pytest.mark.django_db
def test_live_payload_contains_attempt_timeline_and_location_trail(delivery_ctx) -> None:
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)

    order = service.apply_tracking(
        order=order,
        payload={
            "status": "picked_up",
            "eta_minutes": 8,
            "rider": {
                "name": "Demo rider",
                "location": {"latitude": 19.08, "longitude": 72.88},
            },
        },
    )
    # A materially changed location is retained even when the status is unchanged.
    order = service.apply_tracking(
        order=order,
        payload={
            "status": "picked_up",
            "eta_minutes": 7,
            "rider": {
                "location": {"latitude": 19.081, "longitude": 72.881},
            },
        },
    )
    live = service.live_payload(order=order)

    assert live["available"] is True
    assert live["active_attempt_number"] == 1
    assert live["attempts"][0]["status"] == "active"
    assert [event["status"] for event in live["events"]] == [
        "rider_assigned",
        "out_for_delivery",
    ]
    assert len(live["location_trail"]) == 2
    assert live["location_trail"][-1]["latitude"] == pytest.approx(19.081)
    assert live["order_status"] == OrderStatus.OUT_FOR_DELIVERY


@pytest.mark.django_db
def test_standard_delivery_records_complete_merchant_driven_timeline(delivery_ctx) -> None:
    tenant, business, customer = delivery_ctx
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-STANDARD-TRACKING",
        status=OrderStatus.PENDING,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        currency="INR",
        total=Decimal("250"),
        metadata={"delivery_method": "standard"},
    )
    from apps.shopie.services.tracking import TrackingHistoryService

    TrackingHistoryService().record_order_status(
        order=order,
        status=OrderStatus.PENDING,
        occurred_at=order.created_at,
    )
    orders = OrderService()
    for status in (
        OrderStatus.CONFIRMED,
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.COMPLETED,
    ):
        order = orders.transition(
            tenant=tenant,
            business=business,
            order=order,
            status=status,
        )

    live = DeliveryService().live_payload(order=order)
    assert live["delivery_method"] == "standard"
    assert live["terminal"] is True
    assert [event["status"] for event in live["events"]] == [
        "order_placed",
        "confirmed",
        "packed",
        "out_for_delivery",
        "delivered",
    ]


@pytest.mark.django_db
def test_late_archived_attempt_webhook_is_deduplicated_without_rewriting_history(
    delivery_ctx,
) -> None:
    tenant, business, _ = delivery_ctx
    service = DeliveryService()
    order = _dispatched_order(delivery_ctx, service)
    booking_id = order.metadata["delivery"]["booking_id"]
    service.update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "mock", "webhook_secret": "test-secret"},
    )
    order = service.apply_tracking(order=order, payload={"status": "failed"})
    event_count = ShopOrderTrackingEvent.objects.filter(order=order).count()

    body = json.dumps(
        {
            "booking_id": booking_id,
            "event_id": "late-event-1",
            "status": "nearby",
        }
    ).encode()
    signature = hmac.new(b"test-secret", body, hashlib.sha256).hexdigest()
    first = service.process_webhook(
        provider="mock",
        business=business,
        body=body,
        signature=signature,
    )
    duplicate = service.process_webhook(
        provider="mock",
        business=business,
        body=body,
        signature=signature,
    )

    order.refresh_from_db()
    assert first["accepted"] is True
    assert first["status"] == "processed"
    assert duplicate["duplicate"] is True
    assert order.status == OrderStatus.DELIVERY_FAILED
    assert ShopOrderTrackingEvent.objects.filter(order=order).count() == event_count
    saved_webhook = ShopDeliveryWebhookEvent.objects.get(external_event_id="late-event-1")
    assert saved_webhook.order_id == order.id
    assert ShopDeliveryAttempt.objects.get(booking_id=booking_id).status == "failed"


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
