import hashlib
import hmac
import json
from decimal import Decimal

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from django.core.exceptions import ValidationError

from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ReturnMethod,
    ReturnStatus,
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
from apps.shopie.services.returns import ReturnService
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
def test_pickup_order_records_and_exposes_full_status_history(delivery_ctx) -> None:
    tenant, business, customer = delivery_ctx
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-PICKUP-TRACKING",
        status=OrderStatus.PENDING,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("180"),
        metadata={"preferred_date": "2026-10-18", "preferred_time": "19:30"},
    )
    from apps.shopie.services.tracking import TrackingHistoryService

    TrackingHistoryService().record_order_status(
        order=order,
        status=OrderStatus.PENDING,
        occurred_at=order.created_at,
    )
    orders = OrderService()
    for status in (OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED):
        order = orders.transition(
            tenant=tenant,
            business=business,
            order=order,
            status=status,
        )

    live = DeliveryService().live_payload(order=order)
    assert live["available"] is True
    assert live["delivery_method"] == "pickup"
    assert live["headline"] == "Picked up"
    assert live["show_map"] is False
    assert live["attempts"] == []
    assert [event["status"] for event in live["events"]] == [
        "order_placed",
        "confirmed",
        "ready",
        "completed",
    ]
    assert [event["label"] for event in live["events"]] == [
        "Order placed",
        "Order confirmed",
        "Ready for pickup",
        "Picked up",
    ]


@pytest.mark.django_db
def test_pickup_live_payload_backfills_missing_history(delivery_ctx) -> None:
    from datetime import timedelta

    from django.utils import timezone

    tenant, business, customer = delivery_ctx
    placed_at = timezone.now() - timedelta(minutes=5)
    confirmed_at = placed_at + timedelta(minutes=2)
    completed_at = confirmed_at + timedelta(seconds=15)
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-PICKUP-BACKFILL",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("90"),
        metadata={
            "pos": {
                "confirmed_at": confirmed_at.isoformat(),
                "payment_status": "paid",
            }
        },
    )
    ShopOrder.objects.filter(id=order.id).update(created_at=placed_at, updated_at=completed_at)
    order.refresh_from_db()
    assert ShopOrderTrackingEvent.objects.filter(order=order).count() == 0

    live = DeliveryService().live_payload(order=order)
    assert live["available"] is True
    assert [event["status"] for event in live["events"]] == [
        "order_placed",
        "confirmed",
        "completed",
    ]
    confirmed = next(event for event in live["events"] if event["status"] == "confirmed")
    assert confirmed["label"] == "Order confirmed"
    assert confirmed["occurred_at"].startswith(confirmed_at.isoformat()[:19])


@pytest.mark.django_db
def test_pickup_live_payload_gap_fills_confirmed_between_placed_and_completed(
    delivery_ctx,
) -> None:
    from datetime import timedelta

    from django.utils import timezone

    tenant, business, customer = delivery_ctx
    placed_at = timezone.now() - timedelta(minutes=5)
    confirmed_at = placed_at + timedelta(minutes=2)
    completed_at = confirmed_at + timedelta(seconds=15)
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-PICKUP-GAPFILL",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("90"),
        metadata={"pos": {"confirmed_at": confirmed_at.isoformat()}},
    )
    ShopOrder.objects.filter(id=order.id).update(created_at=placed_at, updated_at=completed_at)
    order.refresh_from_db()
    from apps.shopie.services.tracking import TrackingHistoryService

    TrackingHistoryService().record_status(
        order=order,
        status="order_placed",
        occurred_at=order.created_at,
        source_key="order-status:order_placed:seed",
    )
    TrackingHistoryService().record_status(
        order=order,
        status="completed",
        occurred_at=order.updated_at,
        source_key="order-status:completed:seed",
    )

    live = DeliveryService().live_payload(order=order)
    assert [event["status"] for event in live["events"]] == [
        "order_placed",
        "confirmed",
        "completed",
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
    from apps.shopie.services.delivery.providers import ShiprocketQuickProvider

    with pytest.raises(ValidationError):
        ShiprocketQuickProvider({"api_key": "tok"}).quote(
            {
                "pickup": {"latitude": 19.07, "longitude": 72.87},
                "drop": {"latitude": 19.08, "longitude": 72.88},
            }
        )


def _completed_delivery_order(delivery_ctx, *, price: str = "120.00", name: str = "Return item"):
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
            "name": name,
            "price": price,
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "10",
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
        confirm=True,
    )
    OrderService().transition(
        tenant=tenant,
        business=business,
        order=order,
        status=OrderStatus.COMPLETED,
        notify=False,
    )
    return tenant, business, customer, product, order


