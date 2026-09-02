from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.bookings.models import (
    Booking,
    BookingHistory,
    BookingLineItem,
    BookingStatus,
    BookingTimeline,
)
from apps.bookings.repositories import BookingRepository
from apps.bookings.services.availability import AvailabilityService
from apps.bookings.services.events import BookingEventPublisher
from apps.bookings.services.multi_service_scheduler import MultiServiceScheduler
from apps.bookings.validators import validate_booking_transition, validate_time_range
from apps.businesses.models import Branch, BranchStatus
from apps.businesses.services.entitlements import EntitlementService
from apps.staff.models import Staff

logger = logging.getLogger("ie_orbit.bookings")


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
        self.multi_service_scheduler = MultiServiceScheduler(
            availability_service=self.availability_service
        )

    def _normalize_booking_items(self, *, tenant: Any, data: dict[str, Any]) -> list[dict[str, Any]]:
        raw_items = data.get("items")
        if raw_items:
            return list(raw_items)
        service_id = data.get("service_id")
        if not service_id:
            raise ValidationError({"items": "Provide items or service_id."})
        return [
            {
                "service_id": service_id,
                "duration_minutes": data.get("duration_minutes"),
            }
        ]

    def _create_line_items(
        self, *, tenant: Any, booking: Booking, plan: Any
    ) -> list[BookingLineItem]:
        rows: list[BookingLineItem] = []
        for planned in plan.line_items:
            row = BookingLineItem(
                tenant=tenant,
                booking=booking,
                service_id=planned.service_id,
                staff_id=planned.staff_id,
                start_at=planned.start_at,
                end_at=planned.end_at,
                duration_minutes=planned.duration_minutes,
                buffer_before_minutes=planned.buffer_before_minutes,
                buffer_after_minutes=planned.buffer_after_minutes,
                sort_order=planned.sort_order,
                price_snapshot=planned.price_snapshot,
            )
            row.full_clean()
            row.save()
            rows.append(row)
        return rows

    def _total_line_item_price(self, plan: Any):
        from decimal import Decimal

        total = Decimal("0.00")
        for planned in plan.line_items:
            total += Decimal(planned.price_snapshot or 0)
        return total

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

    def _assigned_staff_ids(self, booking: Booking) -> set[str]:
        ids: set[str] = set()
        if booking.staff_id:
            ids.add(str(booking.staff_id))
        for item in booking.line_items.all():
            if item.staff_id:
                ids.add(str(item.staff_id))
        return ids

    def _notify_staff_assignment_changes(
        self,
        *,
        booking: Booking,
        previous_line_staff: dict[str, str],
    ) -> None:
        from apps.bookings.services.notification_context import (
            build_staff_assignment_notification,
            staff_assignment_changes,
        )
        from apps.notifications.services.staff_direct import StaffDirectNotifier

        changes = staff_assignment_changes(
            booking=booking,
            previous_line_staff=previous_line_staff,
        )
        if not changes:
            return

        notifier = StaffDirectNotifier()
        for staff_id, items in changes.items():
            subject, body = build_staff_assignment_notification(
                booking=booking,
                staff_id=staff_id,
                items=items,
            )
            notifier.notify_staff_members(
                tenant=booking.tenant,
                business=booking.business,
                staff_ids=[staff_id],
                subject=subject,
                body=body,
                event_type="BookingStaffAssigned",
                metadata={"booking_id": str(booking.id)},
                channels=["in_app", "email"],
            )

    def _notify_newly_assigned_staff(
        self,
        *,
        booking: Booking,
        previous_staff_ids: set[str],
        added_staff_ids: set[str],
    ) -> None:
        staff_to_notify = {staff_id for staff_id in added_staff_ids if staff_id not in previous_staff_ids}
        if not staff_to_notify:
            return

        from apps.bookings.api.display import booking_service_summary, build_booking_display_context
        from apps.notifications.services.notifications import format_booking_start_label
        from apps.notifications.services.staff_direct import StaffDirectNotifier

        context = build_booking_display_context(tenant=booking.tenant, bookings=[booking])
        customer_map = context.get("customer_map") or {}
        service_map = context.get("service_map") or {}
        customer = customer_map.get(str(booking.customer_id))
        customer_name = (customer.display_name if customer is not None else None) or "Customer"
        service_name = booking_service_summary(booking=booking, service_map=service_map)
        start_label = format_booking_start_label(
            start_at=booking.start_at,
            business=booking.business,
        )
        subject = f"Assigned · {service_name}"
        body = (
            f"You have been assigned to booking {booking.booking_number} for {customer_name} "
            f"({service_name}) on {start_label}."
        )
        StaffDirectNotifier().notify_staff_members(
            tenant=booking.tenant,
            business=booking.business,
            staff_ids=list(staff_to_notify),
            subject=subject,
            body=body,
            event_type="BookingStaffAssigned",
            metadata={"booking_id": str(booking.id)},
            channels=["in_app", "email"],
        )

    def _apply_booking_plan(
        self,
        *,
        booking: Booking,
        plan: Any,
        data: dict[str, Any],
        actor: Any,
        skip_fields: set[str] | None = None,
    ) -> Booking:
        skip = skip_fields or set()
        skip |= {"staff_id", "line_item_staff", "start_at", "duration_minutes", "end_at"}
        booking.line_items.all().delete()
        booking.start_at = plan.start_at
        booking.end_at = plan.end_at
        booking.duration_minutes = plan.total_duration_minutes
        booking.buffer_before_minutes = plan.buffer_before_minutes
        booking.buffer_after_minutes = plan.buffer_after_minutes
        booking.staff_id = plan.primary_staff_id
        booking.service_id = plan.primary_service_id
        booking.appointment_date = plan.start_at.date()
        for field, value in data.items():
            if field not in skip:
                setattr(booking, field, value)
        if getattr(actor, "is_authenticated", False):
            booking.mark_updated(actor_id=actor.id)
        booking.full_clean()
        booking.save()
        self._create_line_items(tenant=booking.tenant, booking=booking, plan=plan)
        return booking

    def _staff_overrides_from_line_items(self, line_items: list[BookingLineItem]) -> dict[int, UUID]:
        overrides: dict[int, UUID] = {}
        for item in line_items:
            if item.staff_id:
                overrides[item.sort_order] = UUID(str(item.staff_id))
        return overrides

    def _line_item_segment_buffers(
        self,
        *,
        item: BookingLineItem,
        index: int,
        last_index: int,
    ) -> tuple[int, int]:
        defaults = self.availability_service.service_buffer_defaults(service_id=item.service_id)
        buffer_before = int(item.buffer_before_minutes or defaults.before_minutes) if index == 0 else 0
        buffer_after = int(item.buffer_after_minutes or defaults.after_minutes) if index == last_index else 0
        return buffer_before, buffer_after

    def _replan_booking_staff(
        self,
        *,
        booking: Booking,
        line_items: list[BookingLineItem],
        data: dict[str, Any],
        actor: Any,
        staff_overrides: dict[int, UUID] | None = None,
        preferred_staff_id: Any | None = None,
    ) -> Booking:
        """Reassign staff while keeping each line item's scheduled times."""
        from apps.bookings.services.notification_context import line_item_staff_map

        previous_line_staff = line_item_staff_map(booking)
        ordered = list(line_items)
        last_index = len(ordered) - 1

        for index, item in enumerate(ordered):
            sort_order = int(item.sort_order)
            staff_id: UUID | None = None
            if staff_overrides is not None:
                staff_id = staff_overrides.get(sort_order)
            elif preferred_staff_id:
                staff_id = UUID(str(preferred_staff_id))

            buffer_before, buffer_after = self._line_item_segment_buffers(
                item=item,
                index=index,
                last_index=last_index,
            )

            if not staff_id:
                assigned = self.availability_service.assign_available_staff(
                    tenant=booking.tenant,
                    business=booking.business,
                    start_at=item.start_at,
                    end_at=item.end_at,
                    service_id=item.service_id,
                    exclude_booking=booking,
                    buffer_before_minutes=buffer_before,
                    buffer_after_minutes=buffer_after,
                )
                if not assigned:
                    raise ValidationError(
                        "No timeslot available for the selected staff at this time. "
                        "Try another staff member or reschedule."
                    )
                staff_id = UUID(str(assigned))

            self._ensure_bookable_staff(tenant=booking.tenant, staff_id=staff_id)
            if not self.availability_service.staff_can_perform_service(
                tenant=booking.tenant,
                staff_id=staff_id,
                service_id=item.service_id,
            ):
                raise ValidationError(
                    "This staff member is not assigned to the selected service. "
                    "Assign the service on the staff availability page, or choose another staff member."
                )
            if not self.availability_service.staff_segment_is_available(
                tenant=booking.tenant,
                business=booking.business,
                staff_id=staff_id,
                start_at=item.start_at,
                end_at=item.end_at,
                exclude_booking=booking,
                buffer_before_minutes=buffer_before,
                buffer_after_minutes=buffer_after,
            ):
                raise ValidationError(
                    "No timeslot available for the selected staff at this time. "
                    "Try another staff member or reschedule."
                )

            if str(item.staff_id or "") != str(staff_id):
                item.staff_id = staff_id
                item.save(update_fields=["staff_id", "updated_at"])

        booking.staff_id = ordered[0].staff_id if ordered else booking.staff_id
        skip = {"staff_id", "line_item_staff", "start_at", "duration_minutes", "end_at"}
        for field, value in data.items():
            if field not in skip:
                setattr(booking, field, value)
        if getattr(actor, "is_authenticated", False):
            booking.mark_updated(actor_id=actor.id)
        booking.full_clean()
        booking.save()
        self._notify_staff_assignment_changes(
            booking=booking,
            previous_line_staff=previous_line_staff,
        )
        return booking

    @transaction.atomic
    def create_booking(
        self, *, tenant: Any, business: Any, data: dict[str, Any], actor: Any
    ) -> Booking:
        self.entitlements.ensure_can_create_booking(business=business)
        start_at = data["start_at"]
        branch = self._resolve_branch(business=business, branch_id=data.get("branch_id") or data.get("branch"))
        raw_items = self._normalize_booking_items(tenant=tenant, data=data)
        normalized_items = self.multi_service_scheduler.normalize_items(
            tenant=tenant, items=raw_items
        )
        preferred_staff_id = data.get("staff_id")
        plan = self.multi_service_scheduler.plan(
            tenant=tenant,
            business=business,
            items=normalized_items,
            start_at=start_at,
            preferred_staff_id=preferred_staff_id,
        )
        if plan is None:
            raise ValidationError(
                "No timeslot available. No staff is available at the selected time."
            )

        end_at = plan.end_at
        validate_time_range(start_at, end_at)
        staff_id = plan.primary_staff_id
        service_id = plan.primary_service_id
        if staff_id:
            self._ensure_bookable_staff(tenant=tenant, staff_id=staff_id)

        self._validate_booking_rules(
            tenant=tenant,
            business=business,
            start_at=start_at,
            exclude_booking=None,
        )
        if start_at <= timezone.now():
            raise ValidationError("Selected time is in the past. Choose a later timeslot.")

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
            duration_minutes=plan.total_duration_minutes,
            buffer_before_minutes=plan.buffer_before_minutes,
            buffer_after_minutes=plan.buffer_after_minutes,
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
        self._create_line_items(tenant=tenant, booking=booking, plan=plan)
        if points_to_redeem:
            self._redeem_loyalty_on_create(
                booking=booking,
                points_to_redeem=int(points_to_redeem),
                total_amount=self._total_line_item_price(plan),
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
        line_items = list(booking.line_items.order_by("sort_order", "start_at"))

        if line_items and "line_item_staff" in data:
            if "staff_id" in data:
                raise ValidationError("Provide either staff_id or line_item_staff, not both.")
            payload = data.get("line_item_staff") or []
            if not payload:
                raise ValidationError({"line_item_staff": "Provide at least one line item assignment."})

            line_item_map = {str(item.id): item for item in line_items}
            staff_by_line_id: dict[str, Any] = {}
            for row in payload:
                line_item_id = str(row["line_item_id"])
                if line_item_id not in line_item_map:
                    raise ValidationError(
                        {"line_item_staff": f"Line item {line_item_id} was not found on this booking."}
                    )
                staff_by_line_id[line_item_id] = row.get("staff_id")

            staff_overrides: dict[int, UUID] = {}
            for item in line_items:
                line_id = str(item.id)
                if line_id in staff_by_line_id:
                    staff_id = staff_by_line_id[line_id]
                    if staff_id:
                        self._ensure_bookable_staff(tenant=booking.tenant, staff_id=staff_id)
                        staff_overrides[item.sort_order] = UUID(str(staff_id))
                elif item.staff_id:
                    staff_overrides[item.sort_order] = UUID(str(item.staff_id))

            return self._replan_booking_staff(
                booking=booking,
                line_items=line_items,
                data=data,
                actor=actor,
                staff_overrides=staff_overrides,
            )

        if line_items and "staff_id" in data and "start_at" not in data and "duration_minutes" not in data:
            preferred_staff_id = data.get("staff_id")
            if preferred_staff_id:
                self._ensure_bookable_staff(tenant=booking.tenant, staff_id=preferred_staff_id)
                staff_overrides = {
                    int(item.sort_order): UUID(str(preferred_staff_id)) for item in line_items
                }
            else:
                staff_overrides = {}
            return self._replan_booking_staff(
                booking=booking,
                line_items=line_items,
                data=data,
                actor=actor,
                staff_overrides=staff_overrides,
            )

        previous_staff_ids = self._assigned_staff_ids(booking) if "staff_id" in data else set()
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
        if "staff_id" in data:
            self._notify_newly_assigned_staff(
                booking=booking,
                previous_staff_ids=previous_staff_ids,
                added_staff_ids=self._assigned_staff_ids(booking),
            )
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

    def _redeem_loyalty_on_create(
        self, *, booking: Booking, points_to_redeem: int, total_amount: Any | None = None
    ) -> None:
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
            amount=total_amount,
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
            line_items = list(booking.line_items.order_by("sort_order", "start_at"))
            if line_items:
                LoyaltyService().award_for_completed_booking_items(
                    tenant=booking.tenant,
                    business=booking.business,
                    customer=customer,
                    booking_id=booking.id,
                    line_items=line_items,
                )
            else:
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
        line_items = list(booking.line_items.order_by("sort_order", "start_at"))
        if line_items:
            raw_items = [
                {
                    "service_id": item.service_id,
                    "duration_minutes": item.duration_minutes,
                    "sort_order": item.sort_order,
                }
                for item in line_items
            ]
            normalized_items = self.multi_service_scheduler.normalize_items(
                tenant=booking.tenant, items=raw_items
            )
            staff_overrides = self._staff_overrides_from_line_items(line_items)
            if staff_overrides:
                plan = self.multi_service_scheduler.plan_with_staff_overrides(
                    tenant=booking.tenant,
                    business=booking.business,
                    items=normalized_items,
                    start_at=start_at,
                    staff_overrides=staff_overrides,
                    exclude_booking=booking,
                )
            else:
                plan = None
            if plan is None:
                plan = self.multi_service_scheduler.plan(
                    tenant=booking.tenant,
                    business=booking.business,
                    items=normalized_items,
                    start_at=start_at,
                    preferred_staff_id=booking.staff_id,
                    exclude_booking=booking,
                )
            if plan is None:
                raise ValidationError(
                    "No timeslot available for the selected time. Please choose another slot."
                )
            booking.line_items.all().delete()
            booking.start_at = plan.start_at
            booking.end_at = plan.end_at
            booking.duration_minutes = plan.total_duration_minutes
            booking.buffer_before_minutes = plan.buffer_before_minutes
            booking.buffer_after_minutes = plan.buffer_after_minutes
            booking.staff_id = plan.primary_staff_id
            booking.service_id = plan.primary_service_id
            booking.appointment_date = start_at.date()
            booking.reschedule_reason = reason
            booking.save()
            self._create_line_items(tenant=booking.tenant, booking=booking, plan=plan)
        else:
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
