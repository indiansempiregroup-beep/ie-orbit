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
from apps.businesses.models import Branch, BranchStatus
from apps.businesses.services.entitlements import EntitlementService
from apps.staff.models import Staff

logger = logging.getLogger("ie_platform.bookings")


class BookingService:
    def __init__(
        self,
        *,
        repository: BookingRepository | None = None,
        availability_service: AvailabilityService | None = None,
        event_publisher: BookingEventPublisher | None = None,
        entitlements: EntitlementService | None = None,
    ) -> None:
        self.repository = repository or BookingRepository()
        self.availability_service = availability_service or AvailabilityService(
            repository=self.repository
        )
        self.event_publisher = event_publisher or BookingEventPublisher()
        self.entitlements = entitlements or EntitlementService()

    def _resolve_branch(self, *, business: Any, branch_id: Any | None) -> Branch | None:
        active_branches = list(
            Branch.objects.filter(
                business=business,
                status=BranchStatus.ACTIVE,
                is_active=True,
            ).order_by("-is_primary", "display_name")
        )
        if not active_branches:
            raise ValidationError("At least one office is required before creating bookings.")
        if branch_id:
            for branch in active_branches:
                if str(branch.id) == str(branch_id):
                    return branch
            raise ValidationError({"branch_id": "Selected office was not found for this business."})
        if len(active_branches) == 1:
            return active_branches[0]
        raise ValidationError({"branch_id": "Select an office for this booking."})

    def _ensure_bookable_staff(self, *, tenant: Any, staff_id: Any) -> None:
        if not staff_id:
            return
        staff = (
            Staff.objects.require_tenant(tenant)
            .filter(id=staff_id, is_active=True)
            .first()
        )
        if staff is None:
            raise ValidationError({"staff_id": "Staff member was not found."})
        if not staff.is_bookable:
            raise ValidationError(
                {"staff_id": "This person is not bookable staff and cannot be assigned to bookings."}
            )

    @transaction.atomic
    def create_booking(
        self, *, tenant: Any, business: Any, data: dict[str, Any], actor: Any
    ) -> Booking:
        self.entitlements.ensure_can_create_booking(business=business)
        start_at = data["start_at"]
        duration_minutes = data["duration_minutes"]
        end_at = start_at + timedelta(minutes=duration_minutes)
        validate_time_range(start_at, end_at)
        staff_id = data.get("staff_id")
        service_id = data.get("service_id")
        branch = self._resolve_branch(business=business, branch_id=data.get("branch_id") or data.get("branch"))
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
        self._ensure_bookable_staff(tenant=tenant, staff_id=staff_id)
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
        metadata = dict(data.get("metadata") or {})
        points_to_redeem = data.get("points_to_redeem")
        booking = Booking(
            tenant=tenant,
            business=business,
            branch=branch,
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
            metadata=metadata,
        )
        if getattr(actor, "is_authenticated", False):
            booking.mark_created(actor_id=actor.id)
        booking.full_clean()
        booking.save()
        if points_to_redeem:
            self._redeem_loyalty_on_create(
                booking=booking,
                points_to_redeem=int(points_to_redeem),
            )
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
        if to_status == BookingStatus.COMPLETED and from_status != BookingStatus.COMPLETED:
            self._award_loyalty_on_complete(booking=booking)
        if to_status == BookingStatus.CANCELLED and from_status != BookingStatus.CANCELLED:
            self._refund_loyalty_on_cancel(booking=booking)
        return booking

    def _resolve_loyalty_customer(self, *, booking: Booking):
        from apps.customers.models import Customer

        return (
            Customer.objects.require_tenant(booking.tenant)
            .filter(id=booking.customer_id, business=booking.business)
            .first()
        )

    def _redeem_loyalty_on_create(self, *, booking: Booking, points_to_redeem: int) -> None:
        from apps.customers.services.loyalty import LoyaltyService

        customer = self._resolve_loyalty_customer(booking=booking)
        if customer is None:
            raise ValidationError({"points_to_redeem": "Customer was not found for reward redemption."})
        loyalty = LoyaltyService()
        snapshot = loyalty.redeem_for_booking(
            tenant=booking.tenant,
            business=booking.business,
            customer=customer,
            booking_id=booking.id,
            service_id=booking.service_id,
            points_to_redeem=points_to_redeem,
        )
        metadata = dict(booking.metadata or {})
        metadata["loyalty"] = snapshot
        booking.metadata = metadata
        booking.save(update_fields=["metadata", "updated_at"])

    def _award_loyalty_on_complete(self, *, booking: Booking) -> None:
        try:
            from apps.customers.services.loyalty import LoyaltyService

            customer = self._resolve_loyalty_customer(booking=booking)
            if customer is None:
                return
            LoyaltyService().award_for_completed_booking(
                tenant=booking.tenant,
                business=booking.business,
                customer=customer,
                booking_id=booking.id,
                service_id=booking.service_id,
            )
            from apps.shopie.services.referrals import CustomerReferralService

            CustomerReferralService().maybe_award_for_event(
                tenant=booking.tenant,
                business=booking.business,
                referred=customer,
                event="first_booking",
            )
        except Exception:
            logger.exception(
                "Failed to award loyalty points",
                extra={"booking_id": str(booking.id)},
            )

    def _refund_loyalty_on_cancel(self, *, booking: Booking) -> None:
        try:
            from apps.customers.services.loyalty import LoyaltyService

            loyalty_meta = (booking.metadata or {}).get("loyalty") or {}
            points_redeemed = int(loyalty_meta.get("points_redeemed") or 0)
            if points_redeemed <= 0:
                return
            customer = self._resolve_loyalty_customer(booking=booking)
            if customer is None:
                return
            LoyaltyService().refund_redemption(
                tenant=booking.tenant,
                business=booking.business,
                customer=customer,
                booking_id=booking.id,
                points_redeemed=points_redeemed,
            )
            metadata = dict(booking.metadata or {})
            loyalty_meta = dict(metadata.get("loyalty") or {})
            loyalty_meta["refunded"] = True
            metadata["loyalty"] = loyalty_meta
            booking.metadata = metadata
            booking.save(update_fields=["metadata", "updated_at"])
        except Exception:
            logger.exception(
                "Failed to refund loyalty redemption",
                extra={"booking_id": str(booking.id)},
            )

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
