from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from django.db.models import Count, Q

from apps.bookings.models import Booking, BookingStatus


class AnalyticsService:
    def summary(self, *, tenant: Any, business: Any, start_date: date | None = None, end_date: date | None = None) -> dict[str, Any]:
        queryset = Booking.objects.require_tenant(tenant).filter(business=business)
        if start_date:
            queryset = queryset.filter(appointment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(appointment_date__lte=end_date)
        bookings = queryset.count()
        completed = queryset.filter(status=BookingStatus.COMPLETED).count()
        cancelled = queryset.filter(status=BookingStatus.CANCELLED).count()
        return {
            "bookings": bookings,
            "completed": completed,
            "cancelled": cancelled,
            "period": {"start_date": start_date.isoformat() if start_date else None, "end_date": end_date.isoformat() if end_date else None},
        }