@pytest.mark.django_db
def test_customer_cannot_create_instant_pickup_return(delivery_ctx) -> None:
    tenant, business, _, _, order = _completed_delivery_order(delivery_ctx, name="No customer instant")
    with pytest.raises(ValidationError) as exc:
        ReturnService().create_return(
            tenant=tenant,
            business=business,
            order=order,
            lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
            complete=False,
            require_delivered=True,
            return_method=ReturnMethod.INSTANT_PICKUP,
        )
    assert "drop-off or request pickup" in str(exc.value).lower() or "shop will arrange" in str(
        exc.value
    ).lower()


@pytest.mark.django_db
def test_ops_instant_pickup_merchant_bears_fee(delivery_ctx) -> None:
    tenant, business, _, product, order = _completed_delivery_order(
        delivery_ctx, price="120.00", name="Merchant bears"
    )
    returns = ReturnService()
    delivery = DeliveryService()
    product.refresh_from_db()
    stock_after = product.stock_on_hand
    pending = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    original = Decimal(str(pending.refund_total))
    quote = returns.quote_pickup(tenant=tenant, business=business, shop_return=pending)
    assert quote["available"] is True
    fee = Decimal(str(quote["quoted_fee"]))

    arranged = returns.arrange_pickup(
        tenant=tenant,
        business=business,
        shop_return=pending,
        mode="instant",
        charge_bearer="merchant",
    )
    assert arranged.return_method == ReturnMethod.INSTANT_PICKUP
    assert arranged.status == ReturnStatus.APPROVED
    assert Decimal(str(arranged.refund_total)) == original
    assert arranged.metadata["pickup_charge"]["charge_bearer"] == "merchant"
    booked = arranged.metadata["delivery"]
    assert str(booked["booking_id"]).startswith("mock_delivery_")
    assert float(booked["pickup"]["latitude"]) == pytest.approx(19.086)
    assert float(booked["drop"]["latitude"]) == pytest.approx(19.076)
    attempt = ShopDeliveryAttempt.objects.get(booking_id=booked["booking_id"])
    assert attempt.shop_return_id == arranged.id
    assert attempt.order_id is None

    live = delivery.live_return_payload(shop_return=arranged)
    assert live["dispatched"] is True
    assert live["show_map"] is True

    received = returns.receive_return(
        tenant=tenant, business=business, shop_return=arranged
    )
    product.refresh_from_db()
    assert received.status == ReturnStatus.COMPLETED
    assert Decimal(str(received.refund_total)) == original
    assert product.stock_on_hand == stock_after + Decimal("1")
    assert fee >= 0


@pytest.mark.django_db
def test_ops_instant_pickup_customer_pays_awaits_accept(delivery_ctx) -> None:
    tenant, business, _, _, order = _completed_delivery_order(
        delivery_ctx, price="120.00", name="Customer pays"
    )
    returns = ReturnService()
    delivery = DeliveryService()
    pending = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    original = Decimal(str(pending.refund_total))
    quote = returns.quote_pickup(tenant=tenant, business=business, shop_return=pending)
    fee = Decimal(str(quote["quoted_fee"]))
    expected_net = max(Decimal("0.00"), (original - fee).quantize(Decimal("0.01")))

    proposed = returns.arrange_pickup(
        tenant=tenant,
        business=business,
        shop_return=pending,
        mode="instant",
        charge_bearer="customer",
    )
    assert proposed.status == ReturnStatus.AWAITING_CUSTOMER
    assert Decimal(str(proposed.refund_total)) == original
    assert proposed.metadata["pickup_charge"]["status"] == "proposed"
    assert proposed.metadata["pickup_charge"]["charge_bearer"] == "customer"
    assert Decimal(str(proposed.metadata["pickup_charge"]["fee"])) == fee
    assert Decimal(str(proposed.metadata["pickup_charge"]["net_refund"])) == expected_net
    assert "booking_id" not in (proposed.metadata.get("delivery") or {})

    with pytest.raises(ValidationError):
        returns.receive_return(tenant=tenant, business=business, shop_return=proposed)

    accepted = returns.accept_pickup_charge(
        tenant=tenant, business=business, shop_return=proposed
    )
    assert accepted.status == ReturnStatus.APPROVED
    assert Decimal(str(accepted.refund_total)) == expected_net
    assert accepted.metadata["pickup_charge"]["status"] == "accepted"
    booked = accepted.metadata["delivery"]
    assert str(booked["booking_id"]).startswith("mock_delivery_")
    live = delivery.live_return_payload(shop_return=accepted)
    assert live["dispatched"] is True

    received = returns.receive_return(
        tenant=tenant, business=business, shop_return=accepted
    )
    assert Decimal(str(received.refund_total)) == expected_net


