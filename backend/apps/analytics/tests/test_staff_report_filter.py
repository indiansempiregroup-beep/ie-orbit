from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import Booking, BookingLineItem, BookingStatus
from apps.businesses.models import Business
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def _authenticate(api_client: APIClient, user: User, tenant: Tenant) -> None:
    api_client.force_authenticate(user=user)
    api_client.credentials(HTTP_X_TENANT_ID=str(tenant.id))


def _workspace() -> dict:
    owner = User.objects.create_user(
        email="staff-filter-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")
    staff_user = User.objects.create_user(
        email="staff-filter-staff@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=staff_user, role_code="staff")

    tenant = Tenant.objects.create(
        slug="staff-filter-tenant",
        display_name="Staff Filter Tenant",
        owner=owner,
        timezone="Asia/Kolkata",
    )
    organization = Organization.objects.create(tenant=tenant, name="Staff Filter Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="staff-filter-biz",
        business_name="Staff Filter Biz",
        display_name="Staff Filter Biz",
        timezone="Asia/Kolkata",
        currency="INR",
    )
    assigned = Staff.objects.create(
        tenant=tenant,
        business=business,
        user=staff_user,
        staff_code="stylist-assigned",
        first_name="Assigned",
        last_name="Staff",
        display_name="Assigned Staff",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    other = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="stylist-other",
        first_name="Other",
        last_name="Staff",
        display_name="Other Staff",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    now = timezone.now()
    today = now.date()
    Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-FILTER-MINE",
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
        booking_number="BK-FILTER-OTHER",
        customer_id=uuid4(),
        service_id=uuid4(),
        staff_id=other.id,
        appointment_date=today,
        start_at=now + timedelta(hours=1),
        end_at=now + timedelta(hours=1, minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    line_booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-FILTER-LINE",
        customer_id=uuid4(),
        service_id=uuid4(),
        staff_id=None,
        appointment_date=today,
        start_at=now + timedelta(hours=2),
        end_at=now + timedelta(hours=2, minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    BookingLineItem.objects.create(
        tenant=tenant,
        booking=line_booking,
        service_id=uuid4(),
        staff_id=assigned.id,
        start_at=now + timedelta(hours=2),
        end_at=now + timedelta(hours=2, minutes=30),
        duration_minutes=30,
        price_snapshot=500,
    )
    return {
        "owner": owner,
        "staff_user": staff_user,
        "tenant": tenant,
        "assigned": assigned,
        "other": other,
    }


@pytest.mark.django_db
def test_owner_dashboard_filters_by_staff_including_line_items(api_client: APIClient) -> None:
    workspace = _workspace()
    _authenticate(api_client, workspace["owner"], workspace["tenant"])

    all_staff = api_client.get(reverse("dashboard-summary"))
    assert all_staff.status_code == 200
    assert all_staff.json()["data"]["today_count"] == 3

    assigned_view = api_client.get(
        reverse("dashboard-summary"),
        {"staff_id": str(workspace["assigned"].id)},
    )
    assert assigned_view.status_code == 200
    assigned_data = assigned_view.json()["data"]
    assert assigned_data["today_count"] == 2
    assert assigned_data["appointie"]["today_bookings"] == 2
    assert assigned_data["appointie"]["active_customers"] == 2
    assert assigned_data["appointie"]["new_customers_today"] == 2

    other_view = api_client.get(
        reverse("dashboard-summary"),
        {"staff_id": str(workspace["other"].id)},
    )
    assert other_view.status_code == 200
    assert other_view.json()["data"]["today_count"] == 1


@pytest.mark.django_db
def test_staff_dashboard_ignores_other_staff_id_query(api_client: APIClient) -> None:
    workspace = _workspace()
    _authenticate(api_client, workspace["staff_user"], workspace["tenant"])

    response = api_client.get(
        reverse("dashboard-summary"),
        {"staff_id": str(workspace["other"].id)},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["today_count"] == 2
    assert data["appointie"]["today_bookings"] == 2


@pytest.mark.django_db
def test_owner_analytics_summary_filters_by_staff(api_client: APIClient) -> None:
    workspace = _workspace()
    _authenticate(api_client, workspace["owner"], workspace["tenant"])

    response = api_client.get(
        reverse("analytics-summary"),
        {"staff_id": str(workspace["assigned"].id)},
    )
    assert response.status_code == 200
    assert response.json()["data"]["bookings"] == 2
