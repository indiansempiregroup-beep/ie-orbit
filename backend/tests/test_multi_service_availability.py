from __future__ import annotations

from datetime import time, timedelta

from uuid import uuid4

import pytest
from django.utils import timezone

from apps.bookings.models import Booking, BookingLineItem, BookingStatus
from apps.bookings.models import BusinessSchedule, BusinessWeeklySchedule, StaffWeeklySchedule
from apps.bookings.repositories import BookingRepository
from apps.bookings.services.availability import AvailabilityService
from apps.bookings.services.multi_service_scheduler import MultiServiceScheduler
from apps.businesses.models import Business
from apps.services.models import Service, ServiceDuration, ServiceStatus
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment
from apps.tenancy.models import Organization, Tenant


def _create_business(*, tenant: Tenant, code: str, name: str) -> Business:
    organization = Organization.objects.create(tenant=tenant, name=f"{name} Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code=code,
        business_name=name,
        display_name=name,
    )


def _seed_day(*, tenant: Tenant, business: Business, staff_rows: list[Staff], weekday: int) -> None:
    schedule = BusinessSchedule.objects.create(
        tenant=tenant,
        business=business,
        name="Default",
        is_default=True,
    )
    BusinessWeeklySchedule.objects.create(
        tenant=tenant,
        business=business,
        schedule=schedule,
        weekday=weekday,
        opening_time=time(9, 0),
        closing_time=time(17, 0),
    )
    for staff in staff_rows:
        StaffWeeklySchedule.objects.create(
            tenant=tenant,
            business=business,
            staff=staff,
            weekday=weekday,
            shift_start=time(9, 0),
            shift_end=time(17, 0),
        )


def _create_service(
    *,
    tenant: Tenant,
    business: Business,
    code: str,
    duration_minutes: int,
) -> Service:
    service = Service.objects.create(
        tenant=tenant,
        business=business,
        service_code=code,
        name=code,
        display_name=code,
        status=ServiceStatus.ACTIVE,
    )
    ServiceDuration.objects.create(
        tenant=tenant,
        service=service,
        duration_minutes=duration_minutes,
        is_default=True,
    )
    return service


@pytest.mark.django_db
def test_preferred_staff_does_not_fall_through_to_other_staff() -> None:
    tenant = Tenant.objects.create(slug="multi-staff-tenant", display_name="Multi Staff Tenant")
    business = _create_business(tenant=tenant, code="multi-staff-biz", name="Multi Staff Biz")
    alice = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="alice",
        first_name="Alice",
        last_name="One",
        display_name="Alice One",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    bob = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="bob",
        first_name="Bob",
        last_name="Both",
        display_name="Bob Both",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    haircut = _create_service(tenant=tenant, business=business, code="haircut", duration_minutes=30)
    color = _create_service(tenant=tenant, business=business, code="color", duration_minutes=30)
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=alice, service=haircut, is_active_assignment=True
    )
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=bob, service=haircut, is_active_assignment=True
    )
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=bob, service=color, is_active_assignment=True
    )

    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)
    _seed_day(tenant=tenant, business=business, staff_rows=[alice, bob], weekday=start_at.weekday())

    scheduler = MultiServiceScheduler()
    items = scheduler.normalize_items(
        tenant=tenant,
        items=[{"service_id": haircut.id}, {"service_id": color.id}],
    )

    plan_for_alice = scheduler.plan(
        tenant=tenant,
        business=business,
        items=items,
        start_at=start_at,
        preferred_staff_id=alice.id,
    )
    plan_for_bob = scheduler.plan(
        tenant=tenant,
        business=business,
        items=items,
        start_at=start_at,
        preferred_staff_id=bob.id,
    )

    assert plan_for_alice is None
    assert plan_for_bob is not None
    assert all(line.staff_id == bob.id for line in plan_for_bob.line_items)


@pytest.mark.django_db
def test_multi_service_slots_use_chained_specialists() -> None:
    tenant = Tenant.objects.create(slug="chain-tenant", display_name="Chain Tenant")
    business = _create_business(tenant=tenant, code="chain-biz", name="Chain Biz")
    alice = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="alice-chain",
        first_name="Alice",
        last_name="Chain",
        display_name="Alice Chain",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    bob = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="bob-chain",
        first_name="Bob",
        last_name="Chain",
        display_name="Bob Chain",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    haircut = _create_service(tenant=tenant, business=business, code="chain-haircut", duration_minutes=30)
    color = _create_service(tenant=tenant, business=business, code="chain-color", duration_minutes=30)
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=alice, service=haircut, is_active_assignment=True
    )
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=bob, service=color, is_active_assignment=True
    )

    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=2)
    _seed_day(tenant=tenant, business=business, staff_rows=[alice, bob], weekday=start_at.weekday())

    availability = AvailabilityService()
    slots = availability.available_slots_for_items(
        tenant=tenant,
        business=business,
        target_date=start_at.date(),
        items=[{"service_id": haircut.id}, {"service_id": color.id}],
        interval_minutes=30,
    )

    assert slots
    first_slot = slots[0]
    assert first_slot.start_at.hour == 10
    assert first_slot.end_at == first_slot.start_at + timedelta(minutes=60)

    scheduler = MultiServiceScheduler(availability_service=availability)
    plan = scheduler.plan(
        tenant=tenant,
        business=business,
        items=scheduler.normalize_items(
            tenant=tenant,
            items=[{"service_id": haircut.id}, {"service_id": color.id}],
        ),
        start_at=first_slot.start_at,
    )
    assert plan is not None
    assert plan.line_items[0].staff_id == alice.id
    assert plan.line_items[1].staff_id == bob.id


