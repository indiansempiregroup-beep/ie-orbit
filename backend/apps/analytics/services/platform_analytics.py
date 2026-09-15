from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Count, F, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.analytics.models import PlatformCatalogDaily, PlatformUsageDaily
from apps.bookings.models import Booking, BookingLineItem, BookingStatus
from apps.businesses.constants import PRODUCT_APPOINTIE, PRODUCT_DISPLAY_NAMES, PRODUCT_SHOPIE
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.customers.models import Customer
from apps.notifications.models import Notification, NotificationStatus
from apps.platform_admin.models import SupportTicket
from apps.services.models import Service
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ReturnStatus,
    ShopOrder,
    ShopOrderLine,
    ShopProduct,
    ShopReturn,
)
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Tenant, TenantStatus

ACTIVE_SUB_STATUSES = {
    BusinessProductSubscriptionStatus.TRIALING,
    BusinessProductSubscriptionStatus.ACTIVE,
    BusinessProductSubscriptionStatus.SOFT_LOCKED,
}

GRAINS = frozenset({"day", "week", "month"})
VALID_PRODUCTS = frozenset({PRODUCT_APPOINTIE, PRODUCT_SHOPIE})
ZERO = Decimal("0")


def _d(value: Any) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return ZERO


def _money(value: Any) -> float:
    return float(_d(value).quantize(Decimal("0.01")))


def _qty(value: Any) -> float:
    return float(_d(value).quantize(Decimal("0.001")))


def _rate(numerator: int, denominator: int) -> float:
    if not denominator:
        return 0.0
    return round(numerator / denominator, 4)


def _uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _inc_map(target: dict[str, int], key: str | None, amount: int) -> None:
    if not key:
        key = "unknown"
    target[key] = int(target.get(key, 0)) + int(amount)


