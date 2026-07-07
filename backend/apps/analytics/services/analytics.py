from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.businesses.models import Business
from apps.services.models import Service, ServicePricing


class AnalyticsService:
    def summary(
        self,
        *,
        tenant: Any,
        business: Any,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        queryset = Booking.objects.require_tenant(tenant).filter(business=business)
        if start_date:
            queryset = queryset.filter(appointment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(appointment_date__lte=end_date)
        bookings = queryset.count()
        completed = queryset.filter(status=BookingStatus.COMPLETED).count()
        cancelled = queryset.filter(status=BookingStatus.CANCELLED).count()
        pending = queryset.filter(status=BookingStatus.PENDING).count()
        return {
            "bookings": bookings,
            "completed": completed,
            "cancelled": cancelled,
            "pending": pending,
            "completion_rate": round(completed / bookings, 4) if bookings else 0,
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        }

    def trends(
        self,
        *,
        tenant: Any,
        business: Any,
        start_date: date,
        end_date: date,
    ) -> dict[str, Any]:
        rows_map: dict[str, dict[str, int | str]] = {}
        bookings = Booking.objects.require_tenant(tenant).filter(
            business=business,
            appointment_date__gte=start_date,
            appointment_date__lte=end_date,
        )
        for booking in bookings:
            key = booking.appointment_date.isoformat()
            row = rows_map.setdefault(key, {"day": key, "total": 0, "completed": 0, "cancelled": 0})
            row["total"] = int(row["total"]) + 1
            if booking.status == BookingStatus.COMPLETED:
                row["completed"] = int(row["completed"]) + 1
            if booking.status == BookingStatus.CANCELLED:
                row["cancelled"] = int(row["cancelled"]) + 1
        rows = [rows_map[key] for key in sorted(rows_map.keys())]
        return {"rows": rows, "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat()}}

    def revenue(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        queryset = Booking.objects.require_tenant(tenant).filter(business=business)
        if start_date:
            queryset = queryset.filter(appointment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(appointment_date__lte=end_date)
        services = Service.objects.require_tenant(tenant).filter(business=business)
        price_by_service: dict[str, float] = {}
        for service in services:
            default_price = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service=service, is_default=True)
                .order_by("-created_at")
                .first()
            )
            price_by_service[str(service.id)] = float(default_price.base_price) if default_price else 0.0

        total_revenue = 0.0
        by_service: dict[str, float] = {}
        for booking in queryset:
            if not booking.service_id:
                continue
            amount = price_by_service.get(str(booking.service_id), 0.0)
            total_revenue += amount
            key = str(booking.service_id)
            by_service[key] = by_service.get(key, 0.0) + amount

        service_rows = []
        for service in services:
            service_id = str(service.id)
            if service_id not in by_service:
                continue
            service_rows.append(
                {
                    "service_id": service_id,
                    "service_name": service.display_name or service.name,
                    "revenue": round(by_service[service_id], 2),
                }
            )
        service_rows.sort(key=lambda row: row["revenue"], reverse=True)
        return {
            "estimated_revenue": round(total_revenue, 2),
            "currency": business.currency,
            "by_service": service_rows,
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        }

    def forecast(
        self,
        *,
        tenant: Any,
        business: Business,
        horizon_days: int = 30,
    ) -> dict[str, Any]:
        horizon_days = max(7, min(horizon_days, 90))
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=29)
        trends = self.trends(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        rows = trends["rows"]
        if not rows:
            projected_bookings = 0
        else:
            avg_daily = sum(row["total"] for row in rows) / len(rows)
            projected_bookings = int(round(avg_daily * horizon_days))
        revenue = self.revenue(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        avg_daily_revenue = revenue["estimated_revenue"] / max(len(rows), 1)
        return {
            "horizon_days": horizon_days,
            "projected_bookings": projected_bookings,
            "projected_revenue": round(avg_daily_revenue * horizon_days, 2),
            "currency": business.currency,
            "based_on_days": len(rows),
        }

    def reports(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        summary = self.summary(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        revenue = self.revenue(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        if start_date and end_date:
            trends = self.trends(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        else:
            end = timezone.now().date()
            start = end - timedelta(days=29)
            trends = self.trends(tenant=tenant, business=business, start_date=start, end_date=end)
        return {
            "summary": summary,
            "revenue": revenue,
            "trends": trends,
        }