@pytest.mark.django_db
def test_line_item_conflict_count_does_not_crash_query() -> None:
    tenant = Tenant.objects.create(slug="conflict-tenant", display_name="Conflict Tenant")
    business = _create_business(tenant=tenant, code="conflict-biz", name="Conflict Biz")
    staff = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="conflict-staff",
        first_name="Casey",
        last_name="Stylist",
        display_name="Casey Stylist",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    service = _create_service(tenant=tenant, business=business, code="conflict-service", duration_minutes=30)
    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)
    _seed_day(tenant=tenant, business=business, staff_rows=[staff], weekday=start_at.weekday())

    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="CONF-001",
        customer_id=uuid4(),
        staff_id=staff.id,
        service_id=service.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.CONFIRMED,
    )
    BookingLineItem.objects.create(
        tenant=tenant,
        booking=booking,
        service_id=service.id,
        staff_id=staff.id,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        sort_order=0,
    )

    repository = BookingRepository()
    count = repository.conflict_count(
        tenant=tenant,
        business=business,
        staff_id=staff.id,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        respect_booking_buffers=True,
    )
    assert count >= 1

    tenant = Tenant.objects.create(slug="unrestricted-tenant", display_name="Unrestricted Tenant")
    business = _create_business(tenant=tenant, code="unrestricted-biz", name="Unrestricted Biz")
    unrestricted = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="generalist",
        first_name="General",
        last_name="Stylist",
        display_name="General Stylist",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    service = _create_service(tenant=tenant, business=business, code="general-service", duration_minutes=30)

    availability = AvailabilityService()
    eligible = availability.staff_eligible_for_all_services(
        tenant=tenant,
        business=business,
        service_ids=[service.id],
    )

    assert unrestricted.id in eligible
    assert availability.staff_can_perform_service(
        tenant=tenant,
        staff_id=unrestricted.id,
        service_id=service.id,
    )


@pytest.mark.django_db
def test_plan_with_staff_overrides_preserves_per_line_staff() -> None:
    tenant = Tenant.objects.create(slug="override-tenant", display_name="Override Tenant")
    business = _create_business(tenant=tenant, code="override-biz", name="Override Biz")
    alice = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="alice-override",
        first_name="Alice",
        last_name="Override",
        display_name="Alice Override",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    bob = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="bob-override",
        first_name="Bob",
        last_name="Override",
        display_name="Bob Override",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    haircut = _create_service(tenant=tenant, business=business, code="override-haircut", duration_minutes=30)
    color = _create_service(tenant=tenant, business=business, code="override-color", duration_minutes=30)
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=alice, service=haircut, is_active_assignment=True
    )
    StaffServiceAssignment.objects.create(
        tenant=tenant, staff=bob, service=color, is_active_assignment=True
    )

    start_at = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=3)
    _seed_day(tenant=tenant, business=business, staff_rows=[alice, bob], weekday=start_at.weekday())

    scheduler = MultiServiceScheduler()
    items = scheduler.normalize_items(
        tenant=tenant,
        items=[{"service_id": haircut.id}, {"service_id": color.id}],
    )
    plan = scheduler.plan_with_staff_overrides(
        tenant=tenant,
        business=business,
        items=items,
        start_at=start_at,
        staff_overrides={0: alice.id, 1: bob.id},
    )

    assert plan is not None
    assert plan.line_items[0].staff_id == alice.id
    assert plan.line_items[1].staff_id == bob.id


@pytest.mark.django_db
def test_staff_assignment_changes_detects_swap() -> None:
    from apps.bookings.services.notification_context import staff_assignment_changes

    tenant = Tenant.objects.create(slug="swap-tenant", display_name="Swap Tenant")
    business = _create_business(tenant=tenant, code="swap-biz", name="Swap Biz")
    alice = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="alice-swap",
        first_name="Alice",
        last_name="Swap",
        display_name="Alice Swap",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    bob = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="bob-swap",
        first_name="Bob",
        last_name="Swap",
        display_name="Bob Swap",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
        is_active=True,
    )
    haircut = _create_service(tenant=tenant, business=business, code="swap-haircut", duration_minutes=30)
    color = _create_service(tenant=tenant, business=business, code="swap-color", duration_minutes=30)
    start_at = timezone.now().replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(days=4)

    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="SWAP-001",
        customer_id=uuid4(),
        staff_id=alice.id,
        service_id=haircut.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=60),
        duration_minutes=60,
        status=BookingStatus.CONFIRMED,
    )
    line_one = BookingLineItem.objects.create(
        tenant=tenant,
        booking=booking,
        service_id=haircut.id,
        staff_id=bob.id,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        sort_order=0,
    )
    line_two = BookingLineItem.objects.create(
        tenant=tenant,
        booking=booking,
        service_id=color.id,
        staff_id=alice.id,
        start_at=start_at + timedelta(minutes=30),
        end_at=start_at + timedelta(minutes=60),
        duration_minutes=30,
        sort_order=1,
    )

    previous = {str(line_one.id): str(alice.id), str(line_two.id): str(bob.id)}
    changes = staff_assignment_changes(booking=booking, previous_line_staff=previous)

    assert str(bob.id) in changes
    assert str(alice.id) in changes
    assert len(changes[str(bob.id)]) == 1
    assert len(changes[str(alice.id)]) == 1