def _period_key(day: date, grain: str) -> tuple[str, date, date]:
    if grain == "week":
        start = day - timedelta(days=day.weekday())
        end = start + timedelta(days=6)
        iso_year, iso_week, _ = start.isocalendar()
        return f"{iso_year}-W{iso_week:02d}", start, end
    if grain == "month":
        start = day.replace(day=1)
        if start.month == 12:
            end = date(start.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(start.year, start.month + 1, 1) - timedelta(days=1)
        return start.strftime("%Y-%m"), start, end
    return day.isoformat(), day, day


def _daterange(start: date, end: date):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


@dataclass
class Fact:
    day: date
    tenant_id: UUID
    tenant_slug: str
    tenant_name: str
    business_id: UUID
    business_code: str
    business_name: str
    product_code: str
    currency: str = "INR"
    bookings: int = 0
    completed_bookings: int = 0
    cancelled_bookings: int = 0
    no_show_bookings: int = 0
    booking_revenue: Decimal = ZERO
    unique_booking_customers: int = 0
    orders: int = 0
    cancelled_orders: int = 0
    pos_orders: int = 0
    online_orders: int = 0
    gmv: Decimal = ZERO
    pos_gmv: Decimal = ZERO
    online_gmv: Decimal = ZERO
    units_sold: Decimal = ZERO
    unique_shop_customers: int = 0
    returns: int = 0
    refund_total: Decimal = ZERO
    new_customers: int = 0
    notifications_sent: int = 0
    tickets_opened: int = 0
    by_status: dict[str, int] = field(default_factory=dict)
    by_source: dict[str, int] = field(default_factory=dict)
    by_channel: dict[str, int] = field(default_factory=dict)
    by_fulfillment: dict[str, int] = field(default_factory=dict)
    delivery_fee: Decimal = ZERO
    booking_customers: set[str] = field(default_factory=set)
    shop_customers: set[str] = field(default_factory=set)

    def metrics_payload(self) -> dict[str, Any]:
        return {
            "by_status": dict(self.by_status),
            "by_source": dict(self.by_source),
            "by_channel": dict(self.by_channel),
            "by_fulfillment": dict(self.by_fulfillment),
            "pos_orders": self.pos_orders,
            "online_orders": self.online_orders,
            "pos_gmv": _money(self.pos_gmv),
            "online_gmv": _money(self.online_gmv),
            "delivery_fee": _money(self.delivery_fee),
            "unique_booking_customers": len(self.booking_customers)
            or self.unique_booking_customers,
            "unique_shop_customers": len(self.shop_customers) or self.unique_shop_customers,
        }

    def as_snapshot_kwargs(self) -> dict[str, Any]:
        unique_booking = len(self.booking_customers) or self.unique_booking_customers
        unique_shop = len(self.shop_customers) or self.unique_shop_customers
        return {
            "day": self.day,
            "tenant_id": self.tenant_id,
            "tenant_slug": self.tenant_slug,
            "tenant_name": self.tenant_name,
            "business_id": self.business_id,
            "business_code": self.business_code,
            "business_name": self.business_name,
            "product_code": self.product_code,
            "currency": self.currency or "INR",
            "bookings": self.bookings,
            "completed_bookings": self.completed_bookings,
            "cancelled_bookings": self.cancelled_bookings,
            "no_show_bookings": self.no_show_bookings,
            "booking_revenue": self.booking_revenue,
            "unique_booking_customers": unique_booking,
            "orders": self.orders,
            "cancelled_orders": self.cancelled_orders,
            "gmv": self.gmv,
            "units_sold": self.units_sold,
            "unique_shop_customers": unique_shop,
            "returns": self.returns,
            "refund_total": self.refund_total,
            "new_customers": self.new_customers,
            "notifications_sent": self.notifications_sent,
            "tickets_opened": self.tickets_opened,
            "metrics": self.metrics_payload(),
        }


def _add_shop_channel(bucket: dict[str, Any], fact: Fact) -> None:
    bucket["pos_orders"] += fact.pos_orders
    bucket["online_orders"] += fact.online_orders
    bucket["pos_gmv"] += fact.pos_gmv
    bucket["online_gmv"] += fact.online_gmv


@dataclass
class CatalogFact:
    day: date
    tenant_id: UUID
    tenant_name: str
    business_id: UUID
    business_name: str
    product_code: str
    item_kind: str
    item_id: UUID
    item_name: str
    currency: str
    activity_count: int = 0
    units: Decimal = ZERO
    revenue: Decimal = ZERO


class PlatformAnalyticsService:
    def overview(
        self,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
        grain: str = "day",
        product_code: str | None = None,
        tenant_id: str | UUID | None = None,
        business_id: str | UUID | None = None,
        catalog_limit: int = 12,
    ) -> dict[str, Any]:
        today = timezone.now().date()
        parsed_end = end_date or today
        parsed_start = start_date or (parsed_end - timedelta(days=29))
        if parsed_start > parsed_end:
            parsed_start, parsed_end = parsed_end, parsed_start
        if (parsed_end - parsed_start).days > 366:
            parsed_start = parsed_end - timedelta(days=366)
        grain = grain if grain in GRAINS else "day"
        product = (product_code or "").strip().lower() or None
        if product and product not in VALID_PRODUCTS:
            product = None
        tenant_uuid = _uuid(tenant_id)
        business_uuid = _uuid(business_id)
        catalog_limit = max(3, min(int(catalog_limit or 12), 50))

        businesses = self._business_index(tenant_id=tenant_uuid, business_id=business_uuid)
        facts = self._collect_facts(
            start=parsed_start,
            end=parsed_end,
            businesses=businesses,
            product_code=product,
        )
        catalog = self._collect_catalog(
            start=parsed_start,
            end=parsed_end,
            businesses=businesses,
            product_code=product,
        )
        census = self._census(
            businesses=businesses, start=parsed_start, end=parsed_end, product_code=product
        )
        kpis, datapoints, by_currency = self._roll_kpis(facts)
        kpis.update(census["kpis"])
        datapoints.update(census["datapoints"])

        return {
            "period": {
                "start_date": parsed_start.isoformat(),
                "end_date": parsed_end.isoformat(),
                "grain": grain,
            },
            "filters": {
                "product_code": product,
                "tenant_id": str(tenant_uuid) if tenant_uuid else None,
                "business_id": str(business_uuid) if business_uuid else None,
            },
            "kpis": kpis,
            "datapoints": datapoints,
            "by_currency": by_currency,
            "by_product": self._roll_products(facts, census["by_product"]),
            "series": self._roll_series(facts, parsed_start, parsed_end, grain),
            "by_tenant": self._roll_tenants(facts),
            "by_business": self._roll_businesses(facts),
            "catalog": self._rank_catalog(catalog, limit=catalog_limit),
        }

    def snapshot_day(self, day: date | None = None) -> dict[str, Any]:
        target = day or (timezone.now().date() - timedelta(days=1))
        businesses = self._business_index()
        facts = self._collect_facts(
            start=target, end=target, businesses=businesses, product_code=None
        )
        catalog = self._collect_catalog(
            start=target, end=target, businesses=businesses, product_code=None
        )
        usage_rows = [
            PlatformUsageDaily(**fact.as_snapshot_kwargs())
            for fact in facts.values()
            if self._fact_has_activity(fact)
        ]
        catalog_rows = [
            PlatformCatalogDaily(
                day=row.day,
                tenant_id=row.tenant_id,
                tenant_name=row.tenant_name,
                business_id=row.business_id,
                business_name=row.business_name,
                product_code=row.product_code,
                item_kind=row.item_kind,
                item_id=row.item_id,
                item_name=row.item_name[:255],
                currency=row.currency or "INR",
                activity_count=row.activity_count,
                units=row.units,
                revenue=row.revenue,
            )
            for row in catalog.values()
        ]
        if usage_rows:
            PlatformUsageDaily.objects.bulk_create(
                usage_rows,
                update_conflicts=True,
                unique_fields=["day", "tenant_id", "business_id", "product_code"],
                update_fields=[
                    "tenant_slug",
                    "tenant_name",
                    "business_code",
                    "business_name",
                    "currency",
                    "bookings",
                    "completed_bookings",
                    "cancelled_bookings",
                    "no_show_bookings",
                    "booking_revenue",
                    "unique_booking_customers",
                    "orders",
                    "cancelled_orders",
                    "gmv",
                    "units_sold",
                    "unique_shop_customers",
                    "returns",
                    "refund_total",
                    "new_customers",
                    "notifications_sent",
                    "tickets_opened",
                    "metrics",
                    "updated_at",
                ],
            )
        if catalog_rows:
            PlatformCatalogDaily.objects.bulk_create(
                catalog_rows,
                update_conflicts=True,
                unique_fields=["day", "business_id", "item_kind", "item_id"],
                update_fields=[
                    "tenant_id",
                    "tenant_name",
                    "business_name",
                    "product_code",
                    "item_name",
                    "currency",
                    "activity_count",
                    "units",
                    "revenue",
                    "updated_at",
                ],
            )
        return {
            "day": target.isoformat(),
            "usage_rows": len(usage_rows),
            "catalog_rows": len(catalog_rows),
        }

    def snapshot_range(self, start: date, end: date) -> dict[str, Any]:
        days = 0
        usage_rows = 0
        catalog_rows = 0
        for day in _daterange(start, end):
            result = self.snapshot_day(day)
            days += 1
            usage_rows += int(result["usage_rows"])
            catalog_rows += int(result["catalog_rows"])
        return {"days": days, "usage_rows": usage_rows, "catalog_rows": catalog_rows}

    def _business_index(
        self,
        *,
        tenant_id: UUID | None = None,
        business_id: UUID | None = None,
    ) -> dict[UUID, dict[str, Any]]:
        queryset = Business.objects.select_related("tenant")
        if tenant_id:
            queryset = queryset.filter(tenant_id=tenant_id)
        if business_id:
            queryset = queryset.filter(id=business_id)
        rows: dict[UUID, dict[str, Any]] = {}
        for business in queryset:
            tenant = business.tenant
            rows[business.id] = {
                "business_id": business.id,
                "business_code": business.business_code,
                "business_name": business.display_name or business.business_name,
                "currency": (business.currency or tenant.currency or "INR").upper(),
                "tenant_id": tenant.id,
                "tenant_slug": tenant.slug,
                "tenant_name": tenant.display_name,
                "tenant_status": tenant.status,
                "created_at": business.created_at,
                "tenant_created_at": tenant.created_at,
            }
        return rows

    def _empty_fact(self, day: date, meta: dict[str, Any], product_code: str) -> Fact:
        return Fact(
            day=day,
            tenant_id=meta["tenant_id"],
            tenant_slug=meta["tenant_slug"],
            tenant_name=meta["tenant_name"],
            business_id=meta["business_id"],
            business_code=meta["business_code"],
            business_name=meta["business_name"],
            product_code=product_code,
            currency=meta["currency"],
        )

    def _bucket(
        self,
        facts: dict[tuple, Fact],
        *,
        day: date,
        business_id: UUID,
        product_code: str,
        businesses: dict[UUID, dict[str, Any]],
    ) -> Fact | None:
        meta = businesses.get(business_id)
        if meta is None:
            return None
        key = (day, meta["tenant_id"], business_id, product_code)
        fact = facts.get(key)
        if fact is None:
            fact = self._empty_fact(day, meta, product_code)
            facts[key] = fact
        return fact

    def _collect_facts(
        self,
        *,
        start: date,
        end: date,
        businesses: dict[UUID, dict[str, Any]],
        product_code: str | None,
    ) -> dict[tuple, Fact]:
        facts: dict[tuple, Fact] = {}
        business_ids = list(businesses.keys())
        if not business_ids:
            return facts
        if product_code in (None, PRODUCT_APPOINTIE):
            self._ingest_bookings(facts, start, end, businesses, business_ids)
        if product_code in (None, PRODUCT_SHOPIE):
            self._ingest_orders(facts, start, end, businesses, business_ids)
        self._ingest_growth(facts, start, end, businesses, business_ids, product_code)
        return facts

    def _ingest_bookings(
        self,
        facts: dict[tuple, Fact],
        start: date,
        end: date,
        businesses: dict[UUID, dict[str, Any]],
        business_ids: list[UUID],
    ) -> None:
        bookings = Booking.objects.filter(
            business_id__in=business_ids,
            appointment_date__gte=start,
            appointment_date__lte=end,
        )
        for row in bookings.values("appointment_date", "business_id", "status").annotate(
            n=Count("id")
        ):
            fact = self._bucket(
                facts,
                day=row["appointment_date"],
                business_id=row["business_id"],
                product_code=PRODUCT_APPOINTIE,
                businesses=businesses,
            )
            if fact is None:
                continue
            count = int(row["n"] or 0)
            fact.bookings += count
            _inc_map(fact.by_status, row["status"], count)
            if row["status"] == BookingStatus.COMPLETED:
                fact.completed_bookings += count
            elif row["status"] == BookingStatus.CANCELLED:
                fact.cancelled_bookings += count
            elif row["status"] == BookingStatus.NO_SHOW:
                fact.no_show_bookings += count

        for row in bookings.values("appointment_date", "business_id", "source").annotate(
            n=Count("id")
        ):
            fact = self._bucket(
                facts,
                day=row["appointment_date"],
                business_id=row["business_id"],
                product_code=PRODUCT_APPOINTIE,
                businesses=businesses,
            )
            if fact is not None:
                _inc_map(fact.by_source, row["source"], int(row["n"] or 0))

        for row in bookings.values("appointment_date", "business_id", "channel").annotate(
            n=Count("id")
        ):
            fact = self._bucket(
                facts,
                day=row["appointment_date"],
                business_id=row["business_id"],
                product_code=PRODUCT_APPOINTIE,
                businesses=businesses,
            )
            if fact is not None:
                _inc_map(fact.by_channel, row["channel"], int(row["n"] or 0))

        for row in (
            BookingLineItem.objects.filter(
                booking__business_id__in=business_ids,
                booking__appointment_date__gte=start,
                booking__appointment_date__lte=end,
            )
            .values("booking__appointment_date", "booking__business_id")
            .annotate(revenue=Coalesce(Sum("price_snapshot"), ZERO))
        ):
            fact = self._bucket(
                facts,
                day=row["booking__appointment_date"],
                business_id=row["booking__business_id"],
                product_code=PRODUCT_APPOINTIE,
                businesses=businesses,
            )
            if fact is not None:
                fact.booking_revenue += _d(row["revenue"])

        for row in (
            bookings.exclude(customer_id=None)
            .values(
                "appointment_date",
                "business_id",
                "customer_id",
            )
            .distinct()
        ):
            fact = self._bucket(
                facts,
                day=row["appointment_date"],
                business_id=row["business_id"],
                product_code=PRODUCT_APPOINTIE,
                businesses=businesses,
            )
            if fact is not None and row["customer_id"]:
                fact.booking_customers.add(str(row["customer_id"]))

    def _ingest_orders(
        self,
        facts: dict[tuple, Fact],
        start: date,
        end: date,
        businesses: dict[UUID, dict[str, Any]],
        business_ids: list[UUID],
    ) -> None:
        orders = ShopOrder.objects.filter(
            business_id__in=business_ids,
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        for row in (
            orders.annotate(day=TruncDate("created_at"))
            .values("day", "business_id", "status")
            .annotate(n=Count("id"), gmv=Coalesce(Sum("total"), ZERO))
        ):
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=PRODUCT_SHOPIE,
                businesses=businesses,
            )
            if fact is None or row["day"] is None:
                continue
            count = int(row["n"] or 0)
            _inc_map(fact.by_status, row["status"], count)
            if row["status"] == OrderStatus.CANCELLED:
                fact.cancelled_orders += count
            else:
                fact.orders += count
                fact.gmv += _d(row["gmv"])

        for row in (
            orders.exclude(status=OrderStatus.CANCELLED)
            .annotate(day=TruncDate("created_at"))
            .values("day", "business_id", "fulfillment_mode")
            .annotate(n=Count("id"), gmv=Coalesce(Sum("total"), ZERO))
        ):
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=PRODUCT_SHOPIE,
                businesses=businesses,
            )
            if fact is None or row["day"] is None:
                continue
            count = int(row["n"] or 0)
            amount = _d(row["gmv"])
            _inc_map(fact.by_fulfillment, row["fulfillment_mode"], count)
            if row["fulfillment_mode"] == FulfillmentMode.POS:
                fact.pos_orders += count
                fact.pos_gmv += amount
            else:
                fact.online_orders += count
                fact.online_gmv += amount

        for row in (
            ShopOrderLine.objects.filter(
                business_id__in=business_ids,
                order__created_at__date__gte=start,
                order__created_at__date__lte=end,
            )
            .exclude(order__status=OrderStatus.CANCELLED)
            .annotate(day=TruncDate("order__created_at"))
            .values("day", "business_id")
            .annotate(units=Coalesce(Sum("quantity"), ZERO))
        ):
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=PRODUCT_SHOPIE,
                businesses=businesses,
            )
            if fact is not None and row["day"] is not None:
                fact.units_sold += _d(row["units"])

        for order in (
            orders.exclude(status=OrderStatus.CANCELLED)
            .only(
                "created_at",
                "business_id",
                "customer_id",
                "metadata",
            )
            .iterator()
        ):
            fact = self._bucket(
                facts,
                day=timezone.localtime(order.created_at).date(),
                business_id=order.business_id,
                product_code=PRODUCT_SHOPIE,
                businesses=businesses,
            )
            if fact is None:
                continue
            if order.customer_id:
                fact.shop_customers.add(str(order.customer_id))
            metadata = order.metadata if isinstance(order.metadata, dict) else {}
            try:
                fact.delivery_fee += _d(metadata.get("delivery_fee") or 0)
            except Exception:
                pass

        for row in (
            ShopReturn.objects.filter(
                business_id__in=business_ids,
                created_at__date__gte=start,
                created_at__date__lte=end,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day", "business_id")
            .annotate(n=Count("id"), refund=Coalesce(Sum("refund_total"), ZERO))
        ):
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=PRODUCT_SHOPIE,
                businesses=businesses,
            )
            if fact is not None and row["day"] is not None:
                fact.returns += int(row["n"] or 0)
                fact.refund_total += _d(row["refund"])

    def _ingest_growth(
        self,
        facts: dict[tuple, Fact],
        start: date,
        end: date,
        businesses: dict[UUID, dict[str, Any]],
        business_ids: list[UUID],
        product_code: str | None,
    ) -> None:
        growth_product = product_code or PRODUCT_APPOINTIE
        for row in (
            Customer.objects.filter(
                business_id__in=business_ids,
                created_at__date__gte=start,
                created_at__date__lte=end,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day", "business_id")
            .annotate(n=Count("id"))
        ):
            if row["day"] is None:
                continue
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=growth_product,
                businesses=businesses,
            )
            if fact is not None:
                fact.new_customers += int(row["n"] or 0)

        for row in (
            Notification.objects.filter(
                business_id__in=business_ids,
                status=NotificationStatus.SENT,
                created_at__date__gte=start,
                created_at__date__lte=end,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day", "business_id")
            .annotate(n=Count("id"))
        ):
            if row["day"] is None:
                continue
            for code in (
                (PRODUCT_APPOINTIE, PRODUCT_SHOPIE) if product_code is None else (product_code,)
            ):
                fact = self._bucket(
                    facts,
                    day=row["day"],
                    business_id=row["business_id"],
                    product_code=code,
                    businesses=businesses,
                )
                if fact is not None:
                    fact.notifications_sent += int(row["n"] or 0)
                    break

        for row in (
            SupportTicket.objects.filter(
                business_id__in=business_ids,
                created_at__date__gte=start,
                created_at__date__lte=end,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day", "business_id")
            .annotate(n=Count("id"))
        ):
            if row["day"] is None:
                continue
            fact = self._bucket(
                facts,
                day=row["day"],
                business_id=row["business_id"],
                product_code=growth_product,
                businesses=businesses,
            )
            if fact is not None:
                fact.tickets_opened += int(row["n"] or 0)

    def _collect_catalog(
        self,
        *,
        start: date,
        end: date,
        businesses: dict[UUID, dict[str, Any]],
        product_code: str | None,
    ) -> dict[tuple, CatalogFact]:
        rows: dict[tuple, CatalogFact] = {}
        business_ids = list(businesses.keys())
        if not business_ids:
            return rows

        def upsert(
            *, day, business_id, product, kind, item_id, name, count, units, revenue
        ) -> None:
            meta = businesses.get(business_id)
            if meta is None or day is None or not item_id:
                return
            key = (day, business_id, kind, item_id)
            current = rows.get(key)
            if current is None:
                current = CatalogFact(
                    day=day,
                    tenant_id=meta["tenant_id"],
                    tenant_name=meta["tenant_name"],
                    business_id=business_id,
                    business_name=meta["business_name"],
                    product_code=product,
                    item_kind=kind,
                    item_id=item_id,
                    item_name=name or str(item_id),
                    currency=meta["currency"],
                )
                rows[key] = current
            current.activity_count += int(count or 0)
            current.units += _d(units)
            current.revenue += _d(revenue)
            if name:
                current.item_name = name

        if product_code in (None, PRODUCT_APPOINTIE):
            service_names = {
                row["id"]: (row["display_name"] or row["name"])
                for row in Service.objects.filter(business_id__in=business_ids).values(
                    "id", "name", "display_name"
                )
            }
            for row in (
                BookingLineItem.objects.filter(
                    booking__business_id__in=business_ids,
                    booking__appointment_date__gte=start,
                    booking__appointment_date__lte=end,
                )
                .values("booking__appointment_date", "booking__business_id", "service_id")
                .annotate(
                    n=Count("booking_id", distinct=True),
                    revenue=Coalesce(Sum("price_snapshot"), ZERO),
                )
            ):
                upsert(
                    day=row["booking__appointment_date"],
                    business_id=row["booking__business_id"],
                    product=PRODUCT_APPOINTIE,
                    kind=PlatformCatalogDaily.ItemKind.SERVICE,
                    item_id=row["service_id"],
                    name=service_names.get(row["service_id"]),
                    count=row["n"],
                    units=row["n"],
                    revenue=row["revenue"],
                )

        if product_code in (None, PRODUCT_SHOPIE):
            for row in (
                ShopOrderLine.objects.filter(
                    business_id__in=business_ids,
                    order__created_at__date__gte=start,
                    order__created_at__date__lte=end,
                )
                .exclude(order__status=OrderStatus.CANCELLED)
                .annotate(day=TruncDate("order__created_at"))
                .values("day", "business_id", "product_id", "product_name")
                .annotate(
                    n=Count("order_id", distinct=True),
                    units=Coalesce(Sum("quantity"), ZERO),
                    revenue=Coalesce(Sum("line_total"), ZERO),
                )
            ):
                upsert(
                    day=row["day"],
                    business_id=row["business_id"],
                    product=PRODUCT_SHOPIE,
                    kind=PlatformCatalogDaily.ItemKind.SKU,
                    item_id=row["product_id"],
                    name=row["product_name"],
                    count=row["n"],
                    units=row["units"],
                    revenue=row["revenue"],
                )
        return rows

    def _census(
        self,
        *,
        businesses: dict[UUID, dict[str, Any]],
        start: date,
        end: date,
        product_code: str | None,
    ) -> dict[str, Any]:
        tenant_ids = {meta["tenant_id"] for meta in businesses.values()}
        tenants = Tenant.objects.filter(id__in=tenant_ids) if tenant_ids else Tenant.objects.none()
        subscriptions = BusinessProductSubscription.objects.filter(
            business_id__in=list(businesses.keys())
        )
        if product_code:
            subscriptions = subscriptions.filter(product_code=product_code)

        by_status: dict[str, int] = defaultdict(int)
        by_product: dict[str, dict[str, int]] = defaultdict(
            lambda: {
                "subscriptions": 0,
                "trialing": 0,
                "paying": 0,
                "soft_locked": 0,
                "canceled": 0,
                "businesses": 0,
            }
        )
        for row in subscriptions.values("product_code", "status").annotate(n=Count("id")):
            code = (row["product_code"] or "").strip().lower()
            status = row["status"]
            count = int(row["n"] or 0)
            by_status[status] += count
            bucket = by_product[code]
            bucket["subscriptions"] += count
            if status == BusinessProductSubscriptionStatus.TRIALING:
                bucket["trialing"] += count
            elif status == BusinessProductSubscriptionStatus.ACTIVE:
                bucket["paying"] += count
            elif status == BusinessProductSubscriptionStatus.SOFT_LOCKED:
                bucket["soft_locked"] += count
            elif status == BusinessProductSubscriptionStatus.CANCELED:
                bucket["canceled"] += count

        for row in (
            subscriptions.filter(status__in=ACTIVE_SUB_STATUSES)
            .values("product_code")
            .annotate(n=Count("business_id", distinct=True))
        ):
            by_product[row["product_code"]]["businesses"] = int(row["n"] or 0)

        new_tenants = tenants.filter(created_at__date__gte=start, created_at__date__lte=end).count()
        new_businesses = sum(
            1
            for meta in businesses.values()
            if meta["created_at"] and start <= timezone.localtime(meta["created_at"]).date() <= end
        )
        customers_total = Customer.objects.filter(business_id__in=list(businesses.keys())).count()
        staff_active = Staff.objects.filter(
            business_id__in=list(businesses.keys()),
            employment_status=EmploymentStatus.ACTIVE,
        ).count()
        catalog_services = Service.objects.filter(business_id__in=list(businesses.keys())).count()
        catalog_skus = ShopProduct.objects.filter(
            business_id__in=list(businesses.keys()),
            status=ProductStatus.ACTIVE,
        ).count()
        low_stock = ShopProduct.objects.filter(
            business_id__in=list(businesses.keys()),
            status=ProductStatus.ACTIVE,
            low_stock_threshold__gt=0,
            stock_on_hand__lte=F("low_stock_threshold"),
        ).count()
        pending_returns = ShopReturn.objects.filter(
            business_id__in=list(businesses.keys()),
            status=ReturnStatus.PENDING,
        ).count()
        open_tickets = SupportTicket.objects.filter(
            business_id__in=list(businesses.keys()),
            status__in=[SupportTicket.Status.OPEN, SupportTicket.Status.PENDING],
        ).count()

        kpis = {
            "tenants": len(tenant_ids),
            "tenants_active": tenants.filter(status=TenantStatus.ACTIVE).count(),
            "businesses": len(businesses),
            "new_tenants": new_tenants,
            "new_businesses": new_businesses,
            "customers_total": customers_total,
            "staff_active": staff_active,
            "catalog_services": catalog_services,
            "catalog_skus": catalog_skus,
            "low_stock_skus": low_stock,
            "pending_returns": pending_returns,
            "open_tickets": open_tickets,
            "subscriptions": sum(by_status.values()),
            "subscriptions_trialing": by_status.get(BusinessProductSubscriptionStatus.TRIALING, 0),
            "subscriptions_active": by_status.get(BusinessProductSubscriptionStatus.ACTIVE, 0),
            "subscriptions_soft_locked": by_status.get(
                BusinessProductSubscriptionStatus.SOFT_LOCKED, 0
            ),
            "subscriptions_canceled": by_status.get(BusinessProductSubscriptionStatus.CANCELED, 0),
        }
        return {
            "kpis": kpis,
            "datapoints": {"subscription_status": dict(by_status)},
            "by_product": dict(by_product),
        }

    def _fact_has_activity(self, fact: Fact) -> bool:
        return any(
            [
                fact.bookings,
                fact.orders,
                fact.cancelled_orders,
                fact.returns,
                fact.new_customers,
                fact.notifications_sent,
                fact.tickets_opened,
                fact.booking_revenue,
                fact.gmv,
            ]
        )

    def _roll_kpis(
        self, facts: dict[tuple, Fact]
    ) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
        bookings = 0
        completed = 0
        cancelled = 0
        no_shows = 0
        booking_revenue = ZERO
        orders = 0
        cancelled_orders = 0
        pos_orders = 0
        online_orders = 0
        gmv = ZERO
        pos_gmv = ZERO
        online_gmv = ZERO
        units = ZERO
        returns = 0
        refund_total = ZERO
        new_customers = 0
        notifications_sent = 0
        tickets_opened = 0
        delivery_fee = ZERO
        booking_customers: set[str] = set()
        shop_customers: set[str] = set()
        by_status: dict[str, int] = defaultdict(int)
        by_source: dict[str, int] = defaultdict(int)
        by_channel: dict[str, int] = defaultdict(int)
        by_fulfillment: dict[str, int] = defaultdict(int)
        currency_map: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "currency": "",
                "booking_revenue": ZERO,
                "gmv": ZERO,
                "pos_gmv": ZERO,
                "online_gmv": ZERO,
                "bookings": 0,
                "orders": 0,
                "pos_orders": 0,
                "online_orders": 0,
            }
        )

        for fact in facts.values():
            bookings += fact.bookings
            completed += fact.completed_bookings
            cancelled += fact.cancelled_bookings
            no_shows += fact.no_show_bookings
            booking_revenue += fact.booking_revenue
            orders += fact.orders
            cancelled_orders += fact.cancelled_orders
            pos_orders += fact.pos_orders
            online_orders += fact.online_orders
            gmv += fact.gmv
            pos_gmv += fact.pos_gmv
            online_gmv += fact.online_gmv
            units += fact.units_sold
            returns += fact.returns
            refund_total += fact.refund_total
            notifications_sent += fact.notifications_sent
            tickets_opened += fact.tickets_opened
            delivery_fee += fact.delivery_fee
            new_customers += fact.new_customers
            booking_customers.update(fact.booking_customers)
            shop_customers.update(fact.shop_customers)
            for key, value in fact.by_status.items():
                by_status[f"{fact.product_code}:{key}"] += value
            for key, value in fact.by_source.items():
                by_source[key] += value
            for key, value in fact.by_channel.items():
                by_channel[key] += value
            for key, value in fact.by_fulfillment.items():
                by_fulfillment[key] += value
            currency_row = currency_map[fact.currency or "INR"]
            currency_row["currency"] = fact.currency or "INR"
            currency_row["booking_revenue"] += fact.booking_revenue
            currency_row["gmv"] += fact.gmv
            currency_row["pos_gmv"] += fact.pos_gmv
            currency_row["online_gmv"] += fact.online_gmv
            currency_row["bookings"] += fact.bookings
            currency_row["orders"] += fact.orders
            currency_row["pos_orders"] += fact.pos_orders
            currency_row["online_orders"] += fact.online_orders

        kpis = {
            "bookings": bookings,
            "completed_bookings": completed,
            "cancelled_bookings": cancelled,
            "no_show_bookings": no_shows,
            "booking_revenue": _money(booking_revenue),
            "avg_booking_value": _money(booking_revenue / bookings) if bookings else 0,
            "completion_rate": _rate(completed, bookings),
            "cancellation_rate": _rate(cancelled, bookings),
            "no_show_rate": _rate(no_shows, bookings),
            "unique_booking_customers": len(booking_customers),
            "orders": orders,
            "cancelled_orders": cancelled_orders,
            "pos_orders": pos_orders,
            "online_orders": online_orders,
            "gmv": _money(gmv),
            "pos_gmv": _money(pos_gmv),
            "online_gmv": _money(online_gmv),
            "avg_order_value": _money(gmv / orders) if orders else 0,
            "avg_pos_order_value": _money(pos_gmv / pos_orders) if pos_orders else 0,
            "avg_online_order_value": _money(online_gmv / online_orders) if online_orders else 0,
            "units_sold": _qty(units),
            "unique_shop_customers": len(shop_customers),
            "returns": returns,
            "refund_total": _money(refund_total),
            "return_rate": _rate(returns, orders),
            "delivery_fee_total": _money(delivery_fee),
            "new_customers": new_customers,
            "notifications_sent": notifications_sent,
            "tickets_opened": tickets_opened,
        }
        datapoints = {
            "booking_status": {
                key.split(":", 1)[1]: value
                for key, value in by_status.items()
                if key.startswith(f"{PRODUCT_APPOINTIE}:")
            },
            "order_status": {
                key.split(":", 1)[1]: value
                for key, value in by_status.items()
                if key.startswith(f"{PRODUCT_SHOPIE}:")
            },
            "booking_source": dict(by_source),
            "booking_channel": dict(by_channel),
            "fulfillment_mode": dict(by_fulfillment),
        }
        by_currency = [
            {
                "currency": row["currency"],
                "booking_revenue": _money(row["booking_revenue"]),
                "gmv": _money(row["gmv"]),
                "pos_gmv": _money(row["pos_gmv"]),
                "online_gmv": _money(row["online_gmv"]),
                "bookings": row["bookings"],
                "orders": row["orders"],
                "pos_orders": row["pos_orders"],
                "online_orders": row["online_orders"],
            }
            for row in sorted(
                currency_map.values(),
                key=lambda item: item["gmv"] + item["booking_revenue"],
                reverse=True,
            )
        ]
        return kpis, datapoints, by_currency

    def _roll_products(
        self,
        facts: dict[tuple, Fact],
        census: dict[str, dict[str, int]],
    ) -> list[dict[str, Any]]:
        buckets: dict[str, dict[str, Any]] = {}
        for code in (PRODUCT_APPOINTIE, PRODUCT_SHOPIE):
            info = census.get(code, {})
            buckets[code] = {
                "product_code": code,
                "product_name": PRODUCT_DISPLAY_NAMES.get(code, code),
                "bookings": 0,
                "completed_bookings": 0,
                "booking_revenue": ZERO,
                "orders": 0,
                "gmv": ZERO,
                "pos_orders": 0,
                "online_orders": 0,
                "pos_gmv": ZERO,
                "online_gmv": ZERO,
                "units_sold": ZERO,
                "returns": 0,
                "new_customers": 0,
                "tenants": set(),
                "businesses": set(),
                "subscriptions": info.get("subscriptions", 0),
                "trialing": info.get("trialing", 0),
                "paying": info.get("paying", 0),
                "soft_locked": info.get("soft_locked", 0),
            }
        for fact in facts.values():
            bucket = buckets.get(fact.product_code)
            if bucket is None:
                continue
            bucket["bookings"] += fact.bookings
            bucket["completed_bookings"] += fact.completed_bookings
            bucket["booking_revenue"] += fact.booking_revenue
            bucket["orders"] += fact.orders
            bucket["gmv"] += fact.gmv
            _add_shop_channel(bucket, fact)
            bucket["units_sold"] += fact.units_sold
            bucket["returns"] += fact.returns
            bucket["new_customers"] += fact.new_customers
            bucket["tenants"].add(str(fact.tenant_id))
            bucket["businesses"].add(str(fact.business_id))
        rows = []
        for bucket in buckets.values():
            rows.append(
                {
                    **bucket,
                    "booking_revenue": _money(bucket["booking_revenue"]),
                    "gmv": _money(bucket["gmv"]),
                    "pos_gmv": _money(bucket["pos_gmv"]),
                    "online_gmv": _money(bucket["online_gmv"]),
                    "units_sold": _qty(bucket["units_sold"]),
                    "tenants": len(bucket["tenants"]),
                    "businesses_active": len(bucket["businesses"]),
                }
            )
        return rows

    def _roll_series(
        self,
        facts: dict[tuple, Fact],
        start: date,
        end: date,
        grain: str,
    ) -> list[dict[str, Any]]:
        buckets: dict[str, dict[str, Any]] = {}
        for day in _daterange(start, end):
            key, period_start, period_end = _period_key(day, grain)
            buckets.setdefault(
                key,
                {
                    "period": key,
                    "start_date": period_start.isoformat(),
                    "end_date": period_end.isoformat(),
                    "bookings": 0,
                    "completed_bookings": 0,
                    "cancelled_bookings": 0,
                    "booking_revenue": ZERO,
                    "orders": 0,
                    "gmv": ZERO,
                    "pos_orders": 0,
                    "online_orders": 0,
                    "pos_gmv": ZERO,
                    "online_gmv": ZERO,
                    "units_sold": ZERO,
                    "returns": 0,
                    "new_customers": 0,
                },
            )
        for fact in facts.values():
            key, _, _ = _period_key(fact.day, grain)
            bucket = buckets[key]
            bucket["bookings"] += fact.bookings
            bucket["completed_bookings"] += fact.completed_bookings
            bucket["cancelled_bookings"] += fact.cancelled_bookings
            bucket["booking_revenue"] += fact.booking_revenue
            bucket["orders"] += fact.orders
            bucket["gmv"] += fact.gmv
            _add_shop_channel(bucket, fact)
            bucket["units_sold"] += fact.units_sold
            bucket["returns"] += fact.returns
            bucket["new_customers"] += fact.new_customers
        return [
            {
                **bucket,
                "booking_revenue": _money(bucket["booking_revenue"]),
                "gmv": _money(bucket["gmv"]),
                "pos_gmv": _money(bucket["pos_gmv"]),
                "online_gmv": _money(bucket["online_gmv"]),
                "units_sold": _qty(bucket["units_sold"]),
            }
            for bucket in buckets.values()
        ]

    def _roll_tenants(self, facts: dict[tuple, Fact]) -> list[dict[str, Any]]:
        buckets: dict[UUID, dict[str, Any]] = {}
        for fact in facts.values():
            bucket = buckets.setdefault(
                fact.tenant_id,
                {
                    "tenant_id": str(fact.tenant_id),
                    "tenant_slug": fact.tenant_slug,
                    "tenant_name": fact.tenant_name,
                    "businesses": set(),
                    "bookings": 0,
                    "booking_revenue": ZERO,
                    "orders": 0,
                    "gmv": ZERO,
                    "pos_orders": 0,
                    "online_orders": 0,
                    "pos_gmv": ZERO,
                    "online_gmv": ZERO,
                    "units_sold": ZERO,
                    "returns": 0,
                    "new_customers": 0,
                    "products": set(),
                },
            )
            bucket["businesses"].add(str(fact.business_id))
            bucket["bookings"] += fact.bookings
            bucket["booking_revenue"] += fact.booking_revenue
            bucket["orders"] += fact.orders
            bucket["gmv"] += fact.gmv
            _add_shop_channel(bucket, fact)
            bucket["units_sold"] += fact.units_sold
            bucket["returns"] += fact.returns
            bucket["products"].add(fact.product_code)
            bucket["new_customers"] += fact.new_customers
        rows = []
        for bucket in buckets.values():
            rows.append(
                {
                    **bucket,
                    "businesses": len(bucket["businesses"]),
                    "booking_revenue": _money(bucket["booking_revenue"]),
                    "gmv": _money(bucket["gmv"]),
                    "pos_gmv": _money(bucket["pos_gmv"]),
                    "online_gmv": _money(bucket["online_gmv"]),
                    "units_sold": _qty(bucket["units_sold"]),
                    "products": sorted(bucket["products"]),
                    "activity_score": bucket["bookings"] + bucket["orders"],
                }
            )
        rows.sort(
            key=lambda row: (row["gmv"] + row["booking_revenue"], row["activity_score"]),
            reverse=True,
        )
        return rows

    def _roll_businesses(self, facts: dict[tuple, Fact]) -> list[dict[str, Any]]:
        buckets: dict[UUID, dict[str, Any]] = {}
        for fact in facts.values():
            bucket = buckets.setdefault(
                fact.business_id,
                {
                    "business_id": str(fact.business_id),
                    "business_code": fact.business_code,
                    "business_name": fact.business_name,
                    "tenant_id": str(fact.tenant_id),
                    "tenant_name": fact.tenant_name,
                    "currency": fact.currency,
                    "bookings": 0,
                    "booking_revenue": ZERO,
                    "orders": 0,
                    "gmv": ZERO,
                    "pos_orders": 0,
                    "online_orders": 0,
                    "pos_gmv": ZERO,
                    "online_gmv": ZERO,
                    "units_sold": ZERO,
                    "returns": 0,
                    "new_customers": 0,
                    "products": set(),
                },
            )
            bucket["bookings"] += fact.bookings
            bucket["booking_revenue"] += fact.booking_revenue
            bucket["orders"] += fact.orders
            bucket["gmv"] += fact.gmv
            _add_shop_channel(bucket, fact)
            bucket["units_sold"] += fact.units_sold
            bucket["returns"] += fact.returns
            bucket["products"].add(fact.product_code)
            bucket["new_customers"] += fact.new_customers
        rows = []
        for bucket in buckets.values():
            rows.append(
                {
                    **bucket,
                    "booking_revenue": _money(bucket["booking_revenue"]),
                    "gmv": _money(bucket["gmv"]),
                    "pos_gmv": _money(bucket["pos_gmv"]),
                    "online_gmv": _money(bucket["online_gmv"]),
                    "units_sold": _qty(bucket["units_sold"]),
                    "products": sorted(bucket["products"]),
                    "activity_score": bucket["bookings"] + bucket["orders"],
                }
            )
        rows.sort(
            key=lambda row: (row["gmv"] + row["booking_revenue"], row["activity_score"]),
            reverse=True,
        )
        return rows

    def _rank_catalog(self, catalog: dict[tuple, CatalogFact], *, limit: int) -> dict[str, Any]:
        services = [
            row
            for row in catalog.values()
            if row.item_kind == PlatformCatalogDaily.ItemKind.SERVICE
        ]
        skus = [
            row for row in catalog.values() if row.item_kind == PlatformCatalogDaily.ItemKind.SKU
        ]

        def serialize(row: CatalogFact) -> dict[str, Any]:
            return {
                "item_id": str(row.item_id),
                "item_name": row.item_name,
                "item_kind": row.item_kind,
                "product_code": row.product_code,
                "tenant_id": str(row.tenant_id),
                "tenant_name": row.tenant_name,
                "business_id": str(row.business_id),
                "business_name": row.business_name,
                "currency": row.currency,
                "activity_count": row.activity_count,
                "units": _qty(row.units),
                "revenue": _money(row.revenue),
            }

        def ranked(rows: list[CatalogFact]) -> dict[str, list[dict[str, Any]]]:
            merged: dict[tuple, dict[str, Any]] = {}
            for row in rows:
                key = (row.business_id, row.item_id)
                current = merged.get(key)
                payload = serialize(row)
                if current is None:
                    merged[key] = payload
                else:
                    current["activity_count"] += payload["activity_count"]
                    current["units"] = round(current["units"] + payload["units"], 3)
                    current["revenue"] = round(current["revenue"] + payload["revenue"], 2)
            values = list(merged.values())
            top = sorted(
                values,
                key=lambda item: (item["revenue"], item["units"], item["activity_count"]),
                reverse=True,
            )
            bottom = sorted(
                values, key=lambda item: (item["revenue"], item["units"], item["activity_count"])
            )
            return {"top": top[:limit], "bottom": bottom[:limit], "distinct": len(values)}

        return {
            "services": ranked(services),
            "skus": ranked(skus),
        }
