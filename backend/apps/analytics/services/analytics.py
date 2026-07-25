from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.services.models import Service, ServicePricing
from apps.staff.models import Staff

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class AnalyticsService:
    def summary(
        self,
        *,
        tenant: Any,
        business: Any,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date))
        stats = self._status_counts(bookings)
        period_days = self._period_days(start_date, end_date) or 1
        comparison = None
        if start_date and end_date:
            prev_start, prev_end = self._previous_period(start_date, end_date)
            prev_bookings = list(self._booking_queryset(tenant, business, prev_start, prev_end))
            prev_stats = self._status_counts(prev_bookings)
            prices = self._price_map(tenant, business)
            curr_revenue = self._estimate_revenue(bookings, prices)
            prev_revenue = self._estimate_revenue(prev_bookings, prices)
            comparison = {
                "bookings_change_pct": self._change_pct(stats["bookings"], prev_stats["bookings"]),
                "completed_change_pct": self._change_pct(stats["completed"], prev_stats["completed"]),
                "revenue_change_pct": self._change_pct(curr_revenue, prev_revenue),
                "previous_period": {
                    "start_date": prev_start.isoformat(),
                    "end_date": prev_end.isoformat(),
                    "bookings": prev_stats["bookings"],
                    "completed": prev_stats["completed"],
                    "estimated_revenue": round(prev_revenue, 2),
                },
            }
        return {
            **stats,
            "completion_rate": round(stats["completed"] / stats["bookings"], 4) if stats["bookings"] else 0,
            "cancellation_rate": round(stats["cancelled"] / stats["bookings"], 4) if stats["bookings"] else 0,
            "no_show_rate": round(stats["no_shows"] / stats["bookings"], 4) if stats["bookings"] else 0,
            "avg_bookings_per_day": round(stats["bookings"] / period_days, 2),
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
            "comparison": comparison,
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
        bookings = self._booking_queryset(tenant, business, start_date, end_date)
        for booking in bookings:
            key = booking.appointment_date.isoformat()
            row = rows_map.setdefault(key, {"day": key, "total": 0, "completed": 0, "cancelled": 0, "no_shows": 0})
            row["total"] = int(row["total"]) + 1
            if booking.status == BookingStatus.COMPLETED:
                row["completed"] = int(row["completed"]) + 1
            if booking.status == BookingStatus.CANCELLED:
                row["cancelled"] = int(row["cancelled"]) + 1
            if booking.status == BookingStatus.NO_SHOW:
                row["no_shows"] = int(row["no_shows"]) + 1
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
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date))
        prices = self._price_map(tenant, business)
        services = {
            str(service.id): service
            for service in Service.objects.require_tenant(tenant).filter(business=business)
        }

        total_revenue = 0.0
        completed_revenue = 0.0
        by_service: dict[str, dict[str, float | int]] = {}
        priced_bookings = 0

        for booking in bookings:
            if not booking.service_id:
                continue
            service_id = str(booking.service_id)
            amount = prices.get(service_id, 0.0)
            bucket = by_service.setdefault(
                service_id,
                {"revenue": 0.0, "completed_revenue": 0.0, "bookings": 0, "completed": 0},
            )
            bucket["bookings"] = int(bucket["bookings"]) + 1
            bucket["revenue"] = float(bucket["revenue"]) + amount
            total_revenue += amount
            priced_bookings += 1
            if booking.status == BookingStatus.COMPLETED:
                bucket["completed"] = int(bucket["completed"]) + 1
                bucket["completed_revenue"] = float(bucket["completed_revenue"]) + amount
                completed_revenue += amount

        service_rows = []
        for service_id, values in by_service.items():
            service = services.get(service_id)
            service_rows.append(
                {
                    "service_id": service_id,
                    "service_name": (
                        (service.display_name or service.name) if service else service_id
                    ),
                    "revenue": round(float(values["revenue"]), 2),
                    "completed_revenue": round(float(values["completed_revenue"]), 2),
                    "bookings": int(values["bookings"]),
                    "completed": int(values["completed"]),
                }
            )
        service_rows.sort(key=lambda row: row["revenue"], reverse=True)

        return {
            "estimated_revenue": round(total_revenue, 2),
            "completed_revenue": round(completed_revenue, 2),
            "avg_booking_value": round(total_revenue / priced_bookings, 2) if priced_bookings else 0,
            "currency": business.currency,
            "by_service": service_rows,
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        }

    def growth(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date))
        prices = self._price_map(tenant, business)
        customer_ids = {str(booking.customer_id) for booking in bookings if booking.customer_id}
        if not customer_ids:
            return {
                "new_customers": 0,
                "returning_customers": 0,
                "customers_with_bookings": 0,
                "repeat_rate": 0,
                "avg_visits_per_customer": 0,
                "top_customers": [],
                "period": {
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                },
            }

        prior_customer_ids: set[str] = set()
        if start_date:
            prior_qs = (
                Booking.objects.require_tenant(tenant)
                .filter(business=business, appointment_date__lt=start_date, customer_id__in=customer_ids)
                .values_list("customer_id", flat=True)
                .distinct()
            )
            prior_customer_ids = {str(customer_id) for customer_id in prior_qs}

        returning = len(customer_ids & prior_customer_ids)
        new_customers = len(customer_ids) - returning

        visits: dict[str, int] = defaultdict(int)
        revenue_by_customer: dict[str, float] = defaultdict(float)
        for booking in bookings:
            if not booking.customer_id:
                continue
            cid = str(booking.customer_id)
            visits[cid] += 1
            if booking.service_id:
                revenue_by_customer[cid] += prices.get(str(booking.service_id), 0.0)

        customers = {
            str(customer.id): customer
            for customer in Customer.objects.require_tenant(tenant).filter(
                business=business, id__in=customer_ids
            )
        }
        top_customers = sorted(
            (
                {
                    "customer_id": cid,
                    "customer_name": (
                        customers[cid].display_name
                        if cid in customers
                        else cid
                    ),
                    "bookings": visits[cid],
                    "revenue": round(revenue_by_customer[cid], 2),
                    "is_returning": cid in prior_customer_ids,
                }
                for cid in visits
            ),
            key=lambda row: (row["bookings"], row["revenue"]),
            reverse=True,
        )[:8]

        return {
            "new_customers": new_customers,
            "returning_customers": returning,
            "customers_with_bookings": len(customer_ids),
            "repeat_rate": round(returning / len(customer_ids), 4) if customer_ids else 0,
            "avg_visits_per_customer": round(len(bookings) / len(customer_ids), 2) if customer_ids else 0,
            "top_customers": top_customers,
            "period": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        }

    def operations(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date))
        prices = self._price_map(tenant, business)
        tz = self._business_tz(business)

        by_staff_raw: dict[str, dict[str, float | int]] = {}
        by_weekday: dict[int, int] = defaultdict(int)
        by_hour: dict[int, int] = defaultdict(int)

        for booking in bookings:
            local_start = self._localize(booking.start_at, tz)
            by_weekday[local_start.weekday()] += 1
            by_hour[local_start.hour] += 1

            if not booking.staff_id:
                continue
            staff_id = str(booking.staff_id)
            bucket = by_staff_raw.setdefault(
                staff_id,
                {"bookings": 0, "completed": 0, "cancelled": 0, "no_shows": 0, "revenue": 0.0},
            )
            bucket["bookings"] = int(bucket["bookings"]) + 1
            if booking.status == BookingStatus.COMPLETED:
                bucket["completed"] = int(bucket["completed"]) + 1
            if booking.status == BookingStatus.CANCELLED:
                bucket["cancelled"] = int(bucket["cancelled"]) + 1
            if booking.status == BookingStatus.NO_SHOW:
                bucket["no_shows"] = int(bucket["no_shows"]) + 1
            if booking.service_id:
                bucket["revenue"] = float(bucket["revenue"]) + prices.get(str(booking.service_id), 0.0)

        staff_map = {
            str(member.id): member
            for member in Staff.objects.require_tenant(tenant).filter(business=business, id__in=by_staff_raw.keys())
        }
        by_staff = sorted(
            (
                {
                    "staff_id": staff_id,
                    "staff_name": staff_map[staff_id].display_name if staff_id in staff_map else staff_id,
                    "bookings": int(values["bookings"]),
                    "completed": int(values["completed"]),
                    "cancelled": int(values["cancelled"]),
                    "no_shows": int(values["no_shows"]),
                    "revenue": round(float(values["revenue"]), 2),
                }
                for staff_id, values in by_staff_raw.items()
            ),
            key=lambda row: row["bookings"],
            reverse=True,
        )

        weekday_rows = [
            {"weekday": index, "weekday_name": WEEKDAY_NAMES[index], "total": by_weekday.get(index, 0)}
            for index in range(7)
        ]
        hour_rows = [
            {"hour": hour, "label": f"{hour:02d}:00", "total": by_hour.get(hour, 0)}
            for hour in range(24)
            if by_hour.get(hour, 0) > 0
        ]
        hour_rows.sort(key=lambda row: row["hour"])

        busiest_day = max(weekday_rows, key=lambda row: row["total"]) if bookings else None
        busiest_hour = max(hour_rows, key=lambda row: row["total"]) if hour_rows else None

        return {
            "by_staff": by_staff,
            "by_weekday": weekday_rows,
            "by_hour": hour_rows,
            "busiest_day": busiest_day["weekday_name"] if busiest_day and busiest_day["total"] else None,
            "busiest_hour": busiest_hour["label"] if busiest_hour else None,
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
        based_on_days = max((end_date - start_date).days + 1, 1)
        total_bookings = sum(int(row["total"]) for row in rows)
        avg_daily = total_bookings / based_on_days
        projected_bookings = int(round(avg_daily * horizon_days))
        revenue = self.revenue(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        avg_daily_revenue = revenue["estimated_revenue"] / based_on_days
        return {
            "horizon_days": horizon_days,
            "projected_bookings": projected_bookings,
            "projected_revenue": round(avg_daily_revenue * horizon_days, 2),
            "avg_daily_bookings": round(avg_daily, 2),
            "avg_daily_revenue": round(avg_daily_revenue, 2),
            "currency": business.currency,
            "based_on_days": based_on_days,
            "based_on_bookings": total_bookings,
        }

    def reports(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        if start_date is None or end_date is None:
            end_date = timezone.now().date()
            start_date = end_date - timedelta(days=29)

        summary = self.summary(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        revenue = self.revenue(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        trends = self.trends(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        growth = self.growth(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        operations = self.operations(tenant=tenant, business=business, start_date=start_date, end_date=end_date)
        insights = self._build_insights(summary=summary, revenue=revenue, growth=growth, operations=operations)
        return {
            "summary": summary,
            "revenue": revenue,
            "trends": trends,
            "growth": growth,
            "operations": operations,
            "insights": insights,
        }

    def _booking_queryset(
        self,
        tenant: Any,
        business: Any,
        start_date: date | None,
        end_date: date | None,
    ):
        queryset = Booking.objects.require_tenant(tenant).filter(business=business)
        if start_date:
            queryset = queryset.filter(appointment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(appointment_date__lte=end_date)
        return queryset.only(
            "id",
            "service_id",
            "customer_id",
            "staff_id",
            "appointment_date",
            "start_at",
            "status",
        )

    def _price_map(self, tenant: Any, business: Business) -> dict[str, float]:
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
        return price_by_service

    def _status_counts(self, bookings: list[Booking]) -> dict[str, int]:
        completed = sum(1 for booking in bookings if booking.status == BookingStatus.COMPLETED)
        cancelled = sum(1 for booking in bookings if booking.status == BookingStatus.CANCELLED)
        pending = sum(1 for booking in bookings if booking.status == BookingStatus.PENDING)
        confirmed = sum(1 for booking in bookings if booking.status == BookingStatus.CONFIRMED)
        no_shows = sum(1 for booking in bookings if booking.status == BookingStatus.NO_SHOW)
        return {
            "bookings": len(bookings),
            "completed": completed,
            "cancelled": cancelled,
            "pending": pending,
            "confirmed": confirmed,
            "no_shows": no_shows,
        }

    def _estimate_revenue(self, bookings: list[Booking], prices: dict[str, float]) -> float:
        total = 0.0
        for booking in bookings:
            if booking.service_id:
                total += prices.get(str(booking.service_id), 0.0)
        return total

    def _period_days(self, start_date: date | None, end_date: date | None) -> int | None:
        if start_date and end_date:
            return max((end_date - start_date).days + 1, 1)
        return None

    def _previous_period(self, start_date: date, end_date: date) -> tuple[date, date]:
        length = (end_date - start_date).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=length - 1)
        return prev_start, prev_end

    def _change_pct(self, current: float, previous: float) -> float | None:
        if previous == 0:
            return 100.0 if current > 0 else 0.0 if current == 0 else None
        return round(((current - previous) / previous) * 100, 1)

    def _business_tz(self, business: Business) -> ZoneInfo:
        try:
            return ZoneInfo(business.timezone or "UTC")
        except Exception:
            return ZoneInfo("UTC")

    def _localize(self, value: datetime, tz: ZoneInfo) -> datetime:
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone=ZoneInfo("UTC"))
        return value.astimezone(tz)

    def _build_insights(
        self,
        *,
        summary: dict[str, Any],
        revenue: dict[str, Any],
        growth: dict[str, Any],
        operations: dict[str, Any],
    ) -> list[dict[str, str]]:
        insights: list[dict[str, str]] = []
        comparison = summary.get("comparison") or {}
        currency = revenue.get("currency") or ""

        bookings_change = comparison.get("bookings_change_pct")
        if bookings_change is not None:
            direction = "up" if bookings_change >= 0 else "down"
            insights.append(
                {
                    "type": "trend",
                    "title": f"Bookings {direction} {abs(bookings_change)}%",
                    "detail": "Compared with the previous period of the same length.",
                }
            )

        revenue_change = comparison.get("revenue_change_pct")
        if revenue_change is not None:
            direction = "up" if revenue_change >= 0 else "down"
            insights.append(
                {
                    "type": "revenue",
                    "title": f"Estimated revenue {direction} {abs(revenue_change)}%",
                    "detail": f"Current estimate: {currency} {revenue.get('estimated_revenue', 0)}.",
                }
            )

        if operations.get("busiest_day"):
            insights.append(
                {
                    "type": "demand",
                    "title": f"Busiest day: {operations['busiest_day']}",
                    "detail": (
                        f"Peak hour around {operations['busiest_hour']}."
                        if operations.get("busiest_hour")
                        else "Use this to plan staffing."
                    ),
                }
            )

        if growth.get("customers_with_bookings"):
            insights.append(
                {
                    "type": "growth",
                    "title": f"{growth['new_customers']} new · {growth['returning_customers']} returning",
                    "detail": f"Repeat rate {round((growth.get('repeat_rate') or 0) * 100)}% this period.",
                }
            )

        top_service = (revenue.get("by_service") or [None])[0]
        if top_service:
            insights.append(
                {
                    "type": "service",
                    "title": f"Top service: {top_service['service_name']}",
                    "detail": f"{currency} {top_service['revenue']} from {top_service.get('bookings', 0)} bookings.",
                }
            )

        cancellation_rate = summary.get("cancellation_rate") or 0
        no_show_rate = summary.get("no_show_rate") or 0
        if cancellation_rate >= 0.1 or no_show_rate >= 0.05:
            insights.append(
                {
                    "type": "risk",
                    "title": "Watch cancellations and no-shows",
                    "detail": (
                        f"Cancellation {round(cancellation_rate * 100)}% · "
                        f"No-show {round(no_show_rate * 100)}%."
                    ),
                }
            )

        return insights[:6]
