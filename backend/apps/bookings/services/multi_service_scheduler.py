from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError

from apps.bookings.services.availability import AvailabilityService, BufferPair


@dataclass(frozen=True)
class ServiceItemInput:
    service_id: UUID
    duration_minutes: int | None = None
    sort_order: int = 0


@dataclass(frozen=True)
class PlannedLineItem:
    service_id: UUID
    staff_id: UUID
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    buffer_before_minutes: int
    buffer_after_minutes: int
    sort_order: int
    price_snapshot: Decimal


@dataclass(frozen=True)
class BookingPlan:
    line_items: list[PlannedLineItem]
    buffer_before_minutes: int
    buffer_after_minutes: int
    total_duration_minutes: int

    @property
    def start_at(self) -> datetime:
        return self.line_items[0].start_at

    @property
    def end_at(self) -> datetime:
        return self.line_items[-1].end_at

    @property
    def primary_service_id(self) -> UUID:
        return self.line_items[0].service_id

    @property
    def primary_staff_id(self) -> UUID | None:
        return self.line_items[0].staff_id


class MultiServiceScheduler:
    def __init__(self, availability_service: AvailabilityService | None = None) -> None:
        self.availability = availability_service or AvailabilityService()

    def normalize_items(self, *, tenant: Any, items: list[dict[str, Any]]) -> list[ServiceItemInput]:
        if not items:
            raise ValidationError({"items": "At least one service is required."})
        normalized: list[ServiceItemInput] = []
        for index, raw in enumerate(items):
            service_id = raw.get("service_id")
            if not service_id:
                raise ValidationError({"items": "Each item must include service_id."})
            duration = raw.get("duration_minutes")
            if duration is None:
                duration = self.availability.default_service_duration_minutes(service_id=service_id)
            duration = int(duration)
            if duration < 1:
                raise ValidationError({"items": "Each service must have a positive duration."})
            sort_order = raw.get("sort_order", index)
            normalized.append(
                ServiceItemInput(
                    service_id=UUID(str(service_id)),
                    duration_minutes=duration,
                    sort_order=int(sort_order),
                )
            )
        normalized.sort(key=lambda item: item.sort_order)
        return normalized

    def resolve_service_price(self, *, tenant: Any, service_id: UUID) -> Decimal:
        from apps.services.models import ServicePricing

        pricing = (
            ServicePricing.objects.require_tenant(tenant)
            .filter(service_id=service_id, is_default=True)
            .order_by("id")
            .first()
        )
        if pricing is None:
            pricing = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service_id=service_id)
                .order_by("id")
                .first()
            )
        if pricing is None:
            return Decimal("0.00")
        if pricing.sale_price is not None:
            return Decimal(pricing.sale_price)
        return Decimal(pricing.base_price or 0)

    def plan(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        preferred_staff_id: Any | None = None,
        exclude_booking: Any | None = None,
    ) -> BookingPlan | None:
        if not items:
            return None

        service_ids = [item.service_id for item in items]
        first_buffers = self.availability.service_buffer_defaults(service_id=service_ids[0])
        last_buffers = self.availability.service_buffer_defaults(service_id=service_ids[-1])
        combined_buffers = BufferPair(
            before_minutes=first_buffers.before_minutes,
            after_minutes=last_buffers.after_minutes,
        )
        total_duration = sum(item.duration_minutes or 0 for item in items)

        if preferred_staff_id:
            return self._plan_single_staff(
                tenant=tenant,
                business=business,
                items=items,
                start_at=start_at,
                staff_id=preferred_staff_id,
                exclude_booking=exclude_booking,
            )

        plan = self._plan_single_staff_any(
            tenant=tenant,
            business=business,
            items=items,
            start_at=start_at,
            exclude_booking=exclude_booking,
        )
        if plan is not None:
            return plan

        plan = self._plan_multi_staff_chain(
            tenant=tenant,
            business=business,
            items=items,
            start_at=start_at,
            exclude_booking=exclude_booking,
        )
        if plan is None:
            return None

        return BookingPlan(
            line_items=plan,
            buffer_before_minutes=combined_buffers.before_minutes,
            buffer_after_minutes=combined_buffers.after_minutes,
            total_duration_minutes=total_duration,
        )

    def can_plan_at(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        preferred_staff_id: Any | None = None,
        exclude_booking: Any | None = None,
    ) -> bool:
        return self.plan(
            tenant=tenant,
            business=business,
            items=items,
            start_at=start_at,
            preferred_staff_id=preferred_staff_id,
            exclude_booking=exclude_booking,
        ) is not None

    def plan_with_staff_overrides(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        staff_overrides: dict[int, UUID],
        exclude_booking: Any | None = None,
    ) -> BookingPlan | None:
        """Plan a chained visit, honoring per-service staff picks where provided."""
        if not items:
            return None

        service_ids = [item.service_id for item in items]
        first_buffers = self.availability.service_buffer_defaults(service_id=service_ids[0])
        last_buffers = self.availability.service_buffer_defaults(service_id=service_ids[-1])
        total_duration = sum(item.duration_minutes or 0 for item in items)

        line_items: list[PlannedLineItem] = []
        cursor = start_at
        for index, item in enumerate(items):
            duration = int(item.duration_minutes or 0)
            item_end = cursor + timedelta(minutes=duration)
            item_buffers = self.availability.service_buffer_defaults(service_id=item.service_id)
            preferred_staff_id = staff_overrides.get(item.sort_order)
            staff_id: UUID | None = None

            if preferred_staff_id:
                if not self.availability.staff_can_perform_service(
                    tenant=tenant,
                    staff_id=preferred_staff_id,
                    service_id=item.service_id,
                ):
                    return None
                if not self.availability.staff_segment_is_available(
                    tenant=tenant,
                    business=business,
                    staff_id=preferred_staff_id,
                    start_at=cursor,
                    end_at=item_end,
                    exclude_booking=exclude_booking,
                    buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                    buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
                ):
                    return None
                staff_id = UUID(str(preferred_staff_id))
            else:
                assigned = self.availability.assign_available_staff(
                    tenant=tenant,
                    business=business,
                    start_at=cursor,
                    end_at=item_end,
                    service_id=item.service_id,
                    exclude_booking=exclude_booking,
                    buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                    buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
                )
                if not assigned:
                    return None
                staff_id = UUID(str(assigned))

            line_items.append(
                PlannedLineItem(
                    service_id=item.service_id,
                    staff_id=staff_id,
                    start_at=cursor,
                    end_at=item_end,
                    duration_minutes=duration,
                    buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                    buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
                    sort_order=item.sort_order,
                    price_snapshot=self.resolve_service_price(tenant=tenant, service_id=item.service_id),
                )
            )
            cursor = item_end

        return BookingPlan(
            line_items=line_items,
            buffer_before_minutes=first_buffers.before_minutes,
            buffer_after_minutes=last_buffers.after_minutes,
            total_duration_minutes=total_duration,
        )

    def _plan_single_staff(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        staff_id: Any,
        exclude_booking: Any | None,
    ) -> BookingPlan | None:
        service_ids = [item.service_id for item in items]
        for service_id in service_ids:
            if not self.availability.staff_can_perform_service(
                tenant=tenant, staff_id=staff_id, service_id=service_id
            ):
                return None

        total_duration = sum(item.duration_minutes or 0 for item in items)
        end_at = start_at + timedelta(minutes=total_duration)
        first_buffers = self.availability.service_buffer_defaults(service_id=service_ids[0])
        last_buffers = self.availability.service_buffer_defaults(service_id=service_ids[-1])

        if not self.availability.staff_segment_is_available(
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            start_at=start_at,
            end_at=end_at,
            exclude_booking=exclude_booking,
            buffer_before_minutes=first_buffers.before_minutes,
            buffer_after_minutes=last_buffers.after_minutes,
        ):
            return None

        line_items: list[PlannedLineItem] = []
        cursor = start_at
        for index, item in enumerate(items):
            duration = int(item.duration_minutes or 0)
            item_end = cursor + timedelta(minutes=duration)
            item_buffers = self.availability.service_buffer_defaults(service_id=item.service_id)
            line_items.append(
                PlannedLineItem(
                    service_id=item.service_id,
                    staff_id=UUID(str(staff_id)),
                    start_at=cursor,
                    end_at=item_end,
                    duration_minutes=duration,
                    buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                    buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
                    sort_order=item.sort_order,
                    price_snapshot=self.resolve_service_price(tenant=tenant, service_id=item.service_id),
                )
            )
            cursor = item_end

        return BookingPlan(
            line_items=line_items,
            buffer_before_minutes=first_buffers.before_minutes,
            buffer_after_minutes=last_buffers.after_minutes,
            total_duration_minutes=total_duration,
        )

    def _plan_single_staff_any(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        exclude_booking: Any | None,
    ) -> BookingPlan | None:
        service_ids = [item.service_id for item in items]
        eligible = self.availability.staff_eligible_for_all_services(
            tenant=tenant, business=business, service_ids=service_ids
        )
        for staff_id in eligible:
            plan = self._plan_single_staff(
                tenant=tenant,
                business=business,
                items=items,
                start_at=start_at,
                staff_id=staff_id,
                exclude_booking=exclude_booking,
            )
            if plan is not None:
                return plan
        return None

    def _plan_multi_staff_chain(
        self,
        *,
        tenant: Any,
        business: Any,
        items: list[ServiceItemInput],
        start_at: datetime,
        exclude_booking: Any | None,
    ) -> list[PlannedLineItem] | None:
        line_items: list[PlannedLineItem] = []
        cursor = start_at
        for index, item in enumerate(items):
            duration = int(item.duration_minutes or 0)
            item_end = cursor + timedelta(minutes=duration)
            item_buffers = self.availability.service_buffer_defaults(service_id=item.service_id)
            staff_id = self.availability.assign_available_staff(
                tenant=tenant,
                business=business,
                start_at=cursor,
                end_at=item_end,
                service_id=item.service_id,
                exclude_booking=exclude_booking,
                buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
            )
            if not staff_id:
                return None
            line_items.append(
                PlannedLineItem(
                    service_id=item.service_id,
                    staff_id=UUID(str(staff_id)),
                    start_at=cursor,
                    end_at=item_end,
                    duration_minutes=duration,
                    buffer_before_minutes=item_buffers.before_minutes if index == 0 else 0,
                    buffer_after_minutes=item_buffers.after_minutes if index == len(items) - 1 else 0,
                    sort_order=item.sort_order,
                    price_snapshot=self.resolve_service_price(tenant=tenant, service_id=item.service_id),
                )
            )
            cursor = item_end
        return line_items
