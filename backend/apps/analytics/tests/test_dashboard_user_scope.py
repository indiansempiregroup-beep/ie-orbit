from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import Booking, BookingStatus
from apps.businesses.models import Business
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def _authenticate(api_client: APIClient, user: User, tenant: Tenant) -> None:
    api_client.force_authenticate(user=user)
    api_client.credentials(HTTP_X_TENANT_ID=str(tenant.id))


@pytest.mark.django_db
def test_dashboard_summary_scopes_bookings_to_logged_in_staff(api_client: APIClient) -> None:
    owner = User.objects.create_user(
        email="dash-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")
    staff_user = User.objects.create_user(
        email="dash-staff@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=staff_user, role_code="staff")

    tenant = Tenant.objects.create(
        slug="dash-scope-tenant",
        display_name="Dash Scope Tenant",
        owner=owner,
        timezone="Asia/Kolkata",
    )
    organization = Organization.objects.create(tenant=tenant, name="Dash Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="dash-biz",
        business_name="Dash Biz",
        display_name="Dash Biz",
        timezone="Asia/Kolkata",
        currency="INR",
    )
    assigned = Staff.objects.create(
        tenant=tenant,
        business=business,
        user=staff_user,
        staff_code="stylist-1",
        first_name="Assigned",
        last_name="Staff",
        display_name="Assigned Staff",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    other = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="stylist-2",
        first_name="Other",
        last_name="Staff",
        display_name="Other Staff",
        employment_status=EmploymentStatus.ACTIVE,
    )

    now = timezone.now()
    today = now.date()
    Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-DASH-MINE",
        customer_id=uuid4(),
        service_id=uuid4(),
        staff_id=assigned.id,
        appointment_date=today,
        start_at=now,
        end_at=now + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-DASH-OTHER",
        customer_id=uuid4(),
        service_id=uuid4(),
        staff_id=other.id,
        appointment_date=today,
        start_at=now + timedelta(hours=1),
        end_at=now + timedelta(hours=1, minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )

    _authenticate(api_client, owner, tenant)
    owner_view = api_client.get(reverse("dashboard-summary"))
    assert owner_view.status_code == 200
    owner_data = owner_view.json()["data"]
    assert owner_data["today_count"] == 2
    assert owner_data["appointie"]["today_bookings"] == 2
    assert owner_data["viewer"]["booking_staff"] is False

    _authenticate(api_client, staff_user, tenant)
    staff_view = api_client.get(reverse("dashboard-summary"))
    assert staff_view.status_code == 200
    staff_data = staff_view.json()["data"]
    assert staff_data["today_count"] == 1
    assert staff_data["appointie"]["today_bookings"] == 1
    assert staff_data["viewer"]["is_bookable"] is True
    assert staff_data["viewer"]["booking_staff"] is True

    cashier = User.objects.create_user(
        email="dash-cashier@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=cashier, role_code="staff")
    Staff.objects.create(
        tenant=tenant,
        business=business,
        user=cashier,
        staff_code="cashier-1",
        first_name="Counter",
        last_name="Staff",
        display_name="Counter Staff",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=False,
    )
    _authenticate(api_client, cashier, tenant)
    cashier_view = api_client.get(reverse("dashboard-summary"))
    assert cashier_view.status_code == 200
    cashier_data = cashier_view.json()["data"]
    assert cashier_data["viewer"]["is_bookable"] is False
    assert cashier_data["viewer"]["booking_staff"] is False
