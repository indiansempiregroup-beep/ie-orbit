from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import Booking, BookingEvent, BookingStatus
from apps.businesses.models import Business
from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.models import Notification
from apps.notifications.services.notifications import NotificationService
from apps.notifications.services.template_seed import ensure_notification_templates
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def workspace() -> dict:
    owner = User.objects.create_user(
        email="notify-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")

    manager = User.objects.create_user(
        email="notify-manager@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=manager, role_code="manager")

    assigned_staff_user = User.objects.create_user(
        email="notify-assigned@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=assigned_staff_user, role_code="staff")

    other_staff_user = User.objects.create_user(
        email="notify-other@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=other_staff_user, role_code="staff")

    tenant = Tenant.objects.create(
        slug="notify-tenant",
        display_name="Notify Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Notify Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="notify-biz",
        business_name="Notify Biz",
        display_name="Notify Biz",
    )

    manager_staff = Staff.objects.create(
        tenant=tenant,
        business=business,
        user=manager,
        staff_code="mgr-1",
        first_name="Manager",
        last_name="One",
        display_name="Manager One",
        email=manager.email,
        employment_status=EmploymentStatus.ACTIVE,
    )
    assigned_staff = Staff.objects.create(
        tenant=tenant,
        business=business,
        user=assigned_staff_user,
        staff_code="stf-1",
        first_name="Assigned",
        last_name="Staff",
        display_name="Assigned Staff",
        email=assigned_staff_user.email,
        employment_status=EmploymentStatus.ACTIVE,
    )
    Staff.objects.create(
        tenant=tenant,
        business=business,
        user=other_staff_user,
        staff_code="stf-2",
        first_name="Other",
        last_name="Staff",
        display_name="Other Staff",
        email=other_staff_user.email,
        employment_status=EmploymentStatus.ACTIVE,
    )

    return {
        "owner": owner,
        "manager": manager,
        "assigned_staff_user": assigned_staff_user,
        "other_staff_user": other_staff_user,
        "tenant": tenant,
        "business": business,
        "assigned_staff": assigned_staff,
        "manager_staff": manager_staff,
    }


@pytest.mark.django_db
def test_booking_admin_notifications_go_to_owner_manager_and_assigned_staff(workspace: dict) -> None:
    ensure_notification_templates(tenant=workspace["tenant"], business=workspace["business"])
    booking = Booking.objects.create(
        tenant=workspace["tenant"],
        business=workspace["business"],
        booking_number="BK-NOTIFY-001",
        staff_id=workspace["assigned_staff"].id,
        appointment_date=timezone.now().date(),
        start_at=timezone.now(),
        end_at=timezone.now() + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    event = BookingEvent.objects.create(
        tenant=workspace["tenant"],
        booking=booking,
        event_type="BookingConfirmed",
        payload={"booking_id": str(booking.id)},
    )

    NotificationService().process_booking_event(event)

    admin_user_ids = set(
        Notification.objects.filter(
            tenant=workspace["tenant"],
            booking=booking,
            metadata__audience=AUDIENCE_ADMIN,
        ).values_list("user_id", flat=True)
    )

    assert workspace["owner"].id in admin_user_ids
    assert workspace["manager"].id in admin_user_ids
    assert workspace["assigned_staff_user"].id in admin_user_ids
    assert workspace["other_staff_user"].id not in admin_user_ids
