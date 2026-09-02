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


@pytest.mark.django_db
def test_reminder_notifies_customer_manager_and_assigned_staff() -> None:
    from apps.authentication.services.roles import RoleService
    from apps.customers.models import Customer
    from apps.notifications.constants import AUDIENCE_ADMIN, AUDIENCE_CUSTOMER
    from apps.notifications.models import Notification
    from apps.notifications.services.notifications import NotificationService
    from apps.notifications.services.template_seed import ensure_notification_templates
    from apps.staff.models import EmploymentStatus, Staff

    owner = User.objects.create_user(
        email="reminder-flow-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")

    manager = User.objects.create_user(
        email="reminder-flow-manager@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=manager, role_code="manager")

    assigned_staff_user = User.objects.create_user(
        email="reminder-flow-staff@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=assigned_staff_user, role_code="staff")

    customer_user = User.objects.create_user(
        email="reminder-flow-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )

    tenant = Tenant.objects.create(
        slug="reminder-flow-tenant",
        display_name="Reminder Flow Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Reminder Flow Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="reminder-flow-biz",
        business_name="Reminder Flow Biz",
        display_name="Reminder Flow Biz",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        first_name="Alex",
        last_name="Customer",
        display_name="Alex Customer",
        email=customer_user.email,
    )
    assigned_staff = Staff.objects.create(
        tenant=tenant,
        business=business,
        user=assigned_staff_user,
        staff_code="reminder-stf-1",
        first_name="Sam",
        last_name="Staff",
        display_name="Sam Staff",
        email=assigned_staff_user.email,
        employment_status=EmploymentStatus.ACTIVE,
    )
    Staff.objects.create(
        tenant=tenant,
        business=business,
        user=manager,
        staff_code="reminder-mgr-1",
        first_name="Manager",
        last_name="One",
        display_name="Manager One",
        email=manager.email,
        employment_status=EmploymentStatus.ACTIVE,
    )
    ensure_notification_templates(tenant=tenant, business=business)

    start_at = timezone.now() + timedelta(minutes=10)
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-REMINDER-001",
        customer_id=customer.id,
        staff_id=assigned_staff.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    event = BookingEvent.objects.create(
        tenant=tenant,
        booking=booking,
        event_type="BookingReminder",
        payload={
            "booking_id": str(booking.id),
            "start_at": start_at.isoformat(),
            "lead_minutes": 15,
        },
    )

    NotificationService().process_booking_event(event)

    customer_notification = Notification.objects.get(
        tenant=tenant,
        booking=booking,
        user=customer_user,
        metadata__audience=AUDIENCE_CUSTOMER,
    )
    assert "15 minutes" in customer_notification.subject
    assert "upcoming appointment" in customer_notification.body.lower()

    manager_notification = Notification.objects.get(
        tenant=tenant,
        booking=booking,
        user=manager,
        metadata__audience=AUDIENCE_ADMIN,
    )
    assert "Upcoming appointment" in manager_notification.subject

    staff_notification = Notification.objects.get(
        tenant=tenant,
        booking=booking,
        user=assigned_staff_user,
        metadata__audience=AUDIENCE_ADMIN,
    )
    assert "You're up in 15 minutes" in staff_notification.subject
    assert "Alex Customer" in staff_notification.body
