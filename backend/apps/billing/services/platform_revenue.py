from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

from django.db.models import Count, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.billing.constants import PLAN_PRICE_PAISE, YEARLY_PRICE_MULTIPLIER
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.addon_pricing import get_addon_prices
from apps.businesses.models import BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.businesses.services.plan_catalog import list_plan_definitions
from apps.platform_admin.models import PlatformLedgerInvoice

_COMPLIMENTARY_PREFIX = "comp:"
_PENDING_CLAIM_STATUS = "awaiting_confirmation"


def _plan_map() -> dict[str, dict[str, Any]]:
    return {str(row["code"]): row for row in list_plan_definitions()}


def _is_complimentary(subscription: BusinessProductSubscription) -> bool:
    return str(subscription.external_billing_reference or "").startswith(_COMPLIMENTARY_PREFIX)


def _subscription_monthly_paise(
    subscription: BusinessProductSubscription,
    *,
    plan_map: dict[str, dict[str, Any]],
    addon_prices: dict[str, int],
) -> int:
    plan_code = subscription.plan.code if subscription.plan_id else ""
    definition = plan_map.get(plan_code) or {}
    monthly = int(definition.get("amount_paise") or PLAN_PRICE_PAISE.get(plan_code, 0) or 0)
    yearly_raw = definition.get("yearly_amount_paise")
    yearly = int(yearly_raw) if yearly_raw is not None else monthly * YEARLY_PRICE_MULTIPLIER
    addon_monthly = (
        int(subscription.extra_staff or 0) * addon_prices["staff_price_paise"]
        + int(subscription.extra_offices or 0) * addon_prices["office_price_paise"]
        + (addon_prices["pets_price_paise"] if subscription.pets_pack_enabled else 0)
    )
    if (subscription.billing_interval or "monthly") == "yearly":
        return (yearly + addon_monthly * YEARLY_PRICE_MULTIPLIER) // 12
    return monthly + addon_monthly


def _sum_paise(queryset) -> int:
    return int(
        queryset.aggregate(
            v=Coalesce(Sum("amount_paise"), Value(0), output_field=IntegerField())
        ).get("v")
        or 0
    )


