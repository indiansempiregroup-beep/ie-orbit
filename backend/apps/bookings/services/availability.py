from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Count
from django.utils import timezone

from apps.bookings.models import (
    Booking,
    BookingStatus,
    BusinessHoliday,
    EmergencyClosure,
    StaffLeave,
    StaffSpecialAvailability,
    StaffWeeklySchedule,
)
from apps.bookings.repositories import BookingRepository


ACTIVE_BOOKING_STATUSES = [
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
    BookingStatus.IN_PROGRESS,
]


@dataclass(frozen=True)
class AvailabilitySlot:
    start_at: datetime
    end_at: datetime
    staff_id: str | None
    capacity: int = 1

    def as_dict(self) -> dict[str, object]:
        return {
            "start_at": self.start_at.isoformat(),
            "end_at": self.end_at.isoformat(),
            "staff_id": self.staff_id,
            "capacity": self.capacity,
        }


class AvailabilityService:
    def __init__(self, repository: BookingRepository | None = None) -> None:
        self.repository = repository or BookingRepository()

    def available_slots(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        duration_minutes: int,
        interval_minutes: int = 15,
        buffer_minutes: int = 0,
        staff_id: Any | None = None,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        """Return bookable slots for a staff member, or any eligible staff when unset."""
        if staff_id:
            return self.staff_slots(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                target_date=target_date,
                duration_minutes=duration_minutes,
                interval_minutes=interval_minutes,
                buffer_minutes=buffer_minutes,
            )
        return self.any_staff_slots(
            tenant=tenant,
            business=business,
            target_date=target_date,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffer_minutes=buffer_minutes,
            service_id=service_id,
        )

    def business_slots(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        duration_minutes: int,
        interval_minutes: int = 15,
        buffer_minutes: int = 0,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        """Slots where at least one eligible staff member is free (legacy entrypoint)."""
        return self.any_staff_slots(
            tenant=tenant,
            business=business,
            target_date=target_date,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffer_minutes=buffer_minutes,
            service_id=service_id,
        )

    def any_staff_slots(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        duration_minutes: int,
        interval_minutes: int = 15,
        buffer_minutes: int = 0,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        staff_ids = self._eligible_staff_ids(
            tenant=tenant, business=business, service_id=service_id
        )
        if not staff_ids:
            return []

        merged: dict[datetime, AvailabilitySlot] = {}
        for sid in staff_ids:
            for slot in self.staff_slots(
                tenant=tenant,
                business=business,
                staff_id=sid,
                target_date=target_date,
                duration_minutes=duration_minutes,
                interval_minutes=interval_minutes,
                buffer_minutes=buffer_minutes,
            ):
                existing = merged.get(slot.start_at)
                if existing is None:
                    merged[slot.start_at] = AvailabilitySlot(
                        start_at=slot.start_at,
                        end_at=slot.end_at,
                        staff_id=None,
                        capacity=1,
                    )
                else:
                    merged[slot.start_at] = AvailabilitySlot(
                        start_at=existing.start_at,
                        end_at=existing.end_at,
                        staff_id=None,
                        capacity=existing.capacity + 1,
                    )
        return sorted(merged.values(), key=lambda slot: slot.start_at)

    def staff_slots(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any,
        target_date: date,
        duration_minutes: int,
        interval_minutes: int = 15,
        buffer_minutes: int = 0,
    ) -> list[AvailabilitySlot]:
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return []
        if self._staff_on_leave(
            tenant=tenant, business=business, staff_id=staff_id, target_date=target_date
        ):
            return []
        windows = self._staff_windows(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        )
        return self._slots_from_windows(
            tenant=tenant,
            business=business,
            target_date=target_date,
            windows=windows,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffer_minutes=buffer_minutes,
            staff_id=str(staff_id),
        )

    def is_available(
        self,
        *,
        tenant: Any,
        business: Any,
        start_at: datetime,
        end_at: datetime,
        staff_id: Any | None,
        service_id: Any | None = None,
        exclude_booking: Any | None = None,
    ) -> bool:
        if start_at <= timezone.now():
            return False

        target_date = self._local_date(business=business, moment=start_at)
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return False

        if staff_id:
            return self._staff_is_available(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=exclude_booking,
            )

        for candidate_id in self._eligible_staff_ids(
            tenant=tenant, business=business, service_id=service_id
        ):
            if self._staff_is_available(
                tenant=tenant,
                business=business,
                staff_id=candidate_id,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=exclude_booking,
            ):
                return True
        return False

    def assign_available_staff(
        self,
        *,
        tenant: Any,
        business: Any,
        start_at: datetime,
        end_at: datetime,
        service_id: Any | None = None,
        exclude_booking: Any | None = None,
    ) -> UUID | None:
        """Pick the least-booked eligible staff free for the requested window (round-robin)."""
        candidates = [
            sid
            for sid in self._eligible_staff_ids(
                tenant=tenant, business=business, service_id=service_id
            )
            if self._staff_is_available(
                tenant=tenant,
                business=business,
                staff_id=sid,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=exclude_booking,
            )
        ]
        if not candidates:
            return None

        local_date = self._local_date(business=business, moment=start_at)
        counts = {
            str(row["staff_id"]): row["booking_count"]
            for row in Booking.objects.require_tenant(tenant)
            .filter(
                business=business,
                appointment_date=local_date,
                staff_id__in=candidates,
                status__in=ACTIVE_BOOKING_STATUSES,
            )
            .values("staff_id")
            .annotate(booking_count=Count("id"))
        }
        candidates.sort(key=lambda sid: (counts.get(str(sid), 0), str(sid)))
        return candidates[0]

    def _staff_is_available(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any,
        start_at: datetime,
        end_at: datetime,
        exclude_booking: Any | None = None,
    ) -> bool:
        target_date = self._local_date(business=business, moment=start_at)
        if self._staff_on_leave(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        ):
            return False

        windows = self._staff_windows(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        )
        capacity = self._window_capacity(
            business=business, windows=windows, start_at=start_at, end_at=end_at
        )
        if capacity is None:
            return False

        conflict_count = self.repository.conflicts(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            start_at=start_at,
            end_at=end_at,
            exclude_booking=exclude_booking,
        ).count()
        return conflict_count < capacity

    def _eligible_staff_ids(
        self,
        *,
        tenant: Any,
        business: Any,
        service_id: Any | None = None,
    ) -> list[Any]:
        from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment

        queryset = Staff.objects.require_tenant(tenant).filter(
            business=business,
            employment_status=EmploymentStatus.ACTIVE,
        )
        if service_id:
            assigned_ids = list(
                StaffServiceAssignment.objects.require_tenant(tenant)
                .filter(
                    service_id=service_id,
                    is_active_assignment=True,
                    staff__business=business,
                    staff__employment_status=EmploymentStatus.ACTIVE,
                )
                .values_list("staff_id", flat=True)
            )
            # Prefer assigned staff; if none are linked to the service yet, fall back
            # so ops can still book against weekly schedules.
            if assigned_ids:
                queryset = queryset.filter(id__in=assigned_ids)
        return list(queryset.order_by("id").values_list("id", flat=True))

    def _business_tz(self, business: Any) -> ZoneInfo:
        tz_name = getattr(business, "timezone", None) or getattr(
            getattr(business, "tenant", None), "timezone", None
        ) or "UTC"
        try:
            return ZoneInfo(str(tz_name))
        except ZoneInfoNotFoundError:
            return ZoneInfo("UTC")

    def _local_date(self, *, business: Any, moment: datetime) -> date:
        if timezone.is_naive(moment):
            moment = timezone.make_aware(moment, timezone=self._business_tz(business))
        return moment.astimezone(self._business_tz(business)).date()

    def _combine_local(self, *, business: Any, target_date: date, clock: time) -> datetime:
        local = datetime.combine(target_date, clock, tzinfo=self._business_tz(business))
        return local

    def _window_capacity(
        self,
        *,
        business: Any,
        windows: list[tuple[time, time, int]],
        start_at: datetime,
        end_at: datetime,
    ) -> int | None:
        target_date = self._local_date(business=business, moment=start_at)
        for window_start, window_end, capacity in windows:
            window_open = self._combine_local(
                business=business, target_date=target_date, clock=window_start
            )
            window_close = self._combine_local(
                business=business, target_date=target_date, clock=window_end
            )
            if start_at >= window_open and end_at <= window_close:
                return capacity
        return None

    def _staff_windows(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any,
        target_date: date,
    ) -> list[tuple[time, time, int]]:
        special = StaffSpecialAvailability.objects.for_tenant(tenant).filter(
            business=business,
            staff_id=staff_id,
            starts_at__date=target_date,
        )
        if special.exists():
            return [(row.starts_at.time(), row.ends_at.time(), row.capacity) for row in special]
        rows = StaffWeeklySchedule.objects.for_tenant(tenant).filter(
            business=business,
            staff_id=staff_id,
            weekday=target_date.weekday(),
            is_available=True,
        )
        return [(row.shift_start, row.shift_end, row.capacity) for row in rows]

    def _slots_from_windows(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        windows: list[tuple[time, time, int]],
        duration_minutes: int,
        interval_minutes: int,
        buffer_minutes: int,
        staff_id: str | None,
    ) -> list[AvailabilitySlot]:
        slots: list[AvailabilitySlot] = []
        duration = timedelta(minutes=duration_minutes)
        interval = timedelta(minutes=interval_minutes)
        buffer = timedelta(minutes=buffer_minutes)
        now = timezone.now()
        for start_time, end_time, capacity in windows:
            cursor = self._combine_local(
                business=business, target_date=target_date, clock=start_time
            )
            window_end = self._combine_local(
                business=business, target_date=target_date, clock=end_time
            )
            while cursor + duration <= window_end:
                if cursor > now:
                    slot_end = cursor + duration
                    conflict_start = cursor - buffer
                    conflict_end = slot_end + buffer
                    conflict_count = self.repository.conflicts(
                        tenant=tenant,
                        business=business,
                        staff_id=staff_id,
                        start_at=conflict_start,
                        end_at=conflict_end,
                    ).count()
                    if conflict_count < capacity:
                        slots.append(AvailabilitySlot(cursor, slot_end, staff_id, capacity))
                cursor += interval
        return slots

    def _closed_for_business(self, *, tenant: Any, business: Any, target_date: date) -> bool:
        if (
            BusinessHoliday.objects.for_tenant(tenant)
            .filter(
                business=business,
                date=target_date,
                all_day=True,
            )
            .exists()
        ):
            return True
        day_start = self._combine_local(business=business, target_date=target_date, clock=time.min)
        day_end = self._combine_local(business=business, target_date=target_date, clock=time.max)
        return (
            EmergencyClosure.objects.for_tenant(tenant)
            .filter(
                business=business,
                starts_at__lt=day_end,
                ends_at__gt=day_start,
            )
            .exists()
        )

    def _staff_on_leave(
        self, *, tenant: Any, business: Any, staff_id: Any, target_date: date
    ) -> bool:
        day_start = self._combine_local(business=business, target_date=target_date, clock=time.min)
        day_end = self._combine_local(business=business, target_date=target_date, clock=time.max)
        return (
            StaffLeave.objects.for_tenant(tenant)
            .filter(
                business=business,
                staff_id=staff_id,
                starts_at__lt=day_end,
                ends_at__gt=day_start,
                approved=True,
            )
            .exists()
        )
