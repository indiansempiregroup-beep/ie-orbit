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
    StaffLeave,
    StaffWeeklySchedule,
)
from apps.businesses.models import Business
from apps.services.models import Service, ServiceDuration, ServiceStatus
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment


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


def create_active_staff(*, tenant_id: str, business: Business, code: str = "stylist-1") -> Staff:
    return Staff.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_code=code,
        first_name="Alex",
        last_name="Stylist",
        display_name=f"Alex {code}",
        employment_status=EmploymentStatus.ACTIVE,
    )


def seed_schedules(*, tenant_id: str, business: Business, staff_id, weekday: int) -> None:
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
        weekday=weekday,
        opening_time=time(9, 0),
        closing_time=time(17, 0),
    )
    StaffWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff_id,
        weekday=weekday,
        shift_start=time(9, 0),
        shift_end=time(17, 0),
    )


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
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=start_at.date().weekday(),
    )
    payload = {
        "business": business_id,
        "customer_id": str(uuid4()),
        "staff_id": str(staff.id),
        "service_id": str(uuid4()),
        "start_at": start_at.isoformat(),
        "duration_minutes": 30,
    }

    availability_response = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": start_at.date().isoformat(),
            "duration_minutes": 30,
        },
    )
    any_staff_availability = api_client.get(
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
    assert any_staff_availability.status_code == 200
    assert any_staff_availability.json()["data"]
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
def test_booking_auto_assigns_least_booked_staff(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = timezone.now().replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(
        days=1
    )
    staff_a = create_active_staff(tenant_id=tenant_id, business=business, code="stylist-a")
    staff_b = create_active_staff(tenant_id=tenant_id, business=business, code="stylist-b")
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff_a.id,
        weekday=start_at.date().weekday(),
    )
    StaffWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff_b.id,
        weekday=start_at.date().weekday(),
        shift_start=time(9, 0),
        shift_end=time(17, 0),
    )

    first = api_client.post(
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
    second = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "service_id": str(uuid4()),
            "start_at": (start_at + timedelta(hours=1)).isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assigned = {first.json()["data"]["staff_id"], second.json()["data"]["staff_id"]}
    assert assigned == {str(staff_a.id), str(staff_b.id)}


@pytest.mark.django_db
def test_availability_hides_past_slots_for_today(api_client: APIClient, user: User, monkeypatch) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    fixed_now = timezone.now().replace(hour=10, minute=5, second=0, microsecond=0)
    monkeypatch.setattr(timezone, "now", lambda: fixed_now)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=fixed_now.date().weekday(),
    )

    response = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": fixed_now.date().isoformat(),
            "duration_minutes": 30,
            "interval_minutes": 30,
        },
    )
    assert response.status_code == 200
    slots = response.json()["data"]
    assert slots
    assert all(slot["start_at"] > fixed_now.isoformat() for slot in slots)
    assert not any("10:00" in slot["start_at"] for slot in slots)


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
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=start_at.date().weekday(),
    )
    create_response = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "staff_id": str(staff.id),
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

    assert create_response.status_code == 201
    assert reschedule_response.status_code == 200
    assert reschedule_response.json()["data"]["status"] == "rescheduled"
    assert search_response.status_code == 200
    assert len(search_response.json()["data"]) == 1


def _future_day_start(hour: int = 9):
    return timezone.now().replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=1)


@pytest.mark.django_db
def test_short_booking_keeps_remaining_slots(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = _future_day_start(9)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    StaffWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=start_at.date().weekday(),
        shift_start=time(9, 0),
        shift_end=time(12, 0),
    )
    create_response = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "staff_id": str(staff.id),
            "service_id": str(uuid4()),
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": start_at.date().isoformat(),
            "duration_minutes": 30,
            "interval_minutes": 30,
        },
    )
    assert create_response.status_code == 201
    assert availability.status_code == 200
    starts = [slot["start_at"] for slot in availability.json()["data"]]
    assert not any(start_at.isoformat()[:16] in value for value in starts)
    assert len(starts) >= 4


@pytest.mark.django_db
def test_service_buffer_blocks_following_slot(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = _future_day_start(10)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=start_at.date().weekday(),
    )
    service = Service.objects.create(
        tenant_id=tenant_id,
        business=business,
        service_code="buffered-cut",
        name="Buffered Cut",
        display_name="Buffered Cut",
        status=ServiceStatus.ACTIVE,
    )
    ServiceDuration.objects.create(
        tenant_id=tenant_id,
        service=service,
        duration_minutes=30,
        buffer_before_minutes=0,
        buffer_after_minutes=15,
        cleanup_minutes=0,
        is_default=True,
    )
    create_response = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "staff_id": str(staff.id),
            "service_id": str(service.id),
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "service_id": str(service.id),
            "date": start_at.date().isoformat(),
            "duration_minutes": 30,
            "interval_minutes": 15,
        },
    )
    assert create_response.status_code == 201
    assert create_response.json()["data"]["buffer_after_minutes"] == 15
    starts = [slot["start_at"] for slot in availability.json()["data"]]
    blocked = (start_at + timedelta(minutes=30)).isoformat()
    assert not any(blocked[:16] in value for value in starts)
    assert any((start_at + timedelta(minutes=45)).isoformat()[:16] in value for value in starts)


