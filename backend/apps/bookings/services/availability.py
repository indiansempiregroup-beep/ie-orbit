from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from apps.bookings.models import (
    BusinessHoliday,
    BusinessWeeklySchedule,
    EmergencyClosure,
    SpecialWorkingDay,
    StaffLeave,
    StaffSpecialAvailability,
    StaffWeeklySchedule,
)
from apps.bookings.repositories import BookingRepository


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

    def business_slots(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        duration_minutes: int,
        interval_minutes: int = 15,
        buffer_minutes: int = 0,
    ) -> list[AvailabilitySlot]:
        windows = self._business_windows(tenant=tenant, business=business, target_date=target_date)
        return self._slots_from_windows(
            tenant=tenant,
            business=business,
            target_date=target_date,
            windows=windows,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffer_minutes=buffer_minutes,
            staff_id=None,
        )

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
        exclude_booking: Any | None = None,
    ) -> bool:
        target_date = start_at.date()
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return False
        if staff_id and self._staff_on_leave(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        ):
            return False

        windows = (
            self._staff_windows(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                target_date=target_date,
            )
            if staff_id
            else self._business_windows(tenant=tenant, business=business, target_date=target_date)
        )
        capacity = self._window_capacity(windows=windows, start_at=start_at, end_at=end_at)
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

    def _window_capacity(
        self,
        *,
        windows: list[tuple[time, time, int]],
        start_at: datetime,
        end_at: datetime,
    ) -> int | None:
        target_date = start_at.date()
        for window_start, window_end, capacity in windows:
            window_open = timezone.make_aware(datetime.combine(target_date, window_start))
            window_close = timezone.make_aware(datetime.combine(target_date, window_end))
            if start_at >= window_open and end_at <= window_close:
                return capacity
        return None

    def _business_windows(
        self, *, tenant: Any, business: Any, target_date: date
    ) -> list[tuple[time, time, int]]:
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return []
        special = (
            SpecialWorkingDay.objects.for_tenant(tenant)
            .filter(
                business=business,
                date=target_date,
            )
            .first()
        )
        if special:
            return [(special.opening_time, special.closing_time, special.capacity)]
        rows = BusinessWeeklySchedule.objects.for_tenant(tenant).filter(
            business=business,
            weekday=target_date.weekday(),
            is_open=True,
        )
        return [(row.opening_time, row.closing_time, row.capacity) for row in rows]

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
        for start_time, end_time, capacity in windows:
            cursor = timezone.make_aware(datetime.combine(target_date, start_time))
            window_end = timezone.make_aware(datetime.combine(target_date, end_time))
            while cursor + duration <= window_end:
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
        day_start = timezone.make_aware(datetime.combine(target_date, time.min))
        day_end = timezone.make_aware(datetime.combine(target_date, time.max))
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
        day_start = timezone.make_aware(datetime.combine(target_date, time.min))
        day_end = timezone.make_aware(datetime.combine(target_date, time.max))
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
