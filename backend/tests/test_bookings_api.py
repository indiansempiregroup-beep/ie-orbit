from __future__ import annotations

from datetime import time, timedelta
from uuid import uuid4

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.bookings.models import (
    BookingEvent,
    BusinessSchedule,
    BusinessWeeklySchedule,
    StaffWeeklySchedule,
)
from apps.businesses.models import Business


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="booking-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


def authenticate(api_client: APIClient, user: User) -> str:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


def create_tenant(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("tenant-list-create"),
        {"slug": "booking-tenant", "display_name": "Booking Tenant"},
        format="json",
    )
    return response.json()["data"]["id"]


def create_business(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "booking-business",
            "business_name": "Booking Business Pvt Ltd",
            "display_name": "Booking Business",
        },
        format="json",
    )
    return response.json()["data"]["id"]


@pytest.mark.django_db
def test_booking_create_availability_conflict_and_workflow(
    api_client: APIClient,
    user: User,
) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(
        days=1
    )
    schedule = BusinessSchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        name="Default",
        is_default=True,
    )
    BusinessWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        schedule=schedule,
        weekday=start_at.date().weekday(),
        opening_time=time(9, 0),
        closing_time=time(17, 0),
    )
    staff_id = uuid4()
    StaffWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff_id,
        weekday=start_at.date().weekday(),
        shift_start=time(9, 0),
        shift_end=time(17, 0),
    )
    payload = {
        "business": business_id,
        "customer_id": str(uuid4()),
        "staff_id": str(staff_id),
        "service_id": str(uuid4()),
        "start_at": start_at.isoformat(),
        "duration_minutes": 30,
    }

    availability_response = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "date": start_at.date().isoformat(),
            "duration_minutes": 30,
        },
    )
    create_response = api_client.post(reverse("booking-list-create"), payload, format="json")
    conflict_response = api_client.post(reverse("booking-list-create"), payload, format="json")
    booking_id = create_response.json()["data"]["id"]
    confirm_response = api_client.post(
        reverse("booking-confirm", kwargs={"booking_id": booking_id}), {}
    )
    complete_response = api_client.post(
        reverse("booking-complete", kwargs={"booking_id": booking_id}), {}
    )

    assert availability_response.status_code == 200
    assert availability_response.json()["data"]
    assert create_response.status_code == 201
    assert conflict_response.status_code == 422
    assert confirm_response.status_code == 200
    assert confirm_response.json()["data"]["status"] == "confirmed"
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["status"] == "completed"
    assert BookingEvent.objects.filter(
        booking_id=booking_id, event_type="BookingCompleted"
    ).exists()


@pytest.mark.django_db
def test_booking_reschedule_and_search(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = timezone.now().replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(
        days=1
    )
    new_start_at = start_at + timedelta(hours=1)
    schedule = BusinessSchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        name="Default",
        is_default=True,
    )
    BusinessWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        schedule=schedule,
        weekday=start_at.date().weekday(),
        opening_time=time(9, 0),
        closing_time=time(17, 0),
    )
    create_response = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "service_id": str(uuid4()),
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    booking_id = create_response.json()["data"]["id"]

    reschedule_response = api_client.post(
        reverse("booking-reschedule", kwargs={"booking_id": booking_id}),
        {"start_at": new_start_at.isoformat(), "reason": "Customer requested a later slot."},
        format="json",
    )
    search_response = api_client.get(reverse("booking-list-create"), {"status": "rescheduled"})

    assert reschedule_response.status_code == 200
    assert reschedule_response.json()["data"]["status"] == "rescheduled"
    assert search_response.status_code == 200
    assert len(search_response.json()["data"]) == 1