def build_platform_revenue_insights() -> dict[str, Any]:
    """Cash collected from paid checkouts plus recognized MRR from paying subscriptions."""

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_30d = now - timedelta(days=30)
    trend_start = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)

    paid = BillingCheckoutSession.objects.filter(status=CheckoutSessionStatus.PAID)
    collected_all = _sum_paise(paid)
    collected_month = _sum_paise(
        paid.filter(
            Q(paid_at__gte=month_start) | Q(paid_at__isnull=True, created_at__gte=month_start)
        )
    )
    collected_last_30d = _sum_paise(
        paid.filter(Q(paid_at__gte=last_30d) | Q(paid_at__isnull=True, created_at__gte=last_30d))
    )
    refunded_all = int(
        PlatformLedgerInvoice.objects.aggregate(
            v=Coalesce(Sum("refunded_paise"), Value(0), output_field=IntegerField())
        ).get("v")
        or 0
    )

    pending_claims = BillingCheckoutSession.objects.filter(
        metadata__payment_status=_PENDING_CLAIM_STATUS,
    )
    open_checkouts = BillingCheckoutSession.objects.filter(status=CheckoutSessionStatus.CREATED)

    daily_rows = (
        paid.filter(
            Q(paid_at__gte=trend_start) | Q(paid_at__isnull=True, created_at__gte=trend_start)
        )
        .annotate(day=TruncDate(Coalesce("paid_at", "created_at")))
        .values("day")
        .annotate(
            collected_paise=Coalesce(Sum("amount_paise"), Value(0), output_field=IntegerField()),
            count=Count("id"),
        )
        .order_by("day")
    )
    daily_map = {
        str(row["day"])[:10]: {
            "day": str(row["day"])[:10],
            "collected_paise": int(row["collected_paise"] or 0),
            "count": int(row["count"] or 0),
        }
        for row in daily_rows
        if row["day"] is not None
    }
    daily: list[dict[str, Any]] = []
    for offset in range(14):
        day = (trend_start + timedelta(days=offset)).date()
        daily.append(
            daily_map.get(
                str(day),
                {"day": str(day), "collected_paise": 0, "count": 0},
            )
        )

    by_product_collected = {
        str(row["product_code"] or "unknown"): int(row["collected_paise"] or 0)
        for row in paid.values("product_code").annotate(
            collected_paise=Coalesce(Sum("amount_paise"), Value(0), output_field=IntegerField())
        )
    }

    top_tenants = []
    tenant_rows = (
        paid.values("tenant_id", "tenant__display_name", "tenant__slug")
        .annotate(
            collected_paise=Coalesce(Sum("amount_paise"), Value(0), output_field=IntegerField()),
            count=Count("id"),
        )
        .order_by("-collected_paise")[:8]
    )
    for row in tenant_rows:
        top_tenants.append(
            {
                "tenant_id": str(row["tenant_id"]) if row["tenant_id"] else None,
                "tenant_name": row["tenant__display_name"] or row["tenant__slug"] or "Tenant",
                "tenant_slug": row["tenant__slug"] or "",
                "collected_paise": int(row["collected_paise"] or 0),
                "payment_count": int(row["count"] or 0),
            }
        )

    recent_payments = []
    recent_qs = paid.select_related("tenant", "business").order_by("-paid_at", "-created_at")[:12]
    for session in recent_qs:
        recent_payments.append(
            {
                "id": str(session.id),
                "tenant_id": str(session.tenant_id) if session.tenant_id else None,
                "tenant_name": session.tenant.display_name if session.tenant_id else "Tenant",
                "business_name": session.business.display_name if session.business_id else "",
                "product_code": session.product_code,
                "plan_code": session.plan_code,
                "amount_paise": session.amount_paise,
                "currency": session.currency,
                "paid_at": (session.paid_at or session.created_at).isoformat(),
                "payment_channel": (session.metadata or {}).get("payment_channel") or "",
            }
        )

    plan_map = _plan_map()
    addon_prices = get_addon_prices()
    subscriptions = BusinessProductSubscription.objects.select_related("plan", "tenant")
    mrr_paise = 0
    paying = 0
    complimentary = 0
    trial = 0
    locked = 0
    canceled = 0
    mrr_by_product: dict[str, int] = defaultdict(int)
    paying_by_product: dict[str, int] = defaultdict(int)
    mrr_by_plan: dict[str, dict[str, int]] = defaultdict(lambda: {"mrr_paise": 0, "count": 0})

    for subscription in subscriptions:
        status = subscription.status
        if status == BusinessProductSubscriptionStatus.TRIALING:
            trial += 1
            continue
        if status == BusinessProductSubscriptionStatus.SOFT_LOCKED:
            locked += 1
            continue
        if status == BusinessProductSubscriptionStatus.CANCELED:
            canceled += 1
            continue
        if status != BusinessProductSubscriptionStatus.ACTIVE:
            continue
        if _is_complimentary(subscription):
            complimentary += 1
            continue
        monthly = _subscription_monthly_paise(
            subscription, plan_map=plan_map, addon_prices=addon_prices
        )
        mrr_paise += monthly
        paying += 1
        mrr_by_product[subscription.product_code] += monthly
        paying_by_product[subscription.product_code] += 1
        plan_code = subscription.plan.code if subscription.plan_id else subscription.product_code
        mrr_by_plan[plan_code]["mrr_paise"] += monthly
        mrr_by_plan[plan_code]["count"] += 1

    product_codes = sorted(set(by_product_collected) | set(mrr_by_product) | set(paying_by_product))
    by_product = [
        {
            "product_code": code,
            "collected_paise": by_product_collected.get(code, 0),
            "mrr_paise": int(mrr_by_product.get(code, 0)),
            "paying_count": int(paying_by_product.get(code, 0)),
        }
        for code in product_codes
    ]
    by_plan = [
        {"plan_code": code, "mrr_paise": values["mrr_paise"], "count": values["count"]}
        for code, values in sorted(
            mrr_by_plan.items(),
            key=lambda item: item[1]["mrr_paise"],
            reverse=True,
        )
    ]

    return {
        "currency": "INR",
        "collected_all_time_paise": collected_all,
        "refunded_all_time_paise": refunded_all,
        "net_collected_paise": max(0, collected_all - refunded_all),
        "collected_month_paise": collected_month,
        "collected_last_30d_paise": collected_last_30d,
        "pending_claims_paise": _sum_paise(pending_claims),
        "pending_claims_count": pending_claims.count(),
        "open_checkouts_paise": _sum_paise(open_checkouts),
        "open_checkouts_count": open_checkouts.count(),
        "paid_payment_count": paid.count(),
        "mrr_paise": mrr_paise,
        "arr_paise": mrr_paise * 12,
        "paying_subscriptions": paying,
        "complimentary_subscriptions": complimentary,
        "trial_subscriptions": trial,
        "soft_locked_subscriptions": locked,
        "canceled_subscriptions": canceled,
        "by_product": by_product,
        "by_plan": by_plan,
        "daily": daily,
        "top_tenants": top_tenants,
        "recent_payments": recent_payments,
    }
