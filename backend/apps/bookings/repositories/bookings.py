from __future__ import annotations

from datetime import date, datetime
from typing import Any

from django.db.models import QuerySet

from apps.bookings.models import Booking, BookingStatus
from apps.common.utils.workspace_access import (
    is_workspace_manager_or_above,
    scope_bookings_queryset_for_user,
)


class BookingRepository:
    permissions = {"booking:read", "booking:write", "booking:manage"}

    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Booking]:
        queryset = Booking.objects.require_tenant(tenant).select_related("business", "review")
        if getattr(user, "is_superuser", False):
            return queryset
        if is_workspace_manager_or_above(user=user, tenant=tenant):
            return queryset
        if self._has_booking_permission(user):
            return scope_bookings_queryset_for_user(queryset, tenant=tenant, user=user)
        return queryset.filter(tenant__owner=user)

    def get_for_request(self, *, booking_id: str, tenant: Any, user: Any) -> Booking:
        return self.list_for_request(tenant=tenant, user=user).get(id=booking_id)

    def conflicts(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any | None,
        start_at: datetime,
        end_at: datetime,
        exclude_booking: Booking | None = None,
    ) -> QuerySet[Booking]:
        queryset = Booking.objects.require_tenant(tenant).filter(
            business=business,
            start_at__lt=end_at,
            end_at__gt=start_at,
            status__in=[
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.CHECKED_IN,
                BookingStatus.IN_PROGRESS,
            ],
        )
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        if exclude_booking:
            queryset = queryset.exclude(id=exclude_booking.id)
        return queryset

    def conflict_count(
        self,
        *,
        tenant: Any,
        business: Any,
        staff_id: Any | None,
        start_at: datetime,
        end_at: datetime,
        exclude_booking: Booking | None = None,
        respect_booking_buffers: bool = False,
    ) -> int:
        """Count active bookings overlapping [start_at, end_at].

        When respect_booking_buffers is True, each booking is expanded by its own
        buffer_before_minutes / buffer_after_minutes before overlap is tested.
        """
        if not respect_booking_buffers:
            return self.conflicts(
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                start_at=start_at,
                end_at=end_at,
                exclude_booking=exclude_booking,
            ).count()

        from datetime import timedelta

        # Widen the DB filter so buffered bookings just outside the window are included.
        pad = timedelta(hours=12)
        queryset = Booking.objects.require_tenant(tenant).filter(
            business=business,
            start_at__lt=end_at + pad,
            end_at__gt=start_at - pad,
            status__in=[
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.CHECKED_IN,
                BookingStatus.IN_PROGRESS,
            ],
        )
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        if exclude_booking:
            queryset = queryset.exclude(id=exclude_booking.id)

        count = 0
        for booking in queryset.only(
            "id", "start_at", "end_at", "buffer_before_minutes", "buffer_after_minutes"
        ):
            effective_start = booking.start_at - timedelta(
                minutes=int(booking.buffer_before_minutes or 0)
            )
            effective_end = booking.end_at + timedelta(
                minutes=int(booking.buffer_after_minutes or 0)
            )
            if effective_start < end_at and effective_end > start_at:
                count += 1
        return count

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        params: dict[str, Any],
    ) -> QuerySet[Booking]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if params.get("business"):
            queryset = queryset.filter(business_id=params["business"])
        if params.get("customer"):
            queryset = queryset.filter(customer_id=params["customer"])
        if params.get("staff"):
            queryset = queryset.filter(staff_id=params["staff"])
        if params.get("service"):
            queryset = queryset.filter(service_id=params["service"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("booking_id"):
            queryset = queryset.filter(booking_number__icontains=params["booking_id"])
        if params.get("date"):
            queryset = queryset.filter(appointment_date=params["date"])
        if params.get("date_from"):
            queryset = queryset.filter(appointment_date__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(appointment_date__lte=params["date_to"])
        return queryset

    def daily_count(self, *, tenant: Any, business: Any, appointment_date: date) -> int:
        return (
            Booking.objects.require_tenant(tenant)
            .filter(
                business=business,
                appointment_date=appointment_date,
            )
            .count()
        )

    def _has_booking_permission(self, user: Any) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=self.permissions,
            role__role_permissions__permission__is_active=True,
        ).exists()
