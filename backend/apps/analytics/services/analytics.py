from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from django.db.models import Count, Exists, Min, OuterRef, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.bookings.models import Booking, BookingLineItem, BookingStatus
from apps.businesses.constants import PRODUCT_SHOPIE
from apps.businesses.models import (
    Business,
    BusinessProductSubscriptionStatus,
)
from apps.common.utils.workspace_access import (
    is_workspace_manager_or_above,
    linked_staff_ids_for_user,
    scope_bookings_queryset_for_user,
)
from apps.customers.models import Customer
from apps.notifications.models import Notification
from apps.services.models import Service, ServicePricing
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ReturnStatus,
    ShopOrder,
    ShopOrderLine,
    ShopPet,
    ShopReturn,
)
from apps.staff.models import EmploymentStatus, Staff

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

ACTIVE_SUBSCRIPTION_STATUSES = {
    BusinessProductSubscriptionStatus.TRIALING,
    BusinessProductSubscriptionStatus.ACTIVE,
    BusinessProductSubscriptionStatus.SOFT_LOCKED,
}


class AnalyticsService:
    def summary(
        self,
        *,
        tenant: Any,
        business: Any,
        start_date: date | None = None,
        end_date: date | None = None,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id))
        stats = self._status_counts(bookings)
        period_days = self._period_days(start_date, end_date) or 1
        comparison = None
        if start_date and end_date:
            prev_start, prev_end = self._previous_period(start_date, end_date)
            prev_bookings = list(
                self._booking_queryset(tenant, business, prev_start, prev_end, staff_id=staff_id)
            )
            prev_stats = self._status_counts(prev_bookings)
            prices = self._price_map(tenant, business)
            curr_revenue = self._estimate_revenue(bookings, prices, staff_id=staff_id)
            prev_revenue = self._estimate_revenue(prev_bookings, prices, staff_id=staff_id)
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
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        rows_map: dict[str, dict[str, int | str]] = {}
        bookings = self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id)
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
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id))
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
            lines = self._iter_booking_revenue_lines(booking, prices, staff_id=staff_id)
            if not lines:
                continue
            priced_bookings += 1
            for service_id, amount, _staff_id in lines:
                bucket = by_service.setdefault(
                    service_id,
                    {"revenue": 0.0, "completed_revenue": 0.0, "bookings": 0, "completed": 0},
                )
                bucket["bookings"] = int(bucket["bookings"]) + 1
                bucket["revenue"] = float(bucket["revenue"]) + amount
                total_revenue += amount
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
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id))
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
            prior_qs = Booking.objects.require_tenant(tenant).filter(
                business=business, appointment_date__lt=start_date, customer_id__in=customer_ids
            )
            prior_qs = self._apply_staff_filter(prior_qs, staff_id)
            prior_qs = prior_qs.values_list("customer_id", flat=True).distinct()
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
            for _service_id, amount, _staff_id in self._iter_booking_revenue_lines(
                booking, prices, staff_id=staff_id
            ):
                revenue_by_customer[cid] += amount

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
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        bookings = list(self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id))
        prices = self._price_map(tenant, business)
        tz = self._business_tz(business)
        filter_staff = self._coerce_staff_id(staff_id)

        by_staff_raw: dict[str, dict[str, float | int]] = {}
        by_weekday: dict[int, int] = defaultdict(int)
        by_hour: dict[int, int] = defaultdict(int)

        for booking in bookings:
            local_start = self._localize(booking.start_at, tz)
            by_weekday[local_start.weekday()] += 1
            by_hour[local_start.hour] += 1

            line_rows = list(booking.line_items.all()) if hasattr(booking, "line_items") else []
            if line_rows:
                for line_item in line_rows:
                    if not line_item.staff_id:
                        continue
                    if filter_staff and str(line_item.staff_id) != str(filter_staff):
                        continue
                    member_id = str(line_item.staff_id)
                    amount = self._line_item_amount(line_item, prices)
                    bucket = by_staff_raw.setdefault(
                        member_id,
                        {"bookings": 0, "completed": 0, "cancelled": 0, "no_shows": 0, "revenue": 0.0},
                    )
                    bucket["bookings"] = int(bucket["bookings"]) + 1
                    if booking.status == BookingStatus.COMPLETED:
                        bucket["completed"] = int(bucket["completed"]) + 1
                        bucket["revenue"] = float(bucket["revenue"]) + amount
                    if booking.status == BookingStatus.CANCELLED:
                        bucket["cancelled"] = int(bucket["cancelled"]) + 1
                    if booking.status == BookingStatus.NO_SHOW:
                        bucket["no_shows"] = int(bucket["no_shows"]) + 1
                continue

            if not booking.staff_id:
                continue
            if filter_staff and str(booking.staff_id) != str(filter_staff):
                continue
            member_id = str(booking.staff_id)
            bucket = by_staff_raw.setdefault(
                member_id,
                {"bookings": 0, "completed": 0, "cancelled": 0, "no_shows": 0, "revenue": 0.0},
            )
            bucket["bookings"] = int(bucket["bookings"]) + 1
            if booking.status == BookingStatus.COMPLETED:
                bucket["completed"] = int(bucket["completed"]) + 1
            if booking.status == BookingStatus.CANCELLED:
                bucket["cancelled"] = int(bucket["cancelled"]) + 1
            if booking.status == BookingStatus.NO_SHOW:
                bucket["no_shows"] = int(bucket["no_shows"]) + 1
            for _service_id, amount, _line_staff_id in self._iter_booking_revenue_lines(
                booking, prices, staff_id=staff_id
            ):
                if booking.status == BookingStatus.COMPLETED:
                    bucket["revenue"] = float(bucket["revenue"]) + amount

        staff_map = {
            str(member.id): member
            for member in Staff.objects.require_tenant(tenant).filter(business=business, id__in=by_staff_raw.keys())
        }
        by_staff = sorted(
            (
                {
                    "staff_id": member_id,
                    "staff_name": staff_map[member_id].display_name if member_id in staff_map else member_id,
                    "bookings": int(values["bookings"]),
                    "completed": int(values["completed"]),
                    "cancelled": int(values["cancelled"]),
                    "no_shows": int(values["no_shows"]),
                    "revenue": round(float(values["revenue"]), 2),
                }
                for member_id, values in by_staff_raw.items()
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
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        horizon_days = max(7, min(horizon_days, 90))
        end_date = self.business_local_date(business)
        start_date = end_date - timedelta(days=29)
        trends = self.trends(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        rows = trends["rows"]
        based_on_days = max((end_date - start_date).days + 1, 1)
        total_bookings = sum(int(row["total"]) for row in rows)
        avg_daily = total_bookings / based_on_days

        recent_start = end_date - timedelta(days=13)
        prior_end = recent_start - timedelta(days=1)
        prior_start = prior_end - timedelta(days=13)
        recent_total = self._trend_total(rows, recent_start, end_date)
        prior_total = self._trend_total(rows, prior_start, prior_end)
        recent_avg = recent_total / 14
        prior_avg = prior_total / 14
        momentum_pct = self._change_pct(recent_avg, prior_avg)
        # Weight the last two weeks more than the full month so a real slowdown
        # or pickup shows up, without letting a short spike rewrite the outlook.
        blended_daily = (0.65 * recent_avg) + (0.35 * avg_daily)
        projected_bookings = int(round(blended_daily * horizon_days))

        revenue = self.revenue(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        avg_daily_revenue = revenue["estimated_revenue"] / based_on_days
        pace = (blended_daily / avg_daily) if avg_daily else 1.0
        return {
            "horizon_days": horizon_days,
            "projected_bookings": projected_bookings,
            "projected_revenue": round(avg_daily_revenue * pace * horizon_days, 2),
            "avg_daily_bookings": round(avg_daily, 2),
            "avg_daily_revenue": round(avg_daily_revenue, 2),
            "currency": business.currency,
            "based_on_days": based_on_days,
            "based_on_bookings": total_bookings,
            "momentum_pct": momentum_pct,
            "note": self._forecast_note(
                momentum_pct=momentum_pct,
                based_on_bookings=total_bookings,
                prior_bookings=prior_total,
                projected_bookings=projected_bookings,
                horizon_days=horizon_days,
            ),
        }

    def reports(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date | None = None,
        end_date: date | None = None,
        include_forecast: bool = False,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        if start_date is None or end_date is None:
            end_date = self.business_local_date(business)
            start_date = end_date - timedelta(days=29)

        summary = self.summary(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        revenue = self.revenue(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        trends = self.trends(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        growth = self.growth(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        operations = self.operations(
            tenant=tenant, business=business, start_date=start_date, end_date=end_date, staff_id=staff_id
        )
        forecast = (
            self.forecast(tenant=tenant, business=business, staff_id=staff_id) if include_forecast else None
        )
        insights = self._build_insights(
            summary=summary,
            revenue=revenue,
            growth=growth,
            operations=operations,
            forecast=forecast,
        )
        result = {
            "summary": summary,
            "revenue": revenue,
            "trends": trends,
            "growth": growth,
            "operations": operations,
            "insights": insights,
        }
        if forecast is not None:
            result["forecast"] = forecast
        return result

    def appointie_profit(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        """Booking earnings for Orbit Appoint — not shop stock margins."""
        summary = self.summary(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        revenue = self.revenue(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        operations = self.operations(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        growth = self.growth(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        trends = self.trends(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        bookings = list(
            self._booking_queryset(tenant, business, start_date, end_date, staff_id=staff_id)
        )
        prices = self._price_map(tenant, business)
        series_map: dict[str, dict[str, float | int | str]] = {}
        weekday_revenue = [0.0] * 7
        lost_cancelled = 0.0
        lost_no_shows = 0.0
        for booking in bookings:
            day = booking.appointment_date.isoformat()
            bucket = series_map.setdefault(
                day,
                {"date": day, "estimated_revenue": 0.0, "completed_revenue": 0.0, "bookings": 0},
            )
            amount = sum(
                line_amount
                for _service_id, line_amount, _staff_id in self._iter_booking_revenue_lines(
                    booking, prices, staff_id=staff_id
                )
            )
            bucket["estimated_revenue"] = float(bucket["estimated_revenue"]) + amount
            bucket["bookings"] = int(bucket["bookings"]) + 1
            weekday_revenue[booking.appointment_date.weekday()] += amount
            if booking.status == BookingStatus.COMPLETED:
                bucket["completed_revenue"] = float(bucket["completed_revenue"]) + amount
            elif booking.status == BookingStatus.CANCELLED:
                lost_cancelled += amount
            elif booking.status == BookingStatus.NO_SHOW:
                lost_no_shows += amount
        series = []
        cursor = start_date
        while cursor <= end_date:
            key = cursor.isoformat()
            bucket = series_map.get(key) or {
                "date": key,
                "estimated_revenue": 0.0,
                "completed_revenue": 0.0,
                "bookings": 0,
            }
            series.append(
                {
                    "date": key,
                    "estimated_revenue": round(float(bucket["estimated_revenue"]), 2),
                    "completed_revenue": round(float(bucket["completed_revenue"]), 2),
                    "bookings": int(bucket["bookings"]),
                }
            )
            cursor += timedelta(days=1)
        weekday_rows = []
        for row in operations.get("by_weekday") or []:
            index = int(row.get("weekday") or 0)
            weekday_rows.append(
                {
                    **row,
                    "revenue": round(weekday_revenue[index] if 0 <= index < 7 else 0.0, 2),
                }
            )
        estimated = float(revenue.get("estimated_revenue") or 0)
        completed = float(revenue.get("completed_revenue") or 0)
        lost_total = lost_cancelled + lost_no_shows
        return {
            "product": "appointie",
            "currency": business.currency,
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            "estimated_revenue": estimated,
            "completed_revenue": completed,
            "open_revenue": round(max(estimated - completed - lost_total, 0), 2),
            "lost_cancelled": round(lost_cancelled, 2),
            "lost_no_shows": round(lost_no_shows, 2),
            "lost_total": round(lost_total, 2),
            "avg_booking_value": revenue.get("avg_booking_value", 0),
            "bookings": summary.get("bookings", 0),
            "completed": summary.get("completed", 0),
            "cancelled": summary.get("cancelled", 0),
            "no_shows": summary.get("no_shows", 0),
            "completion_rate": summary.get("completion_rate", 0),
            "cancellation_rate": summary.get("cancellation_rate", 0),
            "no_show_rate": summary.get("no_show_rate", 0),
            "avg_bookings_per_day": summary.get("avg_bookings_per_day", 0),
            "busiest_day": operations.get("busiest_day"),
            "busiest_hour": operations.get("busiest_hour"),
            "comparison": summary.get("comparison"),
            "by_service": revenue.get("by_service") or [],
            "by_staff": operations.get("by_staff") or [],
            "by_weekday": weekday_rows,
            "trends": trends.get("rows") or [],
            "series": series,
            "insights": self._build_insights(
                summary=summary,
                revenue=revenue,
                growth=growth,
                operations=operations,
            ),
        }

    def dashboard_summary(
        self,
        *,
        tenant: Any,
        business: Business | None,
        today_count: int | None = None,
        user: Any | None = None,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        """Product-aware ops home snapshot. Omits sections for unsubscribed products."""
        today = self.business_local_date(business)
        products, pets_pack_enabled = self._subscribed_products(business)
        result: dict[str, Any] = {
            "products": products,
            "pets_pack_enabled": pets_pack_enabled,
            "currency": getattr(business, "currency", None) if business else None,
            "today_count": int(today_count or 0),
            "viewer": self._viewer_context(tenant=tenant, business=business, user=user),
        }
        if business is None:
            return result

        if "appointie" in products:
            appointie = self._appointie_dashboard(
                tenant=tenant, business=business, today=today, user=user, staff_id=staff_id
            )
            result["appointie"] = appointie
            if today_count is None:
                result["today_count"] = appointie["today_bookings"]
            else:
                result["today_count"] = int(today_count)

        if "shopie" in products:
            result["shopie"] = self._shopie_dashboard(
                tenant=tenant, business=business, today=today, staff_id=staff_id
            )

        if pets_pack_enabled and self._coerce_staff_id(staff_id) is None:
            result["pets"] = self._pets_snapshot(tenant=tenant, business=business, today=today)

        return result

    def product_aware_overview(
        self,
        *,
        tenant: Any,
        business: Business | None,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
        product_codes: list[str] | None = None,
    ) -> dict[str, Any]:
        """BI overview with stacked product sections based on subscriptions."""
        products, pets_pack_enabled = self._subscribed_products(business)
        if product_codes is not None:
            allowed = {str(item).strip().lower() for item in product_codes}
            products = [item for item in products if item in allowed]
            if PRODUCT_SHOPIE not in allowed:
                pets_pack_enabled = False
        result: dict[str, Any] = {
            "products": products,
            "pets_pack_enabled": pets_pack_enabled,
            "currency": getattr(business, "currency", None) if business else None,
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        }
        if business is None:
            return result

        if "appointie" in products:
            appointie = self.reports(
                tenant=tenant,
                business=business,
                start_date=start_date,
                end_date=end_date,
                include_forecast=True,
                staff_id=staff_id,
            )
            result["appointie"] = appointie
            # Backward-compatible top-level aliases for existing AppointIE clients.
            result.update(appointie)
            if appointie.get("forecast") is not None:
                result["forecast"] = appointie["forecast"]

        if "shopie" in products:
            result["shopie"] = self._shopie_overview(
                tenant=tenant,
                business=business,
                start_date=start_date,
                end_date=end_date,
                staff_id=staff_id,
            )

        if pets_pack_enabled and self._coerce_staff_id(staff_id) is None:
            result["pets"] = self._pets_snapshot(
                tenant=tenant,
                business=business,
                today=self.business_local_date(business),
            )

        return result

    def _viewer_context(
        self,
        *,
        tenant: Any,
        business: Business | None,
        user: Any | None,
    ) -> dict[str, Any]:
        if user is None:
            return {"is_bookable": False, "booking_staff": False}
        manager = is_workspace_manager_or_above(user=user, tenant=tenant)
        staff_ids = linked_staff_ids_for_user(tenant=tenant, user=user, business=business)
        is_bookable = False
        if staff_ids:
            is_bookable = (
                Staff.objects.require_tenant(tenant)
                .filter(id__in=staff_ids, is_bookable=True, employment_status=EmploymentStatus.ACTIVE)
                .exists()
            )
        return {
            "is_bookable": is_bookable,
            "booking_staff": bool(is_bookable and not manager),
        }

    def _subscribed_products(self, business: Business | None) -> tuple[list[str], bool]:
        if business is None:
            return [], False
        subscriptions = list(
            business.product_subscriptions.filter(status__in=ACTIVE_SUBSCRIPTION_STATUSES)
        )
        products = sorted({str(sub.product_code).strip().lower() for sub in subscriptions if sub.product_code})
        pets_pack_enabled = any(
            str(sub.product_code).strip().lower() == "shopie" and bool(getattr(sub, "pets_pack_enabled", False))
            for sub in subscriptions
        )
        # Fallback for tenants that predate multi-product subscriptions.
        if not products:
            products = ["appointie"]
        return products, pets_pack_enabled

    def _appointie_dashboard(
        self,
        *,
        tenant: Any,
        business: Business,
        today: date,
        user: Any | None = None,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        month_start = today.replace(day=1)
        upcoming_end = today + timedelta(days=6)
        prices = self._price_map(tenant, business)

        today_bookings = list(
            self._booking_queryset(tenant, business, today, today, user=user, staff_id=staff_id)
        )
        upcoming = list(
            self._booking_queryset(tenant, business, today, upcoming_end, user=user, staff_id=staff_id)
        )
        month_bookings = list(
            self._booking_queryset(tenant, business, month_start, today, user=user, staff_id=staff_id)
        )

        today_completed = sum(1 for b in today_bookings if b.status == BookingStatus.COMPLETED)
        today_cancelled = sum(1 for b in today_bookings if b.status == BookingStatus.CANCELLED)

        if self._coerce_staff_id(staff_id) is not None:
            customer_ids = {booking.customer_id for booking in month_bookings if booking.customer_id}
            active_customers = len(customer_ids)
            today_customer_ids = {booking.customer_id for booking in today_bookings if booking.customer_id}
            new_customers = len(today_customer_ids)
            staff_on_duty = 1 if today_bookings or upcoming or month_bookings else 0
        else:
            active_customers = (
                Customer.objects.require_tenant(tenant).filter(business=business).count()
            )
            day_start, day_end = self._local_bounds(today, today, business)
            new_customers = (
                Customer.objects.require_tenant(tenant)
                .filter(business=business, created_at__gte=day_start, created_at__lt=day_end)
                .count()
            )
            staff_on_duty = (
                Staff.objects.require_tenant(tenant)
                .filter(business=business, employment_status=EmploymentStatus.ACTIVE)
                .count()
            )
        unread_qs = Notification.objects.require_tenant(tenant).filter(
            business=business, is_read=False
        )
        if user is not None and not getattr(user, "is_superuser", False):
            unread_qs = unread_qs.filter(user_id=user.id)
        unread_notifications = unread_qs.count()

        return {
            "today_bookings": len(today_bookings),
            "upcoming_7d": len(upcoming),
            "today_completed": today_completed,
            "today_cancelled": today_cancelled,
            "estimated_revenue_today": round(
                self._estimate_revenue(today_bookings, prices, staff_id=staff_id), 2
            ),
            "estimated_revenue_month": round(
                self._estimate_revenue(month_bookings, prices, staff_id=staff_id), 2
            ),
            "active_customers": active_customers,
            "new_customers_today": new_customers,
            "staff_on_duty": staff_on_duty,
            "unread_notifications": unread_notifications,
        }

    def _shopie_dashboard(
        self,
        *,
        tenant: Any,
        business: Business,
        today: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        month_start = today.replace(day=1)

        orders_qs = self._filter_orders_by_staff(
            ShopOrder.objects.require_tenant(tenant).filter(business=business),
            tenant=tenant,
            business=business,
            staff_id=staff_id,
        )
        today_start, today_end = self._local_bounds(today, today, business)
        month_start_at, month_end = self._local_bounds(month_start, today, business)
        orders_today_qs = orders_qs.filter(created_at__gte=today_start, created_at__lt=today_end).exclude(
            status=OrderStatus.CANCELLED
        )
        month_qs = orders_qs.filter(created_at__gte=month_start_at, created_at__lt=month_end).exclude(
            status=OrderStatus.CANCELLED
        )

        month_agg = month_qs.aggregate(
            orders_count=Count("id"),
            gmv=Coalesce(Sum("total"), Decimal("0.00")),
        )
        delivery_fee_month = self._sum_delivery_fees(month_qs.only("metadata"))
        returns_qs = self._filter_orders_by_staff(
            ShopReturn.objects.require_tenant(tenant).filter(business=business),
            tenant=tenant,
            business=business,
            staff_id=staff_id,
            via_order=True,
        )
        pending_returns = returns_qs.filter(status=ReturnStatus.PENDING).count()
        open_orders = orders_qs.filter(
            status__in=[
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.READY,
                OrderStatus.DELIVERY_FAILED,
            ]
        ).count()

        return {
            "orders_today": orders_today_qs.count(),
            "orders_month": int(month_agg["orders_count"] or 0),
            "gmv_today": float(
                orders_today_qs.aggregate(total=Coalesce(Sum("total"), Decimal("0.00")))["total"] or 0
            ),
            "gmv_month": float(month_agg["gmv"] or 0),
            "pending_returns": pending_returns,
            "open_orders": open_orders,
            "delivery_fee_month": round(delivery_fee_month, 2),
        }

    def _shopie_overview(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        window_start, window_end = self._local_bounds(start_date, end_date, business)
        orders = list(
            self._filter_orders_by_staff(
                ShopOrder.objects.require_tenant(tenant).filter(
                    business=business, created_at__gte=window_start, created_at__lt=window_end
                ),
                tenant=tenant,
                business=business,
                staff_id=staff_id,
            ).only("id", "status", "total", "created_at", "metadata", "currency")
        )
        active_orders = [o for o in orders if o.status != OrderStatus.CANCELLED]
        cancelled = sum(1 for o in orders if o.status == OrderStatus.CANCELLED)
        gmv = float(sum((o.total or Decimal("0")) for o in active_orders))
        delivery_fee_total = self._sum_delivery_fees(active_orders)

        returns = list(
            self._filter_orders_by_staff(
                ShopReturn.objects.require_tenant(tenant).filter(
                    business=business, created_at__gte=window_start, created_at__lt=window_end
                ),
                tenant=tenant,
                business=business,
                staff_id=staff_id,
                via_order=True,
            ).only("id", "status", "refund_total")
        )
        refund_total = float(sum((r.refund_total or Decimal("0")) for r in returns))
        pending_returns = sum(1 for r in returns if r.status == ReturnStatus.PENDING)
        return_rate = round(len(returns) / len(active_orders), 4) if active_orders else 0.0

        tz = self._business_tz(business)
        by_day: dict[str, dict[str, float | int | str]] = {}
        for order in active_orders:
            key = self._localize(order.created_at, tz).date().isoformat()
            row = by_day.setdefault(key, {"day": key, "orders": 0, "gmv": 0.0})
            row["orders"] = int(row["orders"]) + 1
            row["gmv"] = round(float(row["gmv"]) + float(order.total or 0), 2)

        prev_start, prev_end = self._previous_period(start_date, end_date)
        prev_window_start, prev_window_end = self._local_bounds(prev_start, prev_end, business)
        previous_orders = list(
            self._filter_orders_by_staff(
                ShopOrder.objects.require_tenant(tenant).filter(
                    business=business, created_at__gte=prev_window_start, created_at__lt=prev_window_end
                ),
                tenant=tenant,
                business=business,
                staff_id=staff_id,
            ).only("id", "status", "total")
        )
        previous_active = [o for o in previous_orders if o.status != OrderStatus.CANCELLED]
        previous_gmv = float(sum((o.total or Decimal("0")) for o in previous_active))
        insights = self._commerce_insights(
            currency=business.currency or "",
            orders=len(active_orders),
            cancelled=cancelled,
            gmv=gmv,
            previous_orders=len(previous_active),
            previous_gmv=previous_gmv,
            returns=len(returns),
            pending_returns=pending_returns,
            return_rate=return_rate,
            refund_total=refund_total,
            delivery_fee_total=delivery_fee_total,
            by_day=by_day,
        )

        return {
            "orders": len(active_orders),
            "cancelled_orders": cancelled,
            "gmv": round(gmv, 2),
            "avg_order_value": round(gmv / len(active_orders), 2) if active_orders else 0,
            "returns": len(returns),
            "pending_returns": pending_returns,
            "return_rate": return_rate,
            "refund_total": round(refund_total, 2),
            "delivery_fee_total": round(delivery_fee_total, 2),
            "currency": business.currency,
            "trend": [by_day[key] for key in sorted(by_day.keys())],
            "insights": insights,
            "comparison": {
                "orders_change_pct": self._change_pct(len(active_orders), len(previous_active)),
                "gmv_change_pct": self._change_pct(gmv, previous_gmv),
                "previous_period": {
                    "start_date": prev_start.isoformat(),
                    "end_date": prev_end.isoformat(),
                    "orders": len(previous_active),
                    "gmv": round(previous_gmv, 2),
                },
            },
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        }

    def shopie_revenue(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        overview = self._shopie_overview(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        window_start, window_end = self._local_bounds(start_date, end_date, business)
        orders = list(
            self._filter_orders_by_staff(
                ShopOrder.objects.require_tenant(tenant).filter(
                    business=business, created_at__gte=window_start, created_at__lt=window_end
                ),
                tenant=tenant,
                business=business,
                staff_id=staff_id,
            ).only("id", "status", "total", "fulfillment_mode")
        )
        active = [order for order in orders if order.status != OrderStatus.CANCELLED]
        by_channel: dict[str, dict[str, float | int | str]] = {}
        labels = dict(FulfillmentMode.choices)
        for order in active:
            key = str(order.fulfillment_mode or "pos")
            bucket = by_channel.setdefault(
                key,
                {
                    "channel": key,
                    "label": labels.get(key, key.title()),
                    "orders": 0,
                    "gmv": 0.0,
                },
            )
            bucket["orders"] = int(bucket["orders"]) + 1
            bucket["gmv"] = round(float(bucket["gmv"]) + float(order.total or 0), 2)
        by_category: dict[str, dict[str, float | int | str]] = {}
        if active:
            order_categories: dict[str, set[str]] = {}
            for line in (
                ShopOrderLine.objects.require_tenant(tenant)
                .filter(order_id__in=[order.id for order in active])
                .select_related("product")
                .only("order_id", "line_total", "product__category")
            ):
                slug = str(getattr(line.product, "category", "") or "uncategorized")
                bucket = by_category.setdefault(
                    slug,
                    {
                        "category": slug,
                        "label": slug.replace("_", " ").title(),
                        "orders": 0,
                        "gmv": 0.0,
                    },
                )
                bucket["gmv"] = round(float(bucket["gmv"]) + float(line.line_total or 0), 2)
                order_categories.setdefault(str(line.order_id), set()).add(slug)
            for slugs in order_categories.values():
                for slug in slugs:
                    by_category[slug]["orders"] = int(by_category[slug]["orders"]) + 1
        channel_rows = sorted(by_channel.values(), key=lambda row: float(row["gmv"]), reverse=True)
        category_rows = sorted(by_category.values(), key=lambda row: float(row["gmv"]), reverse=True)
        return {
            "gmv": overview["gmv"],
            "avg_order_value": overview["avg_order_value"],
            "orders": overview["orders"],
            "cancelled_orders": overview["cancelled_orders"],
            "currency": overview["currency"],
            "by_channel": channel_rows,
            "by_category": category_rows[:12],
            "trend": overview["trend"],
            "period": overview["period"],
        }

    def shopie_growth(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        window_start, window_end = self._local_bounds(start_date, end_date, business)
        orders = list(
            self._filter_orders_by_staff(
                ShopOrder.objects.require_tenant(tenant).filter(
                    business=business, created_at__gte=window_start, created_at__lt=window_end
                ),
                tenant=tenant,
                business=business,
                staff_id=staff_id,
            )
            .exclude(status=OrderStatus.CANCELLED)
            .only("id", "customer_id", "total")
        )
        by_customer: dict[str, dict[str, float | int]] = {}
        for order in orders:
            if not order.customer_id:
                continue
            key = str(order.customer_id)
            bucket = by_customer.setdefault(key, {"orders": 0, "revenue": 0.0})
            bucket["orders"] = int(bucket["orders"]) + 1
            bucket["revenue"] = float(bucket["revenue"]) + float(order.total or 0)
        customer_ids = list(by_customer.keys())
        first_map = {
            str(row["customer_id"]): row["first_at"]
            for row in ShopOrder.objects.require_tenant(tenant)
            .filter(business=business, customer_id__in=customer_ids)
            .exclude(status=OrderStatus.CANCELLED)
            .values("customer_id")
            .annotate(first_at=Min("created_at"))
        }
        customers = {
            str(row.id): row
            for row in Customer.objects.require_tenant(tenant).filter(id__in=customer_ids)
        }
        new_customers = 0
        returning = 0
        top_customers = []
        for customer_id, values in by_customer.items():
            first_at = first_map.get(customer_id)
            is_new = first_at is not None and first_at >= window_start
            if is_new:
                new_customers += 1
            else:
                returning += 1
            customer = customers.get(customer_id)
            top_customers.append(
                {
                    "customer_id": customer_id,
                    "customer_name": (customer.display_name if customer else customer_id),
                    "orders": int(values["orders"]),
                    "revenue": round(float(values["revenue"]), 2),
                    "is_returning": not is_new,
                }
            )
        top_customers.sort(key=lambda row: (row["orders"], row["revenue"]), reverse=True)
        return {
            "new_customers": new_customers,
            "returning_customers": returning,
            "customers_with_orders": len(customer_ids),
            "repeat_rate": round(returning / len(customer_ids), 4) if customer_ids else 0,
            "avg_orders_per_customer": round(len(orders) / len(customer_ids), 2) if customer_ids else 0,
            "top_customers": top_customers[:8],
            "period": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        }

    def shopie_forecast(
        self,
        *,
        tenant: Any,
        business: Business,
        horizon_days: int = 30,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        horizon_days = max(7, min(horizon_days, 90))
        end_date = self.business_local_date(business)
        start_date = end_date - timedelta(days=29)
        overview = self._shopie_overview(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        rows = overview.get("trend") or []
        based_on_days = max((end_date - start_date).days + 1, 1)
        total_orders = sum(int(row.get("orders") or 0) for row in rows)
        total_gmv = float(overview.get("gmv") or 0)
        avg_daily = total_orders / based_on_days
        recent_start = end_date - timedelta(days=13)
        recent_orders = sum(
            int(row.get("orders") or 0)
            for row in rows
            if str(row.get("day") or "") >= recent_start.isoformat()
        )
        prior_rows = [
            row
            for row in rows
            if str(row.get("day") or "") < recent_start.isoformat()
        ]
        prior_orders = sum(int(row.get("orders") or 0) for row in prior_rows)
        recent_avg = recent_orders / 14
        prior_avg = prior_orders / max(len(prior_rows), 1)
        momentum_pct = self._change_pct(recent_avg, prior_avg)
        blended_daily = (0.65 * recent_avg) + (0.35 * avg_daily)
        projected_orders = int(round(blended_daily * horizon_days))
        avg_daily_revenue = total_gmv / based_on_days
        pace = (blended_daily / avg_daily) if avg_daily else 1.0
        return {
            "horizon_days": horizon_days,
            "projected_orders": projected_orders,
            "projected_revenue": round(avg_daily_revenue * pace * horizon_days, 2),
            "avg_daily_orders": round(avg_daily, 2),
            "avg_daily_revenue": round(avg_daily_revenue, 2),
            "currency": business.currency,
            "based_on_days": based_on_days,
            "based_on_orders": total_orders,
            "momentum_pct": momentum_pct,
            "note": self._forecast_note(
                momentum_pct=momentum_pct,
                based_on_bookings=total_orders,
                prior_bookings=prior_orders,
                projected_bookings=projected_orders,
                horizon_days=horizon_days,
                unit="orders",
            ),
        }

    def shopie_reports(
        self,
        *,
        tenant: Any,
        business: Business,
        start_date: date,
        end_date: date,
        staff_id: Any | None = None,
    ) -> dict[str, Any]:
        overview = self._shopie_overview(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        growth = self.shopie_growth(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        revenue = self.shopie_revenue(
            tenant=tenant,
            business=business,
            start_date=start_date,
            end_date=end_date,
            staff_id=staff_id,
        )
        return {
            "orders": overview["orders"],
            "cancelled_orders": overview["cancelled_orders"],
            "gmv": overview["gmv"],
            "avg_order_value": overview["avg_order_value"],
            "returns": overview["returns"],
            "return_rate": overview["return_rate"],
            "currency": overview["currency"],
            "trend": overview["trend"],
            "insights": overview.get("insights") or [],
            "growth": growth,
            "revenue": revenue,
            "period": overview["period"],
        }

    def _pets_snapshot(
        self,
        *,
        tenant: Any,
        business: Business,
        today: date,
    ) -> dict[str, Any]:
        pets = list(
            ShopPet.objects.require_tenant(tenant)
            .filter(business=business)
            .only("id", "birthday", "photo_url")
        )
        birthdays_7 = 0
        birthdays_30 = 0
        with_photo = 0
        for pet in pets:
            if pet.photo_url:
                with_photo += 1
            if pet.birthday is None:
                continue
            days_until = self._days_until_birthday(pet.birthday, today)
            if days_until is None:
                continue
            if days_until <= 7:
                birthdays_7 += 1
            if days_until <= 30:
                birthdays_30 += 1
        snapshot = {
            "total": len(pets),
            "birthdays_next_7d": birthdays_7,
            "birthdays_next_30d": birthdays_30,
            "with_photo": with_photo,
        }
        snapshot["insights"] = self._pets_insights(snapshot)
        return snapshot

    def _sum_delivery_fees(self, orders) -> float:
        total = 0.0
        for order in orders:
            metadata = order.metadata if isinstance(getattr(order, "metadata", None), dict) else {}
            try:
                total += float(metadata.get("delivery_fee") or 0)
            except (TypeError, ValueError):
                continue
        return total

    def _days_until_birthday(self, birthday: date, today: date) -> int | None:
        try:
            next_bday = birthday.replace(year=today.year)
        except ValueError:
            # Feb 29 on non-leap years → Feb 28
            next_bday = date(today.year, 2, 28)
        if next_bday < today:
            try:
                next_bday = birthday.replace(year=today.year + 1)
            except ValueError:
                next_bday = date(today.year + 1, 2, 28)
        return (next_bday - today).days

    def _coerce_staff_id(self, staff_id: Any | None) -> UUID | None:
        if staff_id is None or staff_id == "":
            return None
        if isinstance(staff_id, UUID):
            return staff_id
        try:
            return UUID(str(staff_id))
        except (TypeError, ValueError):
            return None

    def _staff_actor_user_id(self, *, tenant: Any, business: Business, staff_id: Any | None):
        parsed = self._coerce_staff_id(staff_id)
        if parsed is None:
            return None
        staff = (
            Staff.objects.require_tenant(tenant)
            .filter(id=parsed, business=business)
            .only("user_id")
            .first()
        )
        if staff is None:
            return False
        return staff.user_id

    def _filter_orders_by_staff(
        self,
        queryset,
        *,
        tenant: Any,
        business: Business,
        staff_id: Any | None,
        via_order: bool = False,
    ):
        if self._coerce_staff_id(staff_id) is None:
            return queryset
        user_id = self._staff_actor_user_id(tenant=tenant, business=business, staff_id=staff_id)
        if user_id in (None, False):
            return queryset.none()
        if via_order:
            return queryset.filter(order__created_by=user_id)
        return queryset.filter(created_by=user_id)

    def _apply_staff_filter(self, queryset, staff_id: Any | None):
        parsed = self._coerce_staff_id(staff_id)
        if parsed is None:
            return queryset
        line_match = BookingLineItem.objects.filter(booking_id=OuterRef("pk"), staff_id=parsed)
        return queryset.filter(Q(staff_id=parsed) | Exists(line_match)).distinct()

    def _booking_queryset(
        self,
        tenant: Any,
        business: Any,
        start_date: date | None,
        end_date: date | None,
        user: Any | None = None,
        staff_id: Any | None = None,
    ):
        queryset = Booking.objects.require_tenant(tenant).filter(business=business)
        if start_date:
            queryset = queryset.filter(appointment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(appointment_date__lte=end_date)
        if user is not None:
            queryset = scope_bookings_queryset_for_user(queryset, tenant=tenant, user=user)
        queryset = self._apply_staff_filter(queryset, staff_id)
        return queryset.prefetch_related("line_items").only(
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

    def _estimate_revenue(
        self,
        bookings: list[Booking],
        prices: dict[str, float],
        staff_id: Any | None = None,
    ) -> float:
        total = 0.0
        for booking in bookings:
            for _service_id, amount, _staff_id in self._iter_booking_revenue_lines(
                booking, prices, staff_id=staff_id
            ):
                total += amount
        return total

    def _line_item_amount(self, line_item: BookingLineItem, prices: dict[str, float]) -> float:
        snapshot = float(line_item.price_snapshot or 0)
        if snapshot > 0:
            return snapshot
        return prices.get(str(line_item.service_id), 0.0)

    def _iter_booking_revenue_lines(
        self,
        booking: Booking,
        prices: dict[str, float],
        staff_id: Any | None = None,
    ) -> list[tuple[str, float, Any]]:
        line_items = list(booking.line_items.all()) if hasattr(booking, "line_items") else []
        if line_items:
            lines = [
                (
                    str(line_item.service_id),
                    self._line_item_amount(line_item, prices),
                    line_item.staff_id,
                )
                for line_item in line_items
            ]
        elif booking.service_id:
            lines = [
                (
                    str(booking.service_id),
                    prices.get(str(booking.service_id), 0.0),
                    booking.staff_id,
                )
            ]
        else:
            lines = []
        parsed = self._coerce_staff_id(staff_id)
        if parsed is None:
            return lines
        target = str(parsed)
        return [line for line in lines if line[2] is not None and str(line[2]) == target]

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
        # A zero baseline is not a 100% increase. Callers should describe it as new activity.
        if previous == 0:
            return 0.0 if current == 0 else None
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

    def business_local_date(self, business: Business | None) -> date:
        if business is None:
            return timezone.now().date()
        return timezone.now().astimezone(self._business_tz(business)).date()

    def _local_bounds(self, start_date: date, end_date: date, business: Business) -> tuple[datetime, datetime]:
        tz = self._business_tz(business)
        start = datetime.combine(start_date, time.min, tzinfo=tz)
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz)
        return start, end

    def _trend_total(self, rows: list[dict[str, Any]], start_date: date, end_date: date) -> int:
        start_key = start_date.isoformat()
        end_key = end_date.isoformat()
        return sum(int(row["total"]) for row in rows if start_key <= str(row["day"]) <= end_key)

    def _money(self, currency: str, amount: float) -> str:
        rounded = round(float(amount or 0), 2)
        text = f"{rounded:.0f}" if rounded == int(rounded) else f"{rounded:.2f}"
        code = (currency or "").strip()
        return f"{code} {text}".strip()

    def _pct_label(self, value: float) -> str:
        rounded = round(abs(float(value)), 1)
        if rounded == int(rounded):
            return str(int(rounded))
        return str(rounded)

    def _ranked_insights(self, insights: list[dict[str, Any]], limit: int = 8) -> list[dict[str, str]]:
        ordered = sorted(insights, key=lambda row: int(row.get("priority", 50)))
        cleaned: list[dict[str, str]] = []
        for row in ordered[:limit]:
            cleaned.append({"type": str(row["type"]), "title": str(row["title"]), "detail": str(row["detail"])})
        return cleaned

    def _forecast_note(
        self,
        *,
        momentum_pct: float | None,
        based_on_bookings: int,
        projected_bookings: int,
        horizon_days: int,
        prior_bookings: int | None = None,
        unit: str = "bookings",
    ) -> str:
        earlier = based_on_bookings if prior_bookings is None else prior_bookings
        if based_on_bookings < 8:
            return (
                f"Only {based_on_bookings} {unit} in the last 30 days, so {projected_bookings} "
                f"over the next {horizon_days} days is a rough floor, not a plan."
            )
        if momentum_pct is None or earlier < 8:
            return "The earlier weeks are too thin to call a trend, so this follows the recent run rate."
        if momentum_pct >= 8:
            return (
                f"The last two weeks are {self._pct_label(momentum_pct)}% ahead of the two before that, "
                "so the outlook sits above a flat average."
            )
        if momentum_pct <= -8:
            return (
                f"The last two weeks are {self._pct_label(momentum_pct)}% behind the two before that, "
                "so the outlook sits below a flat average. Open last-minute slots before you staff to the old pace."
            )
        return "The last two weeks match the month, so the outlook stays near the recent run rate."

    def _build_insights(
        self,
        *,
        summary: dict[str, Any],
        revenue: dict[str, Any],
        growth: dict[str, Any],
        operations: dict[str, Any],
        forecast: dict[str, Any] | None = None,
    ) -> list[dict[str, str]]:
        insights: list[dict[str, Any]] = []
        comparison = summary.get("comparison") or {}
        previous = comparison.get("previous_period") or {}
        currency = revenue.get("currency") or ""
        bookings = int(summary.get("bookings") or 0)
        prev_bookings = int(previous.get("bookings") or 0)
        estimated = float(revenue.get("estimated_revenue") or 0)
        prev_revenue = float(previous.get("estimated_revenue") or 0)
        bookings_change = comparison.get("bookings_change_pct")
        revenue_change = comparison.get("revenue_change_pct")
        curr_aov = estimated / bookings if bookings else 0.0
        prev_aov = prev_revenue / prev_bookings if prev_bookings else 0.0
        aov_change = self._change_pct(curr_aov, prev_aov)

        if bookings == 0 and prev_bookings == 0:
            insights.append(
                {
                    "type": "trend",
                    "priority": 6,
                    "title": "No bookings in this period",
                    "detail": "The previous period was quiet too. Share the booking link or open a short promotion.",
                }
            )
        elif bookings == 0 and prev_bookings >= 3:
            insights.append(
                {
                    "type": "trend",
                    "priority": 0,
                    "title": "Bookings dropped to zero",
                    "detail": (
                        f"The previous period had {prev_bookings} appointments. "
                        "Check that the booking page is open and send a reminder to recent guests."
                    ),
                }
            )
        elif bookings_change is None and bookings > 0 and prev_bookings == 0:
            insights.append(
                {
                    "type": "trend",
                    "priority": 4,
                    "title": "Bookings started this period",
                    "detail": (
                        f"{bookings} appointments after a quiet previous period. "
                        "Keep the slots that just filled, and ask those guests to rebook."
                    ),
                }
            )
        elif bookings_change is not None and abs(bookings_change) < 5 and bookings > 0:
            insights.append(
                {
                    "type": "trend",
                    "priority": 9,
                    "title": "Bookings are steady",
                    "detail": (
                        f"{bookings} appointments, within 5% of the previous period. "
                        "Use the spare capacity on the quiet weekdays."
                    ),
                }
            )
        elif isinstance(bookings_change, (int, float)) and bookings_change > 0:
            insights.append(
                {
                    "type": "trend",
                    "priority": 5,
                    "title": f"Bookings are up {self._pct_label(bookings_change)}%",
                    "detail": (
                        f"{bookings} appointments versus {prev_bookings} in the previous period. "
                        "Protect the peak day before you add more slots."
                    ),
                }
            )
        elif isinstance(bookings_change, (int, float)) and bookings_change < 0:
            insights.append(
                {
                    "type": "trend",
                    "priority": 2,
                    "title": f"Bookings are down {self._pct_label(bookings_change)}%",
                    "detail": (
                        f"{bookings} appointments versus {prev_bookings} in the previous period. "
                        "Send reminders to guests who have not booked again, and open last-minute slots."
                    ),
                }
            )

        if estimated == 0 and prev_revenue == 0:
            pass
        elif revenue_change is None and estimated > 0 and prev_revenue == 0:
            insights.append(
                {
                    "type": "revenue",
                    "priority": 4,
                    "title": "Estimated revenue started this period",
                    "detail": f"{self._money(currency, estimated)} from booked services, after a period with none.",
                }
            )
        elif revenue_change is not None and abs(revenue_change) < 5 and estimated > 0:
            insights.append(
                {
                    "type": "revenue",
                    "priority": 9,
                    "title": "Estimated revenue is steady",
                    "detail": f"About {self._money(currency, estimated)} from booked services, close to the previous period.",
                }
            )
        elif isinstance(revenue_change, (int, float)) and revenue_change > 0:
            insights.append(
                {
                    "type": "revenue",
                    "priority": 5,
                    "title": f"Estimated revenue is up {self._pct_label(revenue_change)}%",
                    "detail": (
                        f"{self._money(currency, estimated)} this period versus "
                        f"{self._money(currency, prev_revenue)} before."
                    ),
                }
            )
        elif isinstance(revenue_change, (int, float)) and revenue_change < 0:
            insights.append(
                {
                    "type": "revenue",
                    "priority": 2,
                    "title": f"Estimated revenue is down {self._pct_label(revenue_change)}%",
                    "detail": (
                        f"{self._money(currency, estimated)} this period versus "
                        f"{self._money(currency, prev_revenue)} before. "
                        "Check whether the drop is fewer bookings or cheaper services."
                    ),
                }
            )

        if (
            bookings >= 5
            and prev_bookings >= 5
            and isinstance(aov_change, (int, float))
            and abs(aov_change) >= 10
            and (bookings_change is None or abs(float(bookings_change)) < 15)
        ):
            direction = "up" if aov_change > 0 else "down"
            insights.append(
                {
                    "type": "revenue",
                    "priority": 3 if aov_change < 0 else 6,
                    "title": f"Average booking value is {direction} {self._pct_label(aov_change)}%",
                    "detail": (
                        f"About {self._money(currency, curr_aov)} per booking now versus "
                        f"{self._money(currency, prev_aov)} before, while booking count stayed close. "
                        + (
                            "Check whether guests are choosing cheaper services."
                            if aov_change < 0
                            else "Guests are booking higher-value work — keep those services visible."
                        )
                    ),
                }
            )

        weekday_rows = operations.get("by_weekday") or []
        weekday_total = sum(int(row.get("total") or 0) for row in weekday_rows)
        busiest_name = operations.get("busiest_day")
        if weekday_total >= 5 and busiest_name:
            peak = max(weekday_rows, key=lambda row: int(row.get("total") or 0))
            peak_total = int(peak.get("total") or 0)
            share = peak_total / weekday_total if weekday_total else 0
            if share >= 0.22 and peak_total >= 4:
                peak_hour = operations.get("busiest_hour")
                share_pct = round(share * 100)
                if share >= 0.4:
                    priority = 3
                    detail = (
                        f"{busiest_name} holds {share_pct}% of bookings. "
                        "Staff that day first, and offer a reason to come on a quieter weekday."
                    )
                elif peak_hour:
                    priority = 5
                    detail = (
                        f"{share_pct}% of bookings land on {busiest_name}, "
                        f"with the peak around {peak_hour}."
                    )
                else:
                    priority = 5
                    detail = f"{share_pct}% of bookings land on {busiest_name}."
                insights.append(
                    {
                        "type": "demand",
                        "priority": priority,
                        "title": f"{busiest_name} is your busiest day",
                        "detail": detail,
                    }
                )

        active_weekdays = [row for row in weekday_rows if int(row.get("total") or 0) >= 0]
        if weekday_total >= 8 and len([row for row in weekday_rows if int(row.get("total") or 0) > 0]) >= 3:
            quiet = min(active_weekdays, key=lambda row: (int(row.get("total") or 0), int(row.get("weekday") or 0)))
            quiet_total = int(quiet.get("total") or 0)
            quiet_name = quiet.get("weekday_name")
            daily_avg = weekday_total / 7
            if (
                quiet_name
                and quiet_name != busiest_name
                and quiet_total <= max(1, daily_avg * 0.35)
            ):
                insights.append(
                    {
                        "type": "demand",
                        "priority": 4,
                        "title": f"{quiet_name} is your quietest day",
                        "detail": (
                            f"Only {quiet_total} booking{'s' if quiet_total != 1 else ''} landed there. "
                            "Run a midweek offer, or keep that day lighter on staff."
                        ),
                    }
                )

        customers = int(growth.get("customers_with_bookings") or 0)
        if customers >= 4:
            repeat_pct = round((growth.get("repeat_rate") or 0) * 100)
            new_customers = int(growth.get("new_customers") or 0)
            returning = int(growth.get("returning_customers") or 0)
            if prev_bookings == 0 and returning == 0:
                insights.append(
                    {
                        "type": "growth",
                        "priority": 6,
                        "title": f"{customers} customers booked for the first time",
                        "detail": "None of them had a visit before this period. Ask each one to rebook before they leave.",
                    }
                )
            elif repeat_pct >= 45:
                insights.append(
                    {
                        "type": "growth",
                        "priority": 7,
                        "title": f"{repeat_pct}% of guests came back",
                        "detail": (
                            f"{returning} returning and {new_customers} new. "
                            "Ask for the next visit at checkout so this holds."
                        ),
                    }
                )
            elif repeat_pct >= 20:
                insights.append(
                    {
                        "type": "growth",
                        "priority": 4,
                        "title": f"{repeat_pct}% of guests came back",
                        "detail": (
                            f"{new_customers} new and {returning} returning. "
                            "A note the day after a first visit usually lifts this."
                        ),
                    }
                )
            else:
                insights.append(
                    {
                        "type": "growth",
                        "priority": 3,
                        "title": f"Only {repeat_pct}% of guests came back",
                        "detail": (
                            f"{new_customers} of {customers} customers were new. "
                            "Ask for the next visit before they leave."
                        ),
                    }
                )

        follow_up = None
        for row in growth.get("top_customers") or []:
            if int(row.get("bookings") or 0) != 1:
                continue
            revenue_amount = float(row.get("revenue") or 0)
            if revenue_amount <= 0:
                continue
            if follow_up is None or revenue_amount > float(follow_up.get("revenue") or 0):
                follow_up = row
        if follow_up and (estimated <= 0 or float(follow_up["revenue"]) >= max(estimated * 0.12, curr_aov or 0)):
            name = str(follow_up.get("customer_name") or "A top customer")
            insights.append(
                {
                    "type": "customer",
                    "priority": 3,
                    "title": f"{name} booked once — follow up",
                    "detail": (
                        f"{self._money(currency, float(follow_up['revenue']))} from a single visit. "
                        "Ask for the next appointment before they go quiet."
                    ),
                }
            )

        service_rows = [row for row in (revenue.get("by_service") or []) if float(row.get("revenue") or 0) > 0]
        top_service = service_rows[0] if service_rows else None
        top_bookings = int(top_service.get("bookings") or 0) if top_service else 0
        if top_service and estimated > 0 and top_bookings >= 2:
            share = round(float(top_service["revenue"]) / estimated * 100)
            name = top_service["service_name"]
            amount = self._money(currency, float(top_service["revenue"]))
            booking_word = "booking" if top_bookings == 1 else "bookings"
            if share >= 50 and len(service_rows) >= 2:
                insights.append(
                    {
                        "type": "service",
                        "priority": 3,
                        "title": f"{name} is {share}% of estimated revenue",
                        "detail": (
                            f"{amount} from {top_bookings} {booking_word}. "
                            "That concentration hurts if demand for it slips — feature a second service on quiet days."
                        ),
                    }
                )
            else:
                insights.append(
                    {
                        "type": "service",
                        "priority": 7,
                        "title": f"{name} leads estimated revenue",
                        "detail": (
                            f"{amount} from {top_bookings} {booking_word} ({share}% of the period). "
                            "Put it forward when the day is slow."
                        ),
                    }
                )

        cancel_rate = float(summary.get("cancellation_rate") or 0)
        no_show_rate = float(summary.get("no_show_rate") or 0)
        cancelled = int(summary.get("cancelled") or 0)
        no_shows = int(summary.get("no_shows") or 0)
        problems: list[str] = []
        if cancelled >= 2 and cancel_rate >= 0.1:
            problems.append(f"{cancelled} cancellations ({round(cancel_rate * 100)}%)")
        if no_shows >= 1 and bookings >= 5 and no_show_rate >= 0.05:
            problems.append(f"{no_shows} no-shows ({round(no_show_rate * 100)}%)")
        if problems:
            if len(problems) == 2:
                title = "Cancellations and no-shows need a closer look"
            elif "no-show" in problems[0]:
                title = "No-shows need a closer look"
            else:
                title = "Cancellations need a closer look"
            insights.append(
                {
                    "type": "risk",
                    "priority": 1,
                    "title": title,
                    "detail": (
                        f"{' · '.join(problems)}. "
                        "Send a reminder the day before, or take a small deposit on the peak slots."
                    ),
                }
            )

        for row in operations.get("by_staff") or []:
            staff_bookings = int(row.get("bookings") or 0)
            if staff_bookings < 5:
                continue
            leak = int(row.get("cancelled") or 0) + int(row.get("no_shows") or 0)
            if leak < 2 or leak / staff_bookings < 0.3:
                continue
            insights.append(
                {
                    "type": "risk",
                    "priority": 1,
                    "title": f"{row.get('staff_name')} is losing {round(leak / staff_bookings * 100)}% of bookings",
                    "detail": (
                        f"{row.get('cancelled', 0)} cancelled and {row.get('no_shows', 0)} no-shows "
                        f"out of {staff_bookings}. Check reminders for those slots."
                    ),
                }
            )
            break

        staff_rows = [row for row in (operations.get("by_staff") or []) if int(row.get("bookings") or 0) > 0]
        if len(staff_rows) >= 2:
            staff_total = sum(int(row.get("bookings") or 0) for row in staff_rows)
            lead = staff_rows[0]
            lead_bookings = int(lead.get("bookings") or 0)
            second_bookings = int(staff_rows[1].get("bookings") or 0)
            if staff_total >= 8 and lead_bookings / staff_total >= 0.55 and lead_bookings >= max(second_bookings * 2, 4):
                insights.append(
                    {
                        "type": "staff",
                        "priority": 4,
                        "title": f"{lead.get('staff_name')} carries {round(lead_bookings / staff_total * 100)}% of bookings",
                        "detail": (
                            f"{lead_bookings} bookings versus {second_bookings} for the next staff member. "
                            "Move a few peak slots to free capacity before the lead day overflows."
                        ),
                    }
                )

        if forecast:
            projected = int(forecast.get("projected_bookings") or 0)
            horizon = int(forecast.get("horizon_days") or 30)
            note = str(forecast.get("note") or "").strip()
            momentum = forecast.get("momentum_pct")
            projected_revenue = float(forecast.get("projected_revenue") or 0)
            soft = "rough floor" in note or "too thin" in note
            slowing = isinstance(momentum, (int, float)) and momentum <= -8
            insights.append(
                {
                    "type": "forecast",
                    "priority": 3 if slowing else 5 if soft else 7,
                    "title": f"Next {horizon} days: about {projected} bookings",
                    "detail": note
                    or (
                        f"About {self._money(currency, projected_revenue)} in estimated revenue "
                        f"if the recent pace holds."
                    ),
                }
            )

        return self._ranked_insights(insights)

    def _commerce_insights(
        self,
        *,
        currency: str,
        orders: int,
        cancelled: int,
        gmv: float,
        previous_orders: int,
        previous_gmv: float,
        returns: int,
        pending_returns: int,
        return_rate: float,
        refund_total: float,
        delivery_fee_total: float,
        by_day: dict[str, dict[str, float | int | str]],
    ) -> list[dict[str, str]]:
        insights: list[dict[str, Any]] = []
        orders_change = self._change_pct(orders, previous_orders)
        gmv_change = self._change_pct(gmv, previous_gmv)
        aov = round(gmv / orders, 2) if orders else 0
        placed = orders + cancelled

        if orders == 0 and previous_orders == 0:
            insights.append(
                {
                    "type": "commerce",
                    "priority": 6,
                    "title": "No shop orders in this period",
                    "detail": "The previous period was quiet too. Check that the catalog is visible and delivery zones cover your customers.",
                }
            )
        elif orders == 0 and previous_orders >= 3:
            insights.append(
                {
                    "type": "commerce",
                    "priority": 0,
                    "title": "Shop orders dropped to zero",
                    "detail": f"The previous period had {previous_orders} orders. Confirm the shop is open and follow up on open carts.",
                }
            )
        elif orders_change is None and orders > 0:
            insights.append(
                {
                    "type": "commerce",
                    "priority": 4,
                    "title": "Shop orders started this period",
                    "detail": (
                        f"{orders} orders, {self._money(currency, gmv)} GMV, "
                        f"about {self._money(currency, aov)} per order."
                    ),
                }
            )
        elif orders_change is not None and abs(orders_change) < 5 and orders > 0:
            gmv_bit = ""
            if isinstance(gmv_change, (int, float)) and abs(gmv_change) >= 8:
                direction = "up" if gmv_change > 0 else "down"
                gmv_bit = f" Order count is flat, but GMV is {direction} {abs(gmv_change)}%."
            insights.append(
                {
                    "type": "commerce",
                    "priority": 8,
                    "title": "Shop orders are steady",
                    "detail": (
                        f"{orders} orders and {self._money(currency, gmv)} GMV. "
                        f"Average order is {self._money(currency, aov)}.{gmv_bit}"
                    ),
                }
            )
        elif isinstance(orders_change, (int, float)) and orders_change > 0:
            insights.append(
                {
                    "type": "commerce",
                    "priority": 5,
                    "title": f"Shop orders are up {self._pct_label(orders_change)}%",
                    "detail": (
                        f"{orders} orders versus {previous_orders} before. "
                        f"GMV is {self._money(currency, gmv)}"
                        + (
                            f", {self._pct_label(gmv_change)}% {'higher' if gmv_change > 0 else 'lower'} than last period."
                            if isinstance(gmv_change, (int, float)) and abs(gmv_change) >= 5
                            else "."
                        )
                    ),
                }
            )
        elif isinstance(orders_change, (int, float)) and orders_change < 0:
            insights.append(
                {
                    "type": "commerce",
                    "priority": 2,
                    "title": f"Shop orders are down {self._pct_label(orders_change)}%",
                    "detail": (
                        f"{orders} orders versus {previous_orders} before, "
                        f"{self._money(currency, gmv)} GMV. Look at the categories that slowed first."
                    ),
                }
            )

        previous_aov = previous_gmv / previous_orders if previous_orders else 0.0
        aov_change = self._change_pct(aov, previous_aov)
        if (
            orders >= 5
            and previous_orders >= 5
            and isinstance(aov_change, (int, float))
            and abs(aov_change) >= 10
            and (orders_change is None or abs(float(orders_change)) < 15)
        ):
            direction = "up" if aov_change > 0 else "down"
            insights.append(
                {
                    "type": "commerce",
                    "priority": 3 if aov_change < 0 else 6,
                    "title": f"Average order value is {direction} {self._pct_label(aov_change)}%",
                    "detail": (
                        f"{self._money(currency, aov)} per order now versus "
                        f"{self._money(currency, previous_aov)} before, while order count stayed close. "
                        + (
                            "Basket size shrank — check promotions and stock on higher-ticket items."
                            if aov_change < 0
                            else "Customers are spending more per order. Keep those bundles easy to find."
                        )
                    ),
                }
            )

        cancel_rate = cancelled / placed if placed else 0
        if cancelled >= 2 and cancel_rate >= 0.08:
            insights.append(
                {
                    "type": "risk",
                    "priority": 1,
                    "title": f"{cancelled} shop orders were cancelled",
                    "detail": (
                        f"That is {round(cancel_rate * 100)}% of orders placed. "
                        "Check stock-outs and payment failures before the next busy day."
                    ),
                }
            )

        if pending_returns > 0:
            insights.append(
                {
                    "type": "returns",
                    "priority": 0,
                    "title": f"{pending_returns} return{'s' if pending_returns != 1 else ''} still pending",
                    "detail": (
                        f"{returns} returns this period ({round(return_rate * 100)}% of orders), "
                        f"{self._money(currency, refund_total)} refunded. Clear the pending ones this week."
                    ),
                }
            )
        elif returns > 0 and (return_rate >= 0.05 or returns >= 3):
            insights.append(
                {
                    "type": "returns",
                    "priority": 3,
                    "title": f"Returns are {round(return_rate * 100)}% of orders",
                    "detail": (
                        f"{returns} returns, {self._money(currency, refund_total)} refunded. "
                        "Look at the products that come back most often."
                    ),
                }
            )

        if gmv > 0 and delivery_fee_total > 0:
            fee_share = delivery_fee_total / gmv
            if fee_share >= 0.03:
                insights.append(
                    {
                        "type": "delivery",
                        "priority": 6,
                        "title": f"Delivery fees are {round(fee_share * 100)}% of GMV",
                        "detail": (
                            f"{self._money(currency, delivery_fee_total)} collected. "
                            "If orders are flat and fees are climbing, the zones may be too wide."
                        ),
                    }
                )

        if orders >= 5 and len(by_day) >= 3:
            best_key = max(by_day, key=lambda key: float(by_day[key]["gmv"]))
            best = by_day[best_key]
            best_gmv = float(best["gmv"])
            if gmv > 0 and best_gmv / gmv >= 0.25:
                day_name = date.fromisoformat(best_key).strftime("%A")
                insights.append(
                    {
                        "type": "demand",
                        "priority": 5,
                        "title": f"{day_name} was the strongest sales day",
                        "detail": (
                            f"{self._money(currency, best_gmv)} from {best['orders']} orders, "
                            f"{round(best_gmv / gmv * 100)}% of period GMV. Staff packing for that weekday."
                        ),
                    }
                )

        return self._ranked_insights(insights)

    def _pets_insights(self, snapshot: dict[str, Any]) -> list[dict[str, str]]:
        insights: list[dict[str, Any]] = []
        upcoming = int(snapshot.get("birthdays_next_7d") or 0)
        total = int(snapshot.get("total") or 0)
        with_photo = int(snapshot.get("with_photo") or 0)
        if upcoming > 0:
            insights.append(
                {
                    "type": "pets",
                    "priority": 3,
                    "title": f"{upcoming} pet birthday{'s' if upcoming != 1 else ''} this week",
                    "detail": "A birthday note is an easy reason for the customer to come back.",
                }
            )
        missing = total - with_photo
        if total >= 5 and missing / total >= 0.4:
            insights.append(
                {
                    "type": "pets",
                    "priority": 8,
                    "title": f"{missing} pets have no photo",
                    "detail": "Photos make the roster easier to recognize at the counter.",
                }
            )
        return self._ranked_insights(insights, limit=4)