@pytest.mark.django_db
def test_ops_instant_pickup_customer_declines_cancels_return(delivery_ctx) -> None:
    tenant, business, _, _, order = _completed_delivery_order(
        delivery_ctx, price="90.00", name="Customer declines"
    )
    returns = ReturnService()
    pending = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    original = Decimal(str(pending.refund_total))
    proposed = returns.arrange_pickup(
        tenant=tenant,
        business=business,
        shop_return=pending,
        mode="instant",
        charge_bearer="customer",
    )
    assert proposed.status == ReturnStatus.AWAITING_CUSTOMER
    declined = returns.decline_pickup_charge(
        tenant=tenant, business=business, shop_return=proposed
    )
    assert declined.status == ReturnStatus.REJECTED
    assert Decimal(str(declined.refund_total)) == original
    assert declined.metadata["pickup_charge"]["status"] == "declined"


@pytest.mark.django_db
def test_ops_manual_pickup_customer_pays_fee_then_accept(delivery_ctx) -> None:
    tenant, business, _, _, order = _completed_delivery_order(
        delivery_ctx, price="75.00", name="Manual customer fee"
    )
    returns = ReturnService()
    pending = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    original = Decimal(str(pending.refund_total))
    fee = Decimal("25.00")
    expected_net = max(Decimal("0.00"), (original - fee).quantize(Decimal("0.01")))
    proposed = returns.arrange_pickup(
        tenant=tenant,
        business=business,
        shop_return=pending,
        mode="manual",
        charge_bearer="customer",
        fee=fee,
        notes="Blue dart",
        tracking_number="BD123",
    )
    assert proposed.status == ReturnStatus.AWAITING_CUSTOMER
    assert Decimal(str(proposed.refund_total)) == original
    accepted = returns.accept_pickup_charge(
        tenant=tenant, business=business, shop_return=proposed
    )
    assert accepted.status == ReturnStatus.APPROVED
    assert Decimal(str(accepted.refund_total)) == expected_net
    assert accepted.pickup_tracking_number == "BD123"
    assert "Blue dart" in (accepted.pickup_notes or "")


@pytest.mark.django_db
def test_ops_instant_pickup_unavailable_when_disabled(delivery_ctx) -> None:
    tenant, business, customer = delivery_ctx
    DeliveryService().update_settings(
        tenant=tenant,
        business=business,
        enabled=False,
        incoming={"provider": "mock"},
    )
    product = CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "No instant return",
            "price": "50.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "3",
        },
    )
    order = OrderService().create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    order.metadata = {
        **(order.metadata or {}),
        "delivery_latitude": "19.086",
        "delivery_longitude": "72.8877",
        "delivery_city": "Mumbai",
        "delivery_postal_code": "400002",
    }
    order.save(update_fields=["metadata", "updated_at", "version"])
    OrderService().transition(
        tenant=tenant,
        business=business,
        order=order,
        status=OrderStatus.COMPLETED,
        notify=False,
    )
    pending = ReturnService().create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    with pytest.raises(ValidationError):
        ReturnService().arrange_pickup(
            tenant=tenant,
            business=business,
            shop_return=pending,
            mode="instant",
            charge_bearer="merchant",
        )


@pytest.mark.django_db
def test_return_pickup_webhook_updates_return_metadata(delivery_ctx) -> None:
    tenant, business, _, _, order = _completed_delivery_order(
        delivery_ctx, price="80.00", name="Webhook return item"
    )
    delivery = DeliveryService()
    delivery.update_settings(
        tenant=tenant,
        business=business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer", "webhook_secret": "ret-secret"},
    )
    pending = ReturnService().create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        complete=False,
        require_delivered=True,
        return_method=ReturnMethod.REVERSE_PICKUP,
    )
    arranged = ReturnService().arrange_pickup(
        tenant=tenant,
        business=business,
        shop_return=pending,
        mode="instant",
        charge_bearer="merchant",
    )
    booking_id = arranged.metadata["delivery"]["booking_id"]
    body = json.dumps(
        {
            "booking_id": booking_id,
            "event_id": "return-pickup-1",
            "status": "picked_up",
        }
    ).encode()
    signature = hmac.new(b"ret-secret", body, hashlib.sha256).hexdigest()
    result = delivery.process_webhook(
        provider="mock",
        business=business,
        body=body,
        signature=signature,
    )
    arranged.refresh_from_db()
    assert result["accepted"] is True
    assert result["status"] == "processed"
    assert arranged.metadata["delivery"]["partner_status"] == "picked_up"