@pytest.mark.django_db
def test_partial_leave_keeps_other_slots(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    day = _future_day_start(9)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=day.date().weekday(),
    )
    leave_start = day.replace(hour=10, minute=0)
    leave_end = day.replace(hour=12, minute=0)
    StaffLeave.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        starts_at=leave_start,
        ends_at=leave_end,
        approved=True,
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": day.date().isoformat(),
            "duration_minutes": 30,
            "interval_minutes": 30,
        },
    )
    assert availability.status_code == 200
    starts = [slot["start_at"] for slot in availability.json()["data"]]
    assert any(day.replace(hour=9).isoformat()[:16] in value for value in starts)
    assert not any(leave_start.isoformat()[:16] in value for value in starts)
    assert any(day.replace(hour=12).isoformat()[:16] in value for value in starts)


@pytest.mark.django_db
def test_inactive_staff_has_no_slots(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    day = _future_day_start(9)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    staff.employment_status = EmploymentStatus.INACTIVE
    staff.save(update_fields=["employment_status"])
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=day.date().weekday(),
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": day.date().isoformat(),
            "duration_minutes": 30,
        },
    )
    assert availability.status_code == 200
    assert availability.json()["data"] == []


@pytest.mark.django_db
def test_break_period_removes_mid_shift_slots(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    day = _future_day_start(9)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    StaffWeeklySchedule.objects.create(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=day.date().weekday(),
        shift_start=time(9, 0),
        shift_end=time(12, 0),
        break_periods=[{"start": "10:00", "end": "10:30"}],
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "date": day.date().isoformat(),
            "duration_minutes": 30,
            "interval_minutes": 30,
        },
    )
    assert availability.status_code == 200
    starts = [slot["start_at"] for slot in availability.json()["data"]]
    assert any(day.replace(hour=9).isoformat()[:16] in value for value in starts)
    assert not any(day.replace(hour=10).isoformat()[:16] in value for value in starts)
    assert any(day.replace(hour=10, minute=30).isoformat()[:16] in value for value in starts)


@pytest.mark.django_db
def test_staff_leave_and_assignment_apis(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    day = _future_day_start(13)
    leave_response = api_client.post(
        reverse("staff-leave-list-create"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "starts_at": day.isoformat(),
            "ends_at": (day + timedelta(hours=2)).isoformat(),
            "leave_type": "personal",
            "approved": True,
        },
        format="json",
    )
    special_response = api_client.post(
        reverse("staff-special-availability-list-create"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "starts_at": (day + timedelta(days=1)).isoformat(),
            "ends_at": (day + timedelta(days=1, hours=3)).isoformat(),
            "capacity": 1,
            "reason": "Extra hours",
        },
        format="json",
    )
    service = Service.objects.create(
        tenant_id=tenant_id,
        business=business,
        service_code="assign-me",
        name="Assign Me",
        display_name="Assign Me",
        status=ServiceStatus.ACTIVE,
    )
    assign_response = api_client.post(
        reverse("staff-assignment-list-create"),
        {"staff": str(staff.id), "service": str(service.id), "is_active_assignment": True},
        format="json",
    )
    assert leave_response.status_code == 201
    assert special_response.status_code == 201
    assert assign_response.status_code == 201
    assignment_id = assign_response.json()["data"]["id"]
    patch_response = api_client.patch(
        reverse("staff-assignment-detail", kwargs={"pk": assignment_id}),
        {"is_active_assignment": False},
        format="json",
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["is_active_assignment"] is False


@pytest.mark.django_db
def test_booking_rejects_unassigned_service_for_staff(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    business = Business.objects.get(id=business_id)
    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(
        days=1
    )
    staff = create_active_staff(tenant_id=tenant_id, business=business)
    seed_schedules(
        tenant_id=tenant_id,
        business=business,
        staff_id=staff.id,
        weekday=start_at.date().weekday(),
    )
    assigned = Service.objects.create(
        tenant_id=tenant_id,
        business=business,
        service_code="haircut",
        name="Haircut",
        display_name="Haircut",
        status=ServiceStatus.ACTIVE,
    )
    other = Service.objects.create(
        tenant_id=tenant_id,
        business=business,
        service_code="massage",
        name="Massage",
        display_name="Massage",
        status=ServiceStatus.ACTIVE,
    )
    StaffServiceAssignment.objects.create(
        tenant_id=tenant_id,
        staff=staff,
        service=assigned,
        is_active_assignment=True,
    )

    blocked = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "staff_id": str(staff.id),
            "service_id": str(other.id),
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    allowed = api_client.post(
        reverse("booking-list-create"),
        {
            "business": business_id,
            "customer_id": str(uuid4()),
            "staff_id": str(staff.id),
            "service_id": str(assigned.id),
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    availability = api_client.get(
        reverse("availability"),
        {
            "business": business_id,
            "staff_id": str(staff.id),
            "service_id": str(other.id),
            "date": start_at.date().isoformat(),
            "duration_minutes": 30,
        },
    )

    assert blocked.status_code == 422
    assert "not assigned" in str(blocked.json()["error"]).lower()
    assert allowed.status_code == 201
    assert availability.status_code == 200
    assert availability.json()["data"] == []
