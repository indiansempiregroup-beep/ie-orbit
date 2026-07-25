from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking, BookingEvent, BookingStatus
from apps.businesses.models import Business
from apps.notifications.services.reminders import REMINDER_METADATA_KEY, BookingReminderService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def reminder_context() -> dict:
    owner = User.objects.create_user(
        email="reminder-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="reminder-tenant",
        display_name="Reminder Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Reminder Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="reminder-biz",
        business_name="Reminder Biz",
        display_name="Reminder Biz",
    )
    return {"tenant": tenant, "business": business, "owner": owner}


def _make_booking(*, tenant, business, start_at, status=BookingStatus.CONFIRMED, metadata=None) -> Booking:
    return Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number=f"REM-{start_at.strftime('%H%M%S%f')}",
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status=status,
        metadata=metadata or {},
    )


@pytest.mark.django_db
def test_send_due_reminders_publishes_once(reminder_context: dict) -> None:
    publisher = MagicMock()
    service = BookingReminderService(event_publisher=publisher)
    booking = _make_booking(
        tenant=reminder_context["tenant"],
        business=reminder_context["business"],
        start_at=timezone.now() + timedelta(minutes=12),
    )

    first = service.send_due_reminders(lead_minutes=15)
    second = service.send_due_reminders(lead_minutes=15)

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert publisher.publish.call_count == 1
    booking.refresh_from_db()
    assert booking.metadata.get(REMINDER_METADATA_KEY) == booking.start_at.isoformat()
    assert publisher.publish.call_args.kwargs["event_type"] == "BookingReminder"


@pytest.mark.django_db
def test_send_due_reminders_skips_outside_window(reminder_context: dict) -> None:
    publisher = MagicMock()
    service = BookingReminderService(event_publisher=publisher)
    _make_booking(
        tenant=reminder_context["tenant"],
        business=reminder_context["business"],
        start_at=timezone.now() + timedelta(minutes=45),
    )

    result = service.send_due_reminders(lead_minutes=15)

    assert result["sent"] == 0
    publisher.publish.assert_not_called()


@pytest.mark.django_db
def test_rescheduled_booking_can_remind_again(reminder_context: dict) -> None:
    publisher = MagicMock()
    service = BookingReminderService(event_publisher=publisher)
    old_start = timezone.now() + timedelta(minutes=10)
    booking = _make_booking(
        tenant=reminder_context["tenant"],
        business=reminder_context["business"],
        start_at=old_start,
        metadata={REMINDER_METADATA_KEY: old_start.isoformat()},
    )
    booking.start_at = timezone.now() + timedelta(minutes=14)
    booking.end_at = booking.start_at + timedelta(minutes=30)
    booking.status = BookingStatus.RESCHEDULED
    booking.save()

    result = service.send_due_reminders(lead_minutes=15)

    assert result["sent"] == 1
    publisher.publish.assert_called_once()


@pytest.mark.django_db
def test_reminder_task_creates_booking_event(reminder_context: dict, settings) -> None:
    settings.CELERY_TASK_ALWAYS_EAGER = True
    booking = _make_booking(
        tenant=reminder_context["tenant"],
        business=reminder_context["business"],
        start_at=timezone.now() + timedelta(minutes=8),
    )

    from apps.notifications.tasks import send_booking_reminders_task

    result = send_booking_reminders_task(lead_minutes=15)

    assert result["sent"] == 1
    assert BookingEvent.objects.filter(booking=booking, event_type="BookingReminder").exists()
