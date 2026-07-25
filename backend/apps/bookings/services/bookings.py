from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.bookings.models import (
    Booking,
    BookingHistory,
    BookingStatus,
    BookingTimeline,
)
from apps.bookings.repositories import BookingRepository
from apps.bookings.services.availability import AvailabilityService
from apps.bookings.services.events import BookingEventPublisher
from apps.bookings.validators import validate_booking_transition, validate_time_range

logger = logging.getLogger("ie_platform.bookings")


class BookingService:
    def __init__(
        self,
        *,
        repository: BookingRepository | None = None,
        availability_service: AvailabilityService | None = None,
        event_publisher: BookingEventPublisher | None = None,
    ) -> None:
        self.repository = repository or BookingRepository()
        self.availability_service = availability_service or AvailabilityService(
            repository=self.repository
        )
        self.event_publisher = event_publisher or BookingEventPublisher()

    @transaction.atomic
    def create_booking(
        self, *, tenant: Any, business: Any, data: dict[str, Any], actor: Any
    ) -> Booking:
        start_at = data["start_at"]
        duration_minutes = data["duration_minutes"]
        end_at = start_at + timedelta(minutes=duration_minutes)
        validate_time_range(start_at, end_at)
        staff_id = data.get("staff_id")
        service_id = data.get("service_id")
        service_buffers = self.availability_service.service_buffer_defaults(service_id=service_id)
        buffer_before = data.get("buffer_before_minutes")
        buffer_after = data.get("buffer_after_minutes")
        if buffer_before is None:
            buffer_before = service_buffers.before_minutes
        if buffer_after is None:
            buffer_after = service_buffers.after_minutes
        if not staff_id:
            staff_id = self.availability_service.assign_available_staff(
                tenant=tenant,
                business=business,
                start_at=start_at,
                end_at=end_at,
                service_id=service_id,
                buffer_before_minutes=buffer_before,
                buffer_after_minutes=buffer_after,
            )
            if not staff_id:
                raise ValidationError(
                    "No timeslot available. No staff is available at the selected time."
                )
        if service_id and not self.availability_service.staff_can_perform_service(
            tenant=tenant, staff_id=staff_id, service_id=service_id
        ):
            raise ValidationError(
                "This staff member is not assigned to the selected service. "
                "Assign the service on the staff availability page, or choose another staff member."
            )
        self._validate_availability(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            service_id=service_id,
            start_at=start_at,
            end_at=end_at,
            buffer_before_minutes=buffer_before,
            buffer_after_minutes=buffer_after,
        )
        booking = Booking(
            tenant=tenant,
            business=business,
            booking_number=self._booking_number(),
            customer_id=data["customer_id"],
            staff_id=staff_id,
            service_id=service_id,
            appointment_date=start_at.date(),
            start_at=start_at,
            end_at=end_at,
            duration_minutes=duration_minutes,
            buffer_before_minutes=buffer_before,
            buffer_after_minutes=buffer_after,
            status=data.get("status", BookingStatus.PENDING),
            source=data.get("source", "customer_app"),
            channel=data.get("channel", "web"),
            notes=data.get("notes", ""),
            recurrence_frequency=data.get("recurrence_frequency", "none"),
            recurrence_rule=data.get("recurrence_rule", {}),
            metadata=data.get("metadata", {}),
        )
        if getattr(actor, "is_authenticated", False):
            booking.mark_created(actor_id=actor.id)
        booking.full_clean()
        booking.save()
        self._record_state(
            booking=booking,
            from_status="",
            to_status=booking.status,
            actor=actor,
            reason="Booking created",
        )
        self.event_publisher.publish(
            booking=booking,
            event_type="BookingCreated",
            payload={"booking_id": str(booking.id), "status": booking.status},
        )
        logger.info("Booking created", extra={"booking_id": str(booking.id)})
        return booking

    @transaction.atomic
    def update_booking(self, *, booking: Booking, data: dict[str, Any], actor: Any) -> Booking:
        start_at = data.get("start_at", booking.start_at)
        duration_minutes = data.get("duration_minutes", booking.duration_minutes)
        end_at = data.get("end_at", start_at + timedelta(minutes=duration_minutes))
        validate_time_range(start_at, end_at)
        if "start_at" in data or "duration_minutes" in data or "staff_id" in data:
            staff_id = data.get("staff_id", booking.staff_id)
            service_id = data.get("service_id", booking.service_id)
            if not staff_id:
                staff_id = self.availability_service.assign_available_staff(
                    tenant=booking.tenant,
                    business=booking.business,
                    start_at=start_at,
                    end_at=end_at,
                    service_id=service_id,
                    exclude_booking=booking,
                )
                if not staff_id:
                    raise ValidationError(
                        "No timeslot available. No staff is available at the selected time."
                    )
                data = {**data, "staff_id": staff_id}
            if service_id and not self.availability_service.staff_can_perform_service(
                tenant=booking.tenant, staff_id=staff_id, service_id=service_id
            ):
                raise ValidationError(
                    "This staff member is not assigned to the selected service. "
                    "Assign the service on the staff availability page, or choose another staff member."
                )
            self._validate_availability(
                tenant=booking.tenant,
                business=booking.business,
                staff_id=staff_id,
                service_id=service_id,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=booking,
            )
        for field, value in data.items():
            setattr(booking, field, value)
        booking.appointment_date = start_at.date()
        booking.start_at = start_at
        booking.end_at = end_at
        if getattr(actor, "is_authenticated", False):
            booking.mark_updated(actor_id=actor.id)
        booking.full_clean()
        booking.save()
        return booking

    @transaction.atomic
    def transition(
        self,
        *,
        booking: Booking,
        to_status: str,
        actor: Any,
        reason: str = "",
        extra: dict[str, Any] | None = None,
    ) -> Booking:
        from_status = booking.status
        validate_booking_transition(from_status, to_status)
        booking.status = to_status
        if to_status == BookingStatus.CANCELLED:
            booking.cancellation_reason = reason
        if getattr(actor, "is_authenticated", False):
            booking.mark_updated(actor_id=actor.id)
        booking.save()
        self._record_state(
            booking=booking,
            from_status=from_status,
            to_status=to_status,
            actor=actor,
            reason=reason,
            snapshot=extra or {},
        )
        event_type = {
            BookingStatus.CONFIRMED: "BookingConfirmed",
            BookingStatus.CANCELLED: "BookingCancelled",
            BookingStatus.COMPLETED: "BookingCompleted",
            BookingStatus.RESCHEDULED: "BookingRescheduled",
        }.get(to_status, "BookingStatusChanged")
        self.event_publisher.publish(
            booking=booking,
            event_type=event_type,
            payload={"booking_id": str(booking.id), "from": from_status, "to": to_status},
        )
        return booking

    @transaction.atomic
    def reschedule(
        self, *, booking: Booking, start_at: Any, actor: Any, reason: str = ""
    ) -> Booking:
        end_at = start_at + timedelta(minutes=booking.duration_minutes)
        self._validate_availability(
            tenant=booking.tenant,
            business=booking.business,
            staff_id=booking.staff_id,
            start_at=start_at,
            end_at=end_at,
            exclude_booking=booking,
        )
        booking.start_at = start_at
        booking.end_at = end_at
        booking.appointment_date = start_at.date()
        booking.reschedule_reason = reason
        booking.save()
        return self.transition(
            booking=booking,
            to_status=BookingStatus.RESCHEDULED,
            actor=actor,
            reason=reason,
        )

    @transaction.atomic
    def delete_booking(self, *, booking: Booking, actor: Any) -> None:
        booking.soft_delete(deleted_by=getattr(actor, "id", None))

    def _validate_availability(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any | None,
        start_at: Any,
        end_at: Any,
        service_id: Any | None = None,
        exclude_booking: Booking | None = None,
        buffer_before_minutes: int | None = None,
        buffer_after_minutes: int | None = None,
    ) -> None:
        self._validate_booking_rules(
            tenant=tenant,
            business=business,
            start_at=start_at,
            exclude_booking=exclude_booking,
        )
        if start_at <= timezone.now():
            raise ValidationError("Selected time is in the past. Choose a later timeslot.")
        if not self.availability_service.is_available(
            tenant=tenant,
            business=business,
            start_at=start_at,
            end_at=end_at,
            staff_id=staff_id,
            service_id=service_id,
            exclude_booking=exclude_booking,
            buffer_before_minutes=buffer_before_minutes,
            buffer_after_minutes=buffer_after_minutes,
        ):
            raise ValidationError(
                "No timeslot available for the selected time. Please choose another slot."
            )

    def _validate_booking_rules(
        self,
        *,
        tenant: Any,
        business: Any,
        start_at: Any,
        exclude_booking: Booking | None,
    ) -> None:
        booking_settings = (
            getattr(getattr(business, "settings", None), "booking_settings", {}) or {}
        )
        min_notice = int(booking_settings.get("minimum_notice_minutes", 0))
        if min_notice and start_at < timezone.now() + timedelta(minutes=min_notice):
            raise ValidationError("Booking violates the minimum notice rule.")
        booking_window_days = int(booking_settings.get("booking_window_days", 0))
        if booking_window_days and start_at.date() > (
            timezone.now().date() + timedelta(days=booking_window_days)
        ):
            raise ValidationError("Booking is outside the allowed advance booking window.")
        max_daily_bookings = int(booking_settings.get("maximum_daily_bookings", 0))
        if max_daily_bookings:
            existing_count = self.repository.daily_count(
                tenant=tenant,
                business=business,
                appointment_date=start_at.date(),
            )
            if exclude_booking:
                existing_count -= 1
            if existing_count >= max_daily_bookings:
                raise ValidationError("Business has reached the maximum daily bookings limit.")

    def _record_state(
        self,
        *,
        booking: Booking,
        from_status: str,
        to_status: str,
        actor: Any,
        reason: str,
        snapshot: dict[str, Any] | None = None,
    ) -> None:
        actor_id = getattr(actor, "id", None) if getattr(actor, "is_authenticated", False) else None
        BookingTimeline.objects.create(
            tenant=booking.tenant,
            booking=booking,
            status=to_status,
            title=f"Booking {to_status}",
            description=reason,
            actor_id=actor_id,
        )
        BookingHistory.objects.create(
            tenant=booking.tenant,
            booking=booking,
            changed_by=actor if getattr(actor, "is_authenticated", False) else None,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
            snapshot=snapshot or {},
        )

    def _booking_number(self) -> str:
        return f"BK-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"
