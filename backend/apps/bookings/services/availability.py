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


@dataclass(frozen=True)
class BufferPair:
    before_minutes: int = 0
    after_minutes: int = 0


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
        buffer_minutes: int | None = None,
        staff_id: Any | None = None,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        """Return bookable slots for a staff member, or any eligible staff when unset."""
        buffers = self.resolve_buffers(
            business=business, service_id=service_id, buffer_minutes=buffer_minutes
        )
        if staff_id:
            return self.staff_slots(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                target_date=target_date,
                duration_minutes=duration_minutes,
                interval_minutes=interval_minutes,
                buffers=buffers,
                service_id=service_id,
            )
        return self.any_staff_slots(
            tenant=tenant,
            business=business,
            target_date=target_date,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffers=buffers,
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
        buffer_minutes: int | None = None,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        """Slots where at least one eligible staff member is free (legacy entrypoint)."""
        return self.any_staff_slots(
            tenant=tenant,
            business=business,
            target_date=target_date,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffers=self.resolve_buffers(
                business=business, service_id=service_id, buffer_minutes=buffer_minutes
            ),
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
        buffers: BufferPair | None = None,
        buffer_minutes: int | None = None,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        resolved = buffers or self.resolve_buffers(
            business=business, service_id=service_id, buffer_minutes=buffer_minutes
        )
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
                buffers=resolved,
                service_id=service_id,
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
        buffers: BufferPair | None = None,
        buffer_minutes: int | None = None,
        service_id: Any | None = None,
    ) -> list[AvailabilitySlot]:
        if not self._staff_is_active(tenant=tenant, staff_id=staff_id):
            return []
        if service_id and not self.staff_can_perform_service(
            tenant=tenant, staff_id=staff_id, service_id=service_id
        ):
            return []
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return []
        resolved = buffers or self.resolve_buffers(
            business=business, service_id=service_id, buffer_minutes=buffer_minutes
        )
        windows = self._staff_windows(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        )
        leave_intervals = self._staff_leave_intervals(
            tenant=tenant, business=business, staff_id=staff_id, target_date=target_date
        )
        windows = self._subtract_intervals_from_windows(
            business=business,
            target_date=target_date,
            windows=windows,
            blocked=leave_intervals,
        )
        return self._slots_from_windows(
            tenant=tenant,
            business=business,
            target_date=target_date,
            windows=windows,
            duration_minutes=duration_minutes,
            interval_minutes=interval_minutes,
            buffers=resolved,
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
        buffer_before_minutes: int | None = None,
        buffer_after_minutes: int | None = None,
    ) -> bool:
        if start_at <= timezone.now():
            return False

        target_date = self._local_date(business=business, moment=start_at)
        if self._closed_for_business(tenant=tenant, business=business, target_date=target_date):
            return False

        buffers = self.resolve_buffers(business=business, service_id=service_id)
        if buffer_before_minutes is not None:
            buffers = BufferPair(buffer_before_minutes, buffers.after_minutes)
        if buffer_after_minutes is not None:
            buffers = BufferPair(buffers.before_minutes, buffer_after_minutes)

        if staff_id:
            if service_id and not self.staff_can_perform_service(
                tenant=tenant, staff_id=staff_id, service_id=service_id
            ):
                return False
            return self._staff_is_available(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=exclude_booking,
                buffers=buffers,
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
                buffers=buffers,
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
        buffer_before_minutes: int | None = None,
        buffer_after_minutes: int | None = None,
    ) -> UUID | None:
        """Pick the least-booked eligible staff free for the requested window (round-robin)."""
        buffers = self.resolve_buffers(business=business, service_id=service_id)
        if buffer_before_minutes is not None:
            buffers = BufferPair(buffer_before_minutes, buffers.after_minutes)
        if buffer_after_minutes is not None:
            buffers = BufferPair(buffers.before_minutes, buffer_after_minutes)

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
                buffers=buffers,
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

    def resolve_buffers(
        self,
        *,
        business: Any,
        service_id: Any | None = None,
        buffer_minutes: int | None = None,
    ) -> BufferPair:
        if buffer_minutes is not None:
            return BufferPair(before_minutes=buffer_minutes, after_minutes=buffer_minutes)

        if service_id:
            from apps.services.models import ServiceDuration

            duration = (
                ServiceDuration.objects.filter(service_id=service_id, is_default=True)
                .order_by("id")
                .first()
            )
            if duration is None:
                duration = ServiceDuration.objects.filter(service_id=service_id).order_by("id").first()
            if duration is not None:
                after = int(duration.buffer_after_minutes or 0) + int(
                    duration.cleanup_minutes or 0
                )
                return BufferPair(
                    before_minutes=int(duration.buffer_before_minutes or 0),
                    after_minutes=after,
                )

        settings = getattr(business, "settings", None)
        business_buffer = int(getattr(settings, "buffer_time", 0) or 0)
        return BufferPair(before_minutes=business_buffer, after_minutes=business_buffer)

    def service_buffer_defaults(self, *, service_id: Any | None) -> BufferPair:
        if not service_id:
            return BufferPair()
        from apps.services.models import ServiceDuration

        duration = (
            ServiceDuration.objects.filter(service_id=service_id, is_default=True)
            .order_by("id")
            .first()
        )
        if duration is None:
            duration = ServiceDuration.objects.filter(service_id=service_id).order_by("id").first()
        if duration is None:
            return BufferPair()
        after = int(duration.buffer_after_minutes or 0) + int(duration.cleanup_minutes or 0)
        return BufferPair(
            before_minutes=int(duration.buffer_before_minutes or 0),
            after_minutes=after,
        )

    def _staff_is_available(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any,
        start_at: datetime,
        end_at: datetime,
        exclude_booking: Any | None = None,
        buffers: BufferPair | None = None,
    ) -> bool:
        if not self._staff_is_active(tenant=tenant, staff_id=staff_id):
            return False

        target_date = self._local_date(business=business, moment=start_at)
        leave_intervals = self._staff_leave_intervals(
            tenant=tenant, business=business, staff_id=staff_id, target_date=target_date
        )
        if self._interval_blocked(start_at=start_at, end_at=end_at, blocked=leave_intervals):
            return False

        windows = self._staff_windows(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            target_date=target_date,
        )
        windows = self._subtract_intervals_from_windows(
            business=business,
            target_date=target_date,
            windows=windows,
            blocked=leave_intervals,
        )
        capacity = self._window_capacity(
            business=business, windows=windows, start_at=start_at, end_at=end_at
        )
        if capacity is None:
            return False

        resolved = buffers or BufferPair()
        conflict_start = start_at - timedelta(minutes=resolved.before_minutes)
        conflict_end = end_at + timedelta(minutes=resolved.after_minutes)
        conflict_count = self.repository.conflict_count(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            start_at=conflict_start,
            end_at=conflict_end,
            exclude_booking=exclude_booking,
            respect_booking_buffers=True,
        )
        return conflict_count < capacity

    def _staff_is_active(self, *, tenant: Any, staff_id: Any) -> bool:
        from apps.staff.models import EmploymentStatus, Staff

        return (
            Staff.objects.require_tenant(tenant)
            .filter(
                id=staff_id,
                employment_status=EmploymentStatus.ACTIVE,
                is_bookable=True,
                is_active=True,
            )
            .exists()
        )

    def staff_can_perform_service(
        self, *, tenant: Any, staff_id: Any, service_id: Any | None
    ) -> bool:
        """Return whether staff may be booked for the service.

        Once a staff member has any active service assignment, they may only be
        booked for those assigned services. Staff with no assignments remain
        unrestricted (legacy / not yet configured).
        """
        if not service_id or not staff_id:
            return True

        from apps.staff.models import StaffServiceAssignment

        assignments = StaffServiceAssignment.objects.require_tenant(tenant).filter(
            staff_id=staff_id,
            is_active_assignment=True,
        )
        if not assignments.exists():
            return True
        return assignments.filter(service_id=service_id).exists()

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
            is_bookable=True,
            is_active=True,
        )
        if service_id:
            assigned_ids = set(
                StaffServiceAssignment.objects.require_tenant(tenant)
                .filter(
                    service_id=service_id,
                    is_active_assignment=True,
                    staff__business=business,
                    staff__employment_status=EmploymentStatus.ACTIVE,
                    staff__is_bookable=True,
                    staff__is_active=True,
                )
                .values_list("staff_id", flat=True)
            )
            # Staff who already have assignments for other services must not be
            # auto-picked for this one. Staff with zero assignments stay eligible
            # until ops configures their service list.
            restricted_staff_ids = set(
                StaffServiceAssignment.objects.require_tenant(tenant)
                .filter(
                    is_active_assignment=True,
                    staff__business=business,
                    staff__employment_status=EmploymentStatus.ACTIVE,
                    staff__is_bookable=True,
                    staff__is_active=True,
                )
                .values_list("staff_id", flat=True)
                .distinct()
            )
            if assigned_ids or restricted_staff_ids:
                unrestricted_ids = set(
                    queryset.exclude(id__in=restricted_staff_ids).values_list("id", flat=True)
                )
                allowed_ids = assigned_ids | unrestricted_ids
                queryset = queryset.filter(id__in=allowed_ids)
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
        return datetime.combine(target_date, clock, tzinfo=self._business_tz(business))

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
        special = list(
            StaffSpecialAvailability.objects.for_tenant(tenant).filter(
                business=business,
                staff_id=staff_id,
                starts_at__date=target_date,
            )
        )
        if special:
            return [(row.starts_at.time(), row.ends_at.time(), row.capacity) for row in special]

        rows = list(
            StaffWeeklySchedule.objects.for_tenant(tenant).filter(
                business=business,
                staff_id=staff_id,
                weekday=target_date.weekday(),
                is_available=True,
            )
        )
        windows: list[tuple[time, time, int]] = []
        for row in rows:
            base = [(row.shift_start, row.shift_end, row.capacity)]
            breaks = self._parse_break_periods(row.break_periods)
            if breaks:
                windows.extend(
                    self._subtract_intervals_from_windows(
                        business=business,
                        target_date=target_date,
                        windows=base,
                        blocked=[
                            (
                                self._combine_local(
                                    business=business, target_date=target_date, clock=start
                                ),
                                self._combine_local(
                                    business=business, target_date=target_date, clock=end
                                ),
                            )
                            for start, end in breaks
                        ],
                    )
                )
            else:
                windows.append((row.shift_start, row.shift_end, row.capacity))
        return windows

    def _parse_break_periods(self, break_periods: Any) -> list[tuple[time, time]]:
        parsed: list[tuple[time, time]] = []
        for period in break_periods or []:
            if not isinstance(period, dict):
                continue
            start_raw = period.get("start") or period.get("start_time")
            end_raw = period.get("end") or period.get("end_time")
            if not start_raw or not end_raw:
                continue
            start = self._parse_clock(start_raw)
            end = self._parse_clock(end_raw)
            if start is None or end is None or start >= end:
                continue
            parsed.append((start, end))
        return parsed

    def _parse_clock(self, value: Any) -> time | None:
        if isinstance(value, time):
            return value
        if not isinstance(value, str):
            return None
        text = value.strip()
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                return datetime.strptime(text, fmt).time()
            except ValueError:
                continue
        return None

    def _staff_leave_intervals(
        self, *, tenant: Any, business: Any, staff_id: Any, target_date: date
    ) -> list[tuple[datetime, datetime]]:
        day_start = self._combine_local(business=business, target_date=target_date, clock=time.min)
        day_end = self._combine_local(business=business, target_date=target_date, clock=time.max)
        rows = StaffLeave.objects.for_tenant(tenant).filter(
            business=business,
            staff_id=staff_id,
            starts_at__lt=day_end,
            ends_at__gt=day_start,
            approved=True,
        )
        return [(row.starts_at, row.ends_at) for row in rows]

    def _interval_blocked(
        self,
        *,
        start_at: datetime,
        end_at: datetime,
        blocked: list[tuple[datetime, datetime]],
    ) -> bool:
        for block_start, block_end in blocked:
            if block_start < end_at and block_end > start_at:
                return True
        return False

    def _subtract_intervals_from_windows(
        self,
        *,
        business: Any,
        target_date: date,
        windows: list[tuple[time, time, int]],
        blocked: list[tuple[datetime, datetime]],
    ) -> list[tuple[time, time, int]]:
        if not blocked:
            return windows

        result: list[tuple[time, time, int]] = []
        for window_start, window_end, capacity in windows:
            segments: list[tuple[datetime, datetime]] = [
                (
                    self._combine_local(
                        business=business, target_date=target_date, clock=window_start
                    ),
                    self._combine_local(
                        business=business, target_date=target_date, clock=window_end
                    ),
                )
            ]
            for block_start, block_end in blocked:
                next_segments: list[tuple[datetime, datetime]] = []
                for seg_start, seg_end in segments:
                    if block_end <= seg_start or block_start >= seg_end:
                        next_segments.append((seg_start, seg_end))
                        continue
                    if block_start > seg_start:
                        next_segments.append((seg_start, block_start))
                    if block_end < seg_end:
                        next_segments.append((block_end, seg_end))
                segments = next_segments
            for seg_start, seg_end in segments:
                if seg_start < seg_end:
                    result.append((seg_start.time(), seg_end.time(), capacity))
        return result

    def _slots_from_windows(
        self,
        *,
        tenant: Any,
        business: Any,
        target_date: date,
        windows: list[tuple[time, time, int]],
        duration_minutes: int,
        interval_minutes: int,
        buffers: BufferPair,
        staff_id: str | None,
    ) -> list[AvailabilitySlot]:
        slots: list[AvailabilitySlot] = []
        duration = timedelta(minutes=duration_minutes)
        interval = timedelta(minutes=interval_minutes)
        # Compare in absolute time so today's morning slots drop once the clock passes them.
        now = timezone.now()
        for start_time, end_time, capacity in windows:
            cursor = self._combine_local(
                business=business, target_date=target_date, clock=start_time
            )
            window_end = self._combine_local(
                business=business, target_date=target_date, clock=end_time
            )
            while cursor + duration <= window_end:
                if cursor <= now:
                    cursor += interval
                    continue
                slot_end = cursor + duration
                conflict_start = cursor - timedelta(minutes=buffers.before_minutes)
                conflict_end = slot_end + timedelta(minutes=buffers.after_minutes)
                conflict_count = self.repository.conflict_count(
                    tenant=tenant,
                    business=business,
                    staff_id=staff_id,
                    start_at=conflict_start,
                    end_at=conflict_end,
                    respect_booking_buffers=True,
                )
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
