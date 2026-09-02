from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import Booking, BookingEvent, BookingStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.models import Notification, NotificationChannel
from apps.notifications.services.customer_direct import CustomerDirectNotifier
from apps.notifications.services.notifications import NotificationService
from apps.notifications.services.preferences import (
    channel_enabled,
    merge_notification_preferences,
    normalize_notification_preferences,
)
from apps.notifications.services.staff_direct import StaffDirectNotifier
from apps.notifications.services.template_seed import ensure_notification_templates
from apps.services.models import Service
from apps.tenancy.models import Organization, Tenant


@pytest.mark.parametrize(
    ("prefs", "expected"),
    [
        ({"email_updates": False}, False),
        ({"email": False}, False),
        ({"email_updates": True}, True),
        ({"push": False}, False),
        ({"sms_reminders": False}, False),
    ],
)
def test_channel_enabled_honors_aliases(prefs: dict, expected: bool) -> None:
    user = SimpleNamespace(notification_preferences=prefs)
    if "email" in prefs or "email_updates" in prefs:
        assert channel_enabled(user, NotificationChannel.EMAIL) is expected
    elif "push" in prefs:
        assert channel_enabled(user, NotificationChannel.FIREBASE_PUSH) is expected
    elif "sms_reminders" in prefs:
        assert channel_enabled(user, NotificationChannel.SMS) is expected


def test_channel_enabled_in_app_is_always_true() -> None:
    user = SimpleNamespace(notification_preferences={"in_app": False})
    assert channel_enabled(user, NotificationChannel.IN_APP) is True


def test_normalize_notification_preferences_maps_legacy_keys() -> None:
    normalized = normalize_notification_preferences({"email_updates": False, "sms_reminders": True, "in_app": False})
    assert normalized["email"] is False
    assert normalized["sms"] is True
    assert normalized["push"] is True
    assert normalized["in_app"] is True


def test_merge_notification_preferences_returns_canonical_keys() -> None:
    merged = merge_notification_preferences(
        {"email_updates": True, "push": False},
        {"email": False, "in_app": False},
    )
    assert merged == {"email": False, "push": False, "in_app": True, "sms": True}


@pytest.fixture
def workspace() -> dict:
    owner = User.objects.create_user(
        email="prefs-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")

    customer_user = User.objects.create_user(
        email="prefs-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        notification_preferences={"in_app": False, "push": True, "email": True},
    )

    tenant = Tenant.objects.create(
        slug="prefs-tenant",
        display_name="Prefs Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Prefs Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="prefs-biz",
        business_name="Prefs Biz",
        display_name="Prefs Biz",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="prefs-customer",
        email=customer_user.email,
        first_name="Prefs",
        last_name="Customer",
        display_name="Prefs Customer",
    )
    service = Service.objects.create(
        tenant=tenant,
        business=business,
        service_code="prefs-service",
        name="Consultation",
        display_name="Consultation",
    )
    return {
        "owner": owner,
        "customer_user": customer_user,
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "service": service,
    }


def _make_booking(*, workspace: dict, booking_number: str, created_by: User | None = None) -> Booking:
    return Booking.objects.create(
        tenant=workspace["tenant"],
        business=workspace["business"],
        customer_id=workspace["customer"].id,
        service_id=workspace["service"].id,
        created_by=created_by.id if created_by is not None else None,
        booking_number=booking_number,
        appointment_date=timezone.now().date(),
        start_at=timezone.now(),
        end_at=timezone.now() + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )


@pytest.mark.django_db
def test_booking_in_app_created_even_when_stored_pref_disabled(workspace: dict) -> None:
    ensure_notification_templates(tenant=workspace["tenant"], business=workspace["business"])
    booking = _make_booking(
        workspace=workspace,
        booking_number="BK-PREFS-001",
        created_by=workspace["customer_user"],
    )
    event = BookingEvent.objects.create(
        tenant=workspace["tenant"],
        booking=booking,
        event_type="BookingConfirmed",
        payload={"booking_id": str(booking.id)},
    )

    with patch(
        "apps.notifications.services.notifications.NotificationService._send_expo_push",
        return_value={"data": []},
    ) as push_mock:
        NotificationService().process_booking_event(event)

    push_mock.assert_called()
    assert Notification.objects.filter(
        tenant=workspace["tenant"],
        booking=booking,
        user=workspace["customer_user"],
        channel=NotificationChannel.IN_APP,
    ).exists()


@pytest.mark.django_db
def test_booking_admin_email_sent_when_enabled(workspace: dict) -> None:
    workspace["owner"].notification_preferences = {"email": True, "in_app": True, "push": False}
    workspace["owner"].save(update_fields=["notification_preferences"])

    ensure_notification_templates(tenant=workspace["tenant"], business=workspace["business"])
    booking = _make_booking(workspace=workspace, booking_number="BK-PREFS-002")
    event = BookingEvent.objects.create(
        tenant=workspace["tenant"],
        booking=booking,
        event_type="BookingConfirmed",
        payload={"booking_id": str(booking.id)},
    )

    with patch("apps.notifications.services.providers.email.EmailProvider.send") as email_mock:
        email_mock.return_value = {"provider": "email", "status": "sent"}
        NotificationService().process_booking_event(event)

    assert email_mock.called
    assert Notification.objects.filter(
        tenant=workspace["tenant"],
        booking=booking,
        user=workspace["owner"],
        channel=NotificationChannel.EMAIL,
        metadata__audience=AUDIENCE_ADMIN,
    ).exists()


@pytest.mark.django_db
def test_customer_direct_notifier_skips_email_when_disabled(workspace: dict) -> None:
    workspace["customer_user"].notification_preferences = {"email": False, "push": True, "in_app": True}
    workspace["customer_user"].save(update_fields=["notification_preferences"])

    email_provider = MagicMock()
    CustomerDirectNotifier(email_provider=email_provider).notify_customer(
        tenant=workspace["tenant"],
        business=workspace["business"],
        customer=workspace["customer"],
        subject="Order update",
        body="Your order is ready.",
        channels=["in_app", "email"],
        event_type="ShopOrderReady",
    )

    email_provider.send.assert_not_called()


@pytest.mark.django_db
def test_staff_direct_notifier_respects_email_and_push_independently(workspace: dict) -> None:
    workspace["owner"].notification_preferences = {"email": False, "push": True, "in_app": False}
    workspace["owner"].save(update_fields=["notification_preferences"])

    email_provider = MagicMock()
    email_provider.send.return_value = {"provider": "email", "status": "sent"}

    with patch(
        "apps.notifications.services.staff_direct.StaffDirectNotifier._send_push",
    ) as push_mock:
        result = StaffDirectNotifier(email_provider=email_provider).notify_managers(
            tenant=workspace["tenant"],
            business=workspace["business"],
            subject="New order",
            body="Order #1001 is pending.",
            event_type="ShopOrderPendingAdmin",
            channels=["in_app", "email"],
        )

    email_provider.send.assert_not_called()
    push_mock.assert_called()
    assert "in_app" in result["sent_channels"]
    assert "push" in result["sent_channels"]
    assert "email" not in result["sent_channels"]
