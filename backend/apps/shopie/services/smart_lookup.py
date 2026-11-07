from __future__ import annotations

import base64
import json
import logging
import os
import re
import urllib.error
import urllib.parse as urllib_parse
import urllib.request
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.businesses.constants import FEATURE_SHOPIE_PRODUCTS, FEATURE_SHOPIE_SMART_LOOKUP, PRODUCT_SHOPIE
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.feature_flags import tenant_feature_enabled
from apps.platform_admin.models import PlatformSmartLookupSettings
from apps.shopie.models import ShopBusinessSettings, SmartLookupUsage, SmartLookupWallet
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.tenancy.models import Tenant

logger = logging.getLogger(__name__)

GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"
# Text barcode lookups use Google Search grounding when enabled (default on).
GEMINI_TEXT_USE_SEARCH = (os.environ.get("GEMINI_TEXT_USE_SEARCH") or "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
DEFAULT_SUGGESTED_TOP_UPS = [5000, 10000, 25000, 50000]
_MEDIA_FILE_RE = re.compile(
    r"(?:https?://[^/]+)?/api/v1/media/([0-9a-fA-F-]{36})/file(?:\?.*)?$",
    re.IGNORECASE,
)


def serialize_usage_row(row: SmartLookupUsage, *, include_scope: bool = False) -> dict[str, Any]:
    charged = int(row.charged_paise or 0)
    balance_after = row.balance_after_paise
    entry_type = "lookup"
    if charged < 0 or row.source == "wallet_top_up":
        entry_type = "credit"
    elif charged > 0:
        entry_type = "debit"
    payload: dict[str, Any] = {
        "id": str(row.id),
        "created_at": row.created_at.isoformat(),
        "code": row.code or "",
        "source": row.source or "",
        "found": bool(row.found),
        "charged_paise": charged,
        "charged_inr": charged / 100,
        "balance_after_paise": balance_after if balance_after is None else int(balance_after),
        "balance_after_inr": None if balance_after is None else int(balance_after) / 100,
        "entry_type": entry_type,
        "model": row.model or "",
        "input_tokens": int(row.input_tokens or 0),
        "output_tokens": int(row.output_tokens or 0),
        "usd_micros": int(row.usd_micros or 0),
        "metadata": row.metadata if isinstance(row.metadata, dict) else {},
    }
    if include_scope:
        tenant = getattr(row, "tenant", None)
        business = getattr(row, "business", None)
        payload.update(
            {
                "tenant_id": str(row.tenant_id) if row.tenant_id else None,
                "tenant_slug": getattr(tenant, "slug", None) or "",
                "tenant_name": getattr(tenant, "display_name", None) or "",
                "business_id": str(row.business_id) if row.business_id else None,
                "business_name": getattr(business, "display_name", None)
                or getattr(business, "business_name", None)
                or "",
            }
        )
    return payload


def _parse_boundary(value: str | None, *, end_of_day: bool = False):
    raw = (value or "").strip()
    if not raw:
        return None
    dt = parse_datetime(raw)
    if dt is not None:
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    day = parse_date(raw)
    if day is None:
        return None
    clock = time(23, 59, 59, 999999) if end_of_day else time.min
    dt = datetime.combine(day, clock)
    return timezone.make_aware(dt, timezone.get_current_timezone())


def apply_usage_ledger_filters(
    qs,
    *,
    kind: str = "money",
    source: str = "",
    code: str = "",
    q: str = "",
    date_from: str = "",
    date_to: str = "",
    found: str | bool | None = None,
    tenant_id: str = "",
    business_id: str = "",
    window_days: int | None = None,
):
    kind = (kind or "money").strip().lower() or "money"
    if kind == "money":
        qs = qs.exclude(charged_paise=0)
    elif kind == "lookups":
        qs = qs.exclude(source="wallet_top_up")
    elif kind == "credits":
        qs = qs.filter(charged_paise__lt=0)
    elif kind == "debits":
        qs = qs.filter(charged_paise__gt=0)
    # kind == "all" → no charge filter

    source = (source or "").strip()
    if source:
        qs = qs.filter(source__iexact=source)

    code = (code or "").strip()
    if code:
        qs = qs.filter(code__icontains=code)

    q = (q or "").strip()
    if q:
        qs = qs.filter(
            Q(code__icontains=q)
            | Q(source__icontains=q)
            | Q(metadata__invoice_number__icontains=q)
            | Q(metadata__supplier_name__icontains=q)
            | Q(business__display_name__icontains=q)
            | Q(business__business_name__icontains=q)
            | Q(tenant__display_name__icontains=q)
            | Q(tenant__slug__icontains=q)
        )

    start = _parse_boundary(date_from, end_of_day=False)
    end = _parse_boundary(date_to, end_of_day=True)
    if start is not None:
        qs = qs.filter(created_at__gte=start)
    if end is not None:
        qs = qs.filter(created_at__lte=end)
    if window_days and start is None and end is None:
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=max(1, int(window_days))))

    if found is not None and found != "":
        if isinstance(found, bool):
            qs = qs.filter(found=found)
        else:
            token = str(found).strip().lower()
            if token in {"1", "true", "yes"}:
                qs = qs.filter(found=True)
            elif token in {"0", "false", "no"}:
                qs = qs.filter(found=False)

    tenant_id = (tenant_id or "").strip()
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
    business_id = (business_id or "").strip()
    if business_id:
        qs = qs.filter(business_id=business_id)

    return qs, kind


def paginate_usage_ledger(
    qs,
    *,
    page: int = 1,
    page_size: int = 25,
    include_scope: bool = False,
    kind: str = "money",
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 25)))
    aggregates = qs.aggregate(
        total=Count("id"),
        credits_paise=Sum("charged_paise", filter=Q(charged_paise__lt=0)),
        debits_paise=Sum("charged_paise", filter=Q(charged_paise__gt=0)),
        credit_count=Count("id", filter=Q(charged_paise__lt=0)),
        debit_count=Count("id", filter=Q(charged_paise__gt=0)),
    )
    total = int(aggregates["total"] or 0)
    credits_paise = abs(int(aggregates["credits_paise"] or 0))
    debits_paise = int(aggregates["debits_paise"] or 0)
    offset = (page - 1) * page_size
    rows = list(qs.order_by("-created_at", "-id")[offset : offset + page_size])
    return {
        "kind": kind,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(1, (total + page_size - 1) // page_size) if total else 1,
        "has_more": offset + len(rows) < total,
        "summary": {
            "credit_count": int(aggregates["credit_count"] or 0),
            "debit_count": int(aggregates["debit_count"] or 0),
            "credits_paise": credits_paise,
            "credits_inr": credits_paise / 100,
            "debits_paise": debits_paise,
            "debits_inr": debits_paise / 100,
            "net_paise": credits_paise - debits_paise,
            "net_inr": (credits_paise - debits_paise) / 100,
        },
        "filters": filters or {},
        "items": [serialize_usage_row(row, include_scope=include_scope) for row in rows],
    }


DEFAULT_SMART_LOOKUP_PRICES_MINOR = {
    "INR": {"min_charge": 1, "top_ups": list(DEFAULT_SUGGESTED_TOP_UPS)},
    "USD": {"min_charge": 1, "top_ups": [500, 1000, 2500, 5000]},
}


def get_platform_smart_lookup_row() -> PlatformSmartLookupSettings:
    row, _ = PlatformSmartLookupSettings.objects.get_or_create(
        key="default",
        defaults={
            "enabled": True,
            "usd_to_inr": Decimal("85"),
            "gst_percent": Decimal("18"),
            "markup_bps": 0,
            "min_charge_paise": 1,
            "input_usd_per_million": Decimal("0.10"),
            "output_usd_per_million": Decimal("0.40"),
            "suggested_top_up_paise": list(DEFAULT_SUGGESTED_TOP_UPS),
            "prices_minor": dict(DEFAULT_SMART_LOOKUP_PRICES_MINOR),
        },
    )
    return row


def _smart_lookup_prices_minor(settings: PlatformSmartLookupSettings) -> dict[str, dict[str, Any]]:
    raw = getattr(settings, "prices_minor", None) or {}
    inr_raw = raw.get("INR") if isinstance(raw, dict) else None
    usd_raw = raw.get("USD") if isinstance(raw, dict) else None
    tops = settings.suggested_top_up_paise if isinstance(settings.suggested_top_up_paise, list) else []
    cleaned_inr = [int(v) for v in tops if int(v) > 0] or list(DEFAULT_SUGGESTED_TOP_UPS)
    inr = {
        "min_charge": int(
            (inr_raw or {}).get("min_charge")
            if isinstance(inr_raw, dict) and (inr_raw or {}).get("min_charge") is not None
            else settings.min_charge_paise
            or 1
        ),
        "top_ups": (
            [int(v) for v in (inr_raw or {}).get("top_ups", []) if int(v) > 0]
            if isinstance(inr_raw, dict) and isinstance((inr_raw or {}).get("top_ups"), list)
            else cleaned_inr
        )
        or cleaned_inr,
    }
    usd_defaults = DEFAULT_SMART_LOOKUP_PRICES_MINOR["USD"]
    usd = {
        "min_charge": int(
            (usd_raw or {}).get("min_charge")
            if isinstance(usd_raw, dict) and (usd_raw or {}).get("min_charge") is not None
            else usd_defaults["min_charge"]
        ),
        "top_ups": (
            [int(v) for v in (usd_raw or {}).get("top_ups", []) if int(v) > 0]
            if isinstance(usd_raw, dict) and isinstance((usd_raw or {}).get("top_ups"), list)
            else list(usd_defaults["top_ups"])
        )
        or list(usd_defaults["top_ups"]),
    }
    return {"INR": inr, "USD": usd}


def serialize_platform_smart_lookup_settings(
    row: PlatformSmartLookupSettings | None = None,
) -> dict[str, Any]:
    settings = row or get_platform_smart_lookup_row()
    prices = _smart_lookup_prices_minor(settings)
    cleaned = prices["INR"]["top_ups"]
    gst = Decimal(str(getattr(settings, "gst_percent", None) or "18"))
    return {
        "enabled": bool(settings.enabled),
        "usd_to_inr": float(settings.usd_to_inr),
        "usd_to_inr_source": str(getattr(settings, "usd_to_inr_source", "") or ""),
        "usd_to_inr_fetched_at": (
            settings.usd_to_inr_fetched_at.isoformat()
            if getattr(settings, "usd_to_inr_fetched_at", None)
            else None
        ),
        "gst_percent": float(gst),
        "markup_bps": int(settings.markup_bps),
        "markup_percent": float(Decimal(settings.markup_bps) / Decimal(100)),
        "min_charge_paise": int(prices["INR"]["min_charge"]),
        "input_usd_per_million": float(settings.input_usd_per_million),
        "output_usd_per_million": float(settings.output_usd_per_million),
        "suggested_top_up_paise": cleaned,
        "suggested_top_up_inr": [round(v / 100, 2) for v in cleaned],
        "prices_minor": prices,
        "model": GEMINI_MODEL,
    }


def smart_lookup_prices_for_currency(
    currency: str = "INR",
    *,
    row: PlatformSmartLookupSettings | None = None,
) -> dict[str, Any]:
    code = str(currency or "INR").strip().upper()
    if code not in {"INR", "USD"}:
        code = "INR"
    prices = _smart_lookup_prices_minor(row or get_platform_smart_lookup_row())
    return {"currency": code, **prices[code]}


class SmartLookupService:
    """Owner-toggled Gemini pack-photo fill with prepaid wallet (actual AI cost + optional markup)."""

    enrichment = ProductEnrichmentService()

    def ensure_settings(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        settings, _ = ShopBusinessSettings.objects.get_or_create(
            tenant=tenant,
            business=business,
            defaults={},
        )
        return settings

    def ensure_wallet(self, *, tenant: Tenant, business: Business) -> SmartLookupWallet:
        wallet, _ = SmartLookupWallet.objects.get_or_create(
            tenant=tenant,
            business=business,
            defaults={"balance_paise": 0},
        )
        return wallet

    def platform_allows(self, *, tenant: Tenant) -> bool:
        platform = get_platform_smart_lookup_row()
        if not platform.enabled:
            return False
        from apps.platform_admin.feature_flags import SMART_LOOKUP_FLAG

        return tenant_feature_enabled(tenant=tenant, key=SMART_LOOKUP_FLAG, default=True)

    def plan_allows(self, *, business: Business) -> bool:
        entitlements = EntitlementService()
        if entitlements.has_feature(
            business=business,
            feature=FEATURE_SHOPIE_SMART_LOOKUP,
            product_code=PRODUCT_SHOPIE,
        ):
            return True
        # Packages that predate migration 0027 omit shopie_smart_lookup entirely.
        # Grandfather via Products until that feature key appears on the package
        # (after backfill, admins can turn it off by removing the toggle).
        resolved = entitlements.resolve(business=business, product_code=PRODUCT_SHOPIE)
        features = set(resolved.features or [])
        if FEATURE_SHOPIE_SMART_LOOKUP in features:
            return False
        return FEATURE_SHOPIE_PRODUCTS in features

    def is_enabled(self, *, tenant: Tenant, business: Business) -> bool:
        if not self.platform_allows(tenant=tenant):
            return False
        if not self.plan_allows(business=business):
            return False
        settings = self.ensure_settings(tenant=tenant, business=business)
        return bool(settings.smart_lookup_enabled)

    def set_enabled(self, *, tenant: Tenant, business: Business, enabled: bool) -> ShopBusinessSettings:
        if enabled and not self.platform_allows(tenant=tenant):
            raise ValueError("Smart lookup is disabled by the platform.")
        if enabled and not self.plan_allows(business=business):
            raise ValueError(
                "Smart product lookup is not included in the current plan. "
                "Ask your platform admin to enable it on the package Features tab."
            )
        settings = self.ensure_settings(tenant=tenant, business=business)
        settings.smart_lookup_enabled = bool(enabled)
        settings.save(update_fields=["smart_lookup_enabled", "updated_at", "version"])
        return settings

    @transaction.atomic
    def credit_wallet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        reason: str = "top_up",
    ) -> SmartLookupWallet:
        if amount_paise <= 0:
            raise ValueError("Top-up amount must be positive.")
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        wallet = SmartLookupWallet.objects.select_for_update().get(pk=wallet.pk)
        wallet.balance_paise = int(wallet.balance_paise) + int(amount_paise)
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
        SmartLookupUsage.objects.create(
            tenant=tenant,
            business=business,
            code="",
            source="wallet_top_up",
            found=False,
            charged_paise=-int(amount_paise),  # negative = credit
            balance_after_paise=int(wallet.balance_paise),
            metadata={"reason": reason},
        )
        return wallet

    @transaction.atomic
    def clawback_wallet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        reason: str = "refund",
        metadata: dict[str, Any] | None = None,
    ) -> tuple[SmartLookupWallet, int]:
        """Debit up to amount_paise from the wallet. Returns (wallet, clawed_paise)."""
        wanted = max(0, int(amount_paise or 0))
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        wallet = SmartLookupWallet.objects.select_for_update().get(pk=wallet.pk)
        clawed = min(wanted, max(0, int(wallet.balance_paise)))
        if clawed <= 0:
            return wallet, 0
        wallet.balance_paise = int(wallet.balance_paise) - clawed
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
        meta = dict(metadata or {})
        meta.setdefault("reason", reason)
        SmartLookupUsage.objects.create(
            tenant=tenant,
            business=business,
            code="",
            source="refund_clawback",
            found=False,
            charged_paise=clawed,
            balance_after_paise=int(wallet.balance_paise),
            metadata=meta,
        )
        return wallet, clawed

    def dashboard(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        from apps.billing.services.region import saas_currency_for_business

        settings = self.ensure_settings(tenant=tenant, business=business)
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        platform = serialize_platform_smart_lookup_settings()
        currency = saas_currency_for_business(business)
        currency_prices = smart_lookup_prices_for_currency(currency)
        tops = list(currency_prices["top_ups"])
        platform_for_business = {
            **platform,
            "currency": currency,
            "min_charge_paise": int(currency_prices["min_charge"]),
            "suggested_top_up_paise": tops,
            "suggested_top_up_inr": [round(v / 100, 2) for v in tops],
            "suggested_top_up_major": [round(v / 100, 2) for v in tops],
        }
        platform_ok = self.platform_allows(tenant=tenant)
        plan_ok = self.plan_allows(business=business)
        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_qs = SmartLookupUsage.objects.filter(
            tenant=tenant, business=business, created_at__gte=month_start
        )
        free_count = month_qs.filter(charged_paise=0).exclude(source="wallet_top_up").count()
        paid_count = month_qs.filter(charged_paise__gt=0).count()
        spent_paise = int(
            month_qs.filter(charged_paise__gt=0).aggregate(total=Sum("charged_paise"))["total"] or 0
        )
        money_preview = list(
            SmartLookupUsage.objects.filter(tenant=tenant, business=business)
            .exclude(charged_paise=0)
            .order_by("-created_at", "-id")[:20]
        )
        return {
            "smart_lookup_enabled": bool(settings.smart_lookup_enabled) and platform_ok and plan_ok,
            "business_enabled": bool(settings.smart_lookup_enabled),
            "platform_enabled": platform_ok,
            "plan_enabled": plan_ok,
            "currency": currency,
            "platform": platform_for_business,
            "balance_paise": wallet.balance_paise,
            "balance_inr": wallet.balance_paise / 100,
            "balance_major": wallet.balance_paise / 100,
            "month": {
                "free_lookups": free_count,
                "paid_lookups": paid_count,
                "spent_paise": spent_paise,
                "spent_inr": spent_paise / 100,
                "spent_major": spent_paise / 100,
            },
            "recent": [serialize_usage_row(row) for row in money_preview],
        }

    def wallet_history(
        self,
        *,
        tenant: Tenant,
        business: Business,
        page: int = 1,
        page_size: int = 25,
        kind: str = "money",
        source: str = "",
        code: str = "",
        q: str = "",
        date_from: str = "",
        date_to: str = "",
        found: str | bool | None = None,
        window_days: int | None = None,
    ) -> dict[str, Any]:
        """Paginated ledger for one business with filters."""
        qs = SmartLookupUsage.objects.filter(tenant=tenant, business=business)
        qs, kind = apply_usage_ledger_filters(
            qs,
            kind=kind,
            source=source,
            code=code,
            q=q,
            date_from=date_from,
            date_to=date_to,
            found=found,
            window_days=window_days,
        )
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        payload = paginate_usage_ledger(
            qs,
            page=page,
            page_size=page_size,
            include_scope=False,
            kind=kind,
            filters={
                "kind": kind,
                "source": source or "",
                "code": code or "",
                "q": q or "",
                "date_from": date_from or "",
                "date_to": date_to or "",
                "found": found if found is not None else "",
                "window_days": window_days,
            },
        )
        payload["balance_paise"] = int(wallet.balance_paise)
        payload["balance_inr"] = int(wallet.balance_paise) / 100
        payload["business_id"] = str(business.id)
        payload["sources"] = list(
            SmartLookupUsage.objects.filter(tenant=tenant, business=business)
            .exclude(source="")
            .order_by("source")
            .values_list("source", flat=True)
            .distinct()[:100]
        )
        return payload

    @staticmethod
    def platform_wallet_history(
        *,
        page: int = 1,
        page_size: int = 25,
        kind: str = "money",
        source: str = "",
        code: str = "",
        q: str = "",
        date_from: str = "",
        date_to: str = "",
        found: str | bool | None = None,
        tenant_id: str = "",
        business_id: str = "",
        window_days: int | None = None,
    ) -> dict[str, Any]:
        """Platform-wide paginated Smart lookup ledger."""
        qs = SmartLookupUsage.all_objects.select_related("tenant", "business")
        qs, kind = apply_usage_ledger_filters(
            qs,
            kind=kind,
            source=source,
            code=code,
            q=q,
            date_from=date_from,
            date_to=date_to,
            found=found,
            tenant_id=tenant_id,
            business_id=business_id,
            window_days=window_days,
        )
        payload = paginate_usage_ledger(
            qs,
            page=page,
            page_size=page_size,
            include_scope=True,
            kind=kind,
            filters={
                "kind": kind,
                "source": source or "",
                "code": code or "",
                "q": q or "",
                "date_from": date_from or "",
                "date_to": date_to or "",
                "found": found if found is not None else "",
                "tenant_id": tenant_id or "",
                "business_id": business_id or "",
                "window_days": window_days,
            },
        )
        sources = list(
            SmartLookupUsage.all_objects.exclude(source="")
            .order_by("source")
            .values_list("source", flat=True)
            .distinct()[:100]
        )
        payload["sources"] = sources
        return payload

    def record_free_lookup(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str,
        source: str,
        found: bool,
    ) -> None:
        SmartLookupUsage.objects.create(
            tenant=tenant,
            business=business,
            code=code or "",
            source=source or "catalog",
            found=found,
            charged_paise=0,
        )

    @transaction.atomic
    def vision_enrich(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str = "",
        image_url: str = "",
        hint: str = "",
    ) -> dict[str, Any]:
        """Run Gemini (vision and/or text) and debit the wallet at configured cost."""
        return self.smart_enrich(
            tenant=tenant,
            business=business,
            code=code,
            image_url=image_url,
            hint=hint,
        )

    @transaction.atomic
    def smart_enrich(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str = "",
        image_url: str = "",
        hint: str = "",
    ) -> dict[str, Any]:
        """Smart product lookup: pack-photo vision when image given, else barcode/name text."""
        code = (code or "").strip()
        image_url = (image_url or "").strip()
        hint = (hint or "").strip()
        mode = "vision" if image_url else "text"

        if not self.platform_allows(tenant=tenant):
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_platform_disabled",
                "needs_pack_photo": False,
                "message": "Smart lookup is temporarily unavailable. Fill details manually.",
                "confidence": "none",
            }
        if not self.plan_allows(business=business):
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_plan_disabled",
                "needs_pack_photo": False,
                "message": "Smart lookup is not on your plan. Ask your platform admin to enable Smart product lookup, or fill details manually.",
                "confidence": "none",
            }
        if not self.is_enabled(tenant=tenant, business=business):
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_disabled",
                "needs_pack_photo": False,
                "message": "Smart lookup is off. Enable it under Products & billing, or fill details manually.",
                "confidence": "none",
            }
        if mode == "text" and not code and not hint:
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_needs_input",
                "needs_pack_photo": True,
                "message": "Provide a barcode, product name, or pack photo for Smart lookup.",
                "confidence": "none",
            }

        from apps.billing.services.region import saas_currency_for_business

        platform = get_platform_smart_lookup_row()
        saas_currency = saas_currency_for_business(business)
        currency_prices = smart_lookup_prices_for_currency(saas_currency, row=platform)
        min_debit = max(1, int(currency_prices["min_charge"] or 1))
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        if wallet.balance_paise < min_debit:
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_no_balance",
                "needs_pack_photo": mode == "text",
                "message": "Add wallet balance to use Smart lookup, or fill details manually.",
                "confidence": "none",
            }

        api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
        if not api_key:
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_unconfigured",
                "needs_pack_photo": True,
                "message": "Smart lookup is not configured on the server yet. Fill details manually.",
                "confidence": "none",
            }

        from apps.shopie.services.gemini_billing import add_usage, empty_usage, settle_gemini_usage

        pending_usage = empty_usage()
        lookup_hint = hint
        expanded_from = ""

        # Name-only: cheap expand of abbreviated invoice text → free catalog retry
        # before a full product Smart lookup.
        if mode == "text" and hint and not code:
            expand = self._expand_abbreviated_name(api_key=api_key, query=hint)
            add_usage(pending_usage, expand.get("usage"))
            if expand.get("ok"):
                expanded = str((expand.get("data") or {}).get("name") or "").strip()[:200]
                if expanded and expanded.lower() != hint.lower():
                    lookup_hint = expanded
                    expanded_from = hint
                    free = self.enrichment.enrich(query=lookup_hint)
                    expand_data = expand.get("data") if isinstance(expand.get("data"), dict) else {}
                    catalog_ok = bool(
                        free.get("found") and self.enrichment.catalog_agrees_with_query(free, lookup_hint)
                    )
                    brand = str(expand_data.get("brand") or free.get("brand") or "").strip()[:120]
                    image_url = self._plausible_remote_image_url(str(expand_data.get("image_url") or ""))
                    web_code = self._plausible_web_barcode(str(expand_data.get("code") or ""))
                    needs_listing = (not image_url and not (catalog_ok and (free.get("image_url") or free.get("front_image_url")))) or (
                        not web_code and not (catalog_ok and free.get("code"))
                    )
                    # Free catalogs rarely have Indian Pedigree trade SKUs — fetch retailer photo/GTIN.
                    if needs_listing:
                        listing = self._find_retail_listing(api_key=api_key, name=lookup_hint, brand=brand)
                        add_usage(pending_usage, listing.get("usage"))
                        if not image_url:
                            image_url = self._plausible_remote_image_url(str(listing.get("image_url") or ""))
                        if not web_code:
                            web_code = self._plausible_web_barcode(str(listing.get("code") or ""))

                    # If web found a GTIN, prefer barcode enrich when brand agrees; else keep digits only.
                    code_enrich: dict[str, Any] | None = None
                    if web_code and not (catalog_ok and free.get("code")):
                        by_code = self.enrichment.enrich(code=web_code)
                        if by_code.get("found") and self.enrichment.catalog_agrees_with_query(
                            by_code, f"{brand} {lookup_hint}".strip()
                        ):
                            code_enrich = by_code

                    resolved_code = ""
                    if catalog_ok and free.get("code"):
                        resolved_code = self.enrichment._normalize_code(str(free.get("code") or ""))
                    elif code_enrich and code_enrich.get("code"):
                        resolved_code = self.enrichment._normalize_code(str(code_enrich.get("code") or ""))
                    elif web_code:
                        resolved_code = web_code

                    if catalog_ok or expanded:
                        settled = settle_gemini_usage(
                            tenant=tenant,
                            business=business,
                            source="gemini_name_expand",
                            found=True,
                            code=resolved_code,
                            input_tokens=int(pending_usage.get("input_tokens") or 0),
                            output_tokens=int(pending_usage.get("output_tokens") or 0),
                            model=GEMINI_MODEL,
                            metadata={
                                "mode": "name_expand",
                                "hint": hint[:200],
                                "expanded_name": lookup_hint[:200],
                                "catalog_source": str(free.get("source") or "") if catalog_ok else "",
                                "catalog_rejected": not catalog_ok,
                                "has_image": bool(image_url)
                                or bool(catalog_ok and (free.get("image_url") or free.get("front_image_url"))),
                                "has_code": bool(resolved_code),
                            },
                        )
                        charged_paise = int(settled["charged_paise"])
                        charge_note = f" {settled['message']}" if settled["message"] else " No wallet charge."
                        if catalog_ok:
                            free["source"] = "gemini_name_expand"
                            free["charged_paise"] = charged_paise
                            free["expanded_from"] = expanded_from
                            free["expanded_name"] = lookup_hint
                            # Prefer expanded retail title; keep catalog photo/code.
                            free["name"] = lookup_hint
                            if brand and not free.get("brand"):
                                free["brand"] = brand
                            if resolved_code:
                                free["code"] = resolved_code
                                free["sku"] = free.get("sku") or resolved_code
                            if image_url and not (free.get("image_url") or free.get("front_image_url")):
                                free = self._attach_expand_image(free, image_url)
                            free["confidence"] = free.get("confidence") or "medium"
                            free["needs_pack_photo"] = bool(
                                free.get("needs_pack_photo")
                                and not (free.get("image_url") or free.get("front_image_url"))
                            )
                            free["message"] = (
                                f"Matched catalog after Smart expanded the invoice name.{charge_note} "
                                "Review carefully, then save."
                            )
                            return ProductEnrichmentService.with_user_message(free)

                        # Expanded name is usable, but free name-search disagreed / mismatched brand.
                        result = {
                            "found": True,
                            "code": resolved_code,
                            "sku": resolved_code,
                            "source": "gemini_name_expand",
                            "name": lookup_hint,
                            "brand": brand,
                            "pack_size": str(expand_data.get("pack_size") or "").strip()[:80],
                            "description": "",
                            "details_html": "",
                            "categories": "",
                            "category_label": "",
                            "image_url": "",
                            "front_image_url": "",
                            "back_image_url": "",
                            "local_image_url": "",
                            "images": {"front": "", "back": "", "gallery": []},
                            "confidence": "low",
                            "needs_pack_photo": True,
                            "charged_paise": charged_paise,
                            "expanded_from": expanded_from,
                            "expanded_name": lookup_hint,
                            "message": "",
                        }
                        if code_enrich:
                            # Trusted GTIN catalog row — merge extras without replacing expanded title.
                            for key in ("pack_size", "description", "categories", "category_label", "hsn_sac", "mrp"):
                                if code_enrich.get(key) and not result.get(key):
                                    result[key] = code_enrich.get(key)
                            if code_enrich.get("image_url") or code_enrich.get("front_image_url"):
                                result = self._attach_expand_image(
                                    result,
                                    str(code_enrich.get("front_image_url") or code_enrich.get("image_url") or ""),
                                )
                        result = self._attach_expand_image(result, image_url)
                        bits = ["Expanded invoice name via Smart"]
                        if result.get("image_url"):
                            bits.append("pack photo")
                        if resolved_code:
                            bits.append("barcode")
                        if len(bits) == 1:
                            result["message"] = (
                                f"{bits[0]} (no trusted catalog/photo/barcode match)."
                                f"{charge_note} Add a barcode or pack photo if needed."
                            )
                        else:
                            result["message"] = (
                                f"{bits[0]} and filled {' + '.join(bits[1:])} from the web."
                                f"{charge_note} Review carefully, then save."
                            )
                        result = self.enrichment._attach_category(result)
                        return ProductEnrichmentService.with_user_message(result)

        vision = self._call_gemini(api_key=api_key, image_url=image_url, code=code, hint=lookup_hint)
        source_ok = "gemini_vision" if mode == "vision" else "gemini_text"
        source_err = "gemini_vision_error" if mode == "vision" else "gemini_text_error"
        add_usage(pending_usage, vision.get("usage"))
        input_tokens = int(pending_usage.get("input_tokens") or 0)
        output_tokens = int(pending_usage.get("output_tokens") or 0)
        if not vision.get("ok"):
            settled = settle_gemini_usage(
                tenant=tenant,
                business=business,
                source=source_err,
                found=False,
                code=code or "",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=GEMINI_MODEL,
                metadata={
                    "error": vision.get("error") or "failed",
                    "mode": mode,
                    "hint": lookup_hint[:200],
                    "expanded_from": expanded_from[:200],
                },
            )
            message = vision.get("error") or (
                "Could not read the pack photo. Try again or fill manually."
                if mode == "vision"
                else "Smart lookup could not identify this product. Try a pack photo or fill manually."
            )
            if settled["message"]:
                message = f"{message} {settled['message']}"
            return {
                "found": False,
                "code": code,
                "source": source_ok,
                "needs_pack_photo": mode == "text",
                "charged_paise": settled["charged_paise"],
                "message": message,
                "confidence": "none",
            }

        data = vision.get("data") or {}
        found = bool(data.get("name") or data.get("brand"))

        result = {
            "found": found,
            "code": self.enrichment._normalize_code(str(data.get("code") or code or "")),
            "source": source_ok,
            "sku": self.enrichment._normalize_code(str(data.get("code") or code or "")),
            "name": str(data.get("name") or "").strip()[:200],
            "brand": str(data.get("brand") or "").strip()[:120],
            "pack_size": str(data.get("pack_size") or "").strip()[:80],
            "serving_size": str(data.get("serving_size") or "").strip()[:80],
            "description": str(data.get("description") or data.get("ingredients") or "").strip()[:2000],
            "details_html": "",
            "categories": str(data.get("categories") or data.get("category") or "").strip()[:500],
            "category_label": str(data.get("category") or data.get("categories") or "").strip()[:120],
            "hsn_sac": str(data.get("hsn_sac") or data.get("hsn") or "").strip()[:16],
            "gst_rate": str(data.get("gst_rate") or "0"),
            "mrp": str(data.get("mrp") or data.get("price") or "0"),
            "image_url": image_url,
            "front_image_url": image_url,
            "back_image_url": "",
            "local_image_url": image_url,
            "images": {"front": image_url, "back": "", "gallery": [image_url] if image_url else []},
            "confidence": "medium" if mode == "vision" else "low",
            "needs_pack_photo": False,
            "charged_paise": 0,
            "message": "",
        }
        settled = settle_gemini_usage(
            tenant=tenant,
            business=business,
            source=source_ok,
            found=found,
            code=str(result.get("code") or code or ""),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=GEMINI_MODEL,
            metadata={
                "image_url": image_url,
                "mode": mode,
                "hint": lookup_hint[:200],
                "expanded_from": expanded_from[:200],
            },
        )
        charged_paise = int(settled["charged_paise"])
        result["charged_paise"] = charged_paise
        if expanded_from:
            result["expanded_from"] = expanded_from
            result["expanded_name"] = lookup_hint
        charge_note = f" {settled['message']}" if settled["message"] else " No wallet charge."
        if result["found"]:
            # Vision reads the pack — safe to cache in platform GTIN.
            # Text-only Gemini guesses must NOT poison the shared catalog.
            if mode == "vision":
                result = self.enrichment.upsert_from_vision(result)
                result["message"] = (
                    f"Filled from pack photo.{charge_note} Review carefully, then save."
                )
            else:
                result = self.enrichment._attach_category(result)
                result["needs_pack_photo"] = True
                result["message"] = (
                    f"Possible match from Smart lookup (not verified).{charge_note} "
                    "Review carefully, or capture a pack photo to confirm and save to catalog."
                )
        else:
            result["needs_pack_photo"] = True
            # Charge already applied above — still tell the owner.
            result["message"] = (
                f"Pack photo saved, but we could not read the label clearly.{charge_note}"
                if mode == "vision"
                else (
                    f"Smart lookup could not identify this product.{charge_note} "
                    "Take a pack photo or enter details manually."
                )
            )

        return ProductEnrichmentService.with_user_message(result)

    @transaction.atomic
    def invoice_vision(
        self,
        *,
        tenant: Tenant,
        business: Business,
        image_urls: list[str],
    ) -> dict[str, Any]:
        """Extract a supplier invoice with Gemini and debit the Smart Lookup wallet."""
        urls = [str(url or "").strip() for url in image_urls if str(url or "").strip()]
        if not urls:
            return {
                "ok": False,
                "source": "smart_lookup_unconfigured",
                "message": "Add a photo of the supplier invoice.",
                "charged_paise": 0,
            }

        from apps.billing.services.region import saas_currency_for_business
        from apps.platform_admin.feature_flags import INVOICE_SCAN_FLAG

        if not tenant_feature_enabled(tenant=tenant, key=INVOICE_SCAN_FLAG, default=True):
            return {
                "ok": False,
                "source": "invoice_scan_disabled",
                "message": "Invoice scan is turned off for this workspace.",
                "charged_paise": 0,
            }
        platform = get_platform_smart_lookup_row()
        if not platform.enabled:
            return {
                "ok": False,
                "source": "smart_lookup_platform_disabled",
                "message": "AI wallet lookups are temporarily unavailable.",
                "charged_paise": 0,
            }
        saas_currency = saas_currency_for_business(business)
        currency_prices = smart_lookup_prices_for_currency(saas_currency, row=platform)
        min_debit = max(1, int(currency_prices["min_charge"] or 1))
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        if wallet.balance_paise < min_debit:
            return {
                "ok": False,
                "source": "smart_lookup_no_balance",
                "message": "Add wallet balance to scan an invoice, then try again.",
                "charged_paise": 0,
                "balance_after_paise": int(wallet.balance_paise),
            }
        api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
        if not api_key:
            return {
                "ok": False,
                "source": "smart_lookup_unconfigured",
                "message": "Invoice scan is not configured on the server yet.",
                "charged_paise": 0,
            }

        from apps.shopie.services.gemini_billing import settle_gemini_usage

        vision = self._call_invoice_gemini(api_key=api_key, image_urls=urls)
        usage = vision.get("usage") or {}
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        if not vision.get("ok"):
            settled = settle_gemini_usage(
                tenant=tenant,
                business=business,
                source="gemini_invoice_error",
                found=False,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=GEMINI_MODEL,
                metadata={
                    "kind": "invoice_scan",
                    "error": vision.get("error") or "failed",
                    "image_count": len(urls),
                },
            )
            message = vision.get("error") or "Could not read that invoice photo. Try a clearer shot."
            if settled["message"]:
                message = f"{message} {settled['message']}"
            return {
                "ok": False,
                "source": "gemini_invoice_error",
                "message": message,
                "charged_paise": settled["charged_paise"],
                "balance_after_paise": settled["balance_after_paise"],
                "charge_currency": settled["charge_currency"],
            }

        data = vision.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        invoice_number = str(data.get("invoice_number") or "").strip()[:64]
        supplier_name = str(data.get("supplier_name") or "").strip()[:160]
        lines = data.get("lines") if isinstance(data.get("lines"), list) else []
        settled = settle_gemini_usage(
            tenant=tenant,
            business=business,
            source="gemini_invoice",
            found=bool(lines or invoice_number or supplier_name),
            code=invoice_number,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=GEMINI_MODEL,
            metadata={
                "kind": "invoice_scan",
                "invoice_number": invoice_number,
                "supplier_name": supplier_name,
                "line_count": len(lines),
                "image_count": len(urls),
                "image_urls": urls[:8],
            },
        )
        charged_paise = int(settled["charged_paise"])
        return {
            "ok": True,
            "source": "gemini_invoice",
            "data": data,
            "charged_paise": charged_paise,
            "balance_after_paise": settled["balance_after_paise"],
            "charge_currency": settled["charge_currency"],
            "usage_id": settled["usage_id"],
            "message": (
                settled["message"] or "No AI wallet charge for this invoice scan."
            ),
        }

    def _call_invoice_gemini(self, *, api_key: str, image_urls: list[str]) -> dict[str, Any]:
        prompt = (
            "Extract a GST supplier invoice / tax invoice / purchase bill from these photos. "
            "Return ONLY compact JSON with keys: "
            "supplier_name, gstin, phone, invoice_number, invoice_date, place_of_supply, "
            "taxable, cgst, sgst, igst, grand_total, "
            "lines (array of objects with name, barcode, sku, brand, pack_size, hsn_sac, qty, rate, mrp, discount, gst_rate, line_total). "
            "Dates as YYYY-MM-DD when possible. Use empty strings when unknown. "
            "qty, rate, mrp, discount, gst_rate, and money fields as numeric strings. "
            "rate is the billed unit cost (Rate / Price / Taxable per unit). "
            "mrp is the printed MRP / RSP / MR.P / Max Retail Price on that line or pack. "
            "Never copy rate into mrp. Leave mrp empty if the bill has no MRP. "
            "Do not invent products that are not on the bill."
        )
        parts: list[dict[str, Any]] = [{"text": prompt}]
        attached = 0
        for image_url in image_urls[:6]:
            image_bytes = self._download_image(image_url)
            if not image_bytes:
                continue
            parts.append(
                {
                    "inline_data": {
                        "mime_type": self._image_mime(image_url, image_bytes),
                        "data": base64.b64encode(image_bytes).decode("ascii"),
                    }
                }
            )
            attached += 1
        if attached == 0:
            return {
                "ok": False,
                "error": "Could not open that invoice photo. Upload it again and retry.",
            }
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        }
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        try:
            request = urllib.request.Request(
                endpoint,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "IE-Orbit-ShopIE/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            logger.info("Gemini invoice scan HTTP %s", exc.code)
            return {"ok": False, "error": "Could not read that invoice photo. Try a clearer shot."}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
            logger.info("Gemini invoice scan failed: %s", exc)
            return {"ok": False, "error": "Could not reach the AI service. Try again."}
        from apps.shopie.services.gemini_billing import usage_from_gemini_payload

        if not payload.get("candidates"):
            return {
                "ok": False,
                "error": "Could not read that invoice photo. Try a clearer shot.",
                "usage": usage_from_gemini_payload(payload),
            }
        parsed = self._parse_gemini_payload(payload)
        if not parsed.get("ok"):
            return {
                "ok": False,
                "error": parsed.get("error") or "Could not parse the invoice.",
                "usage": parsed.get("usage") or {},
            }
        data = parsed.get("data") or {}
        lines = data.get("lines") if isinstance(data.get("lines"), list) else []
        has_header = any(
            str(data.get(key) or "").strip()
            for key in ("supplier_name", "invoice_number", "gstin", "grand_total")
        )
        if not lines and not has_header:
            return {
                "ok": False,
                "error": "Could not read that invoice photo. Try a clearer shot of the full bill.",
                "usage": parsed.get("usage") or {},
            }
        return parsed

    def _cost_paise(
        self,
        input_tokens: int,
        output_tokens: int,
        *,
        platform: PlatformSmartLookupSettings | None = None,
        currency: str = "INR",
    ) -> tuple[int, int]:
        from apps.shopie.services.gemini_billing import quote_gemini_minor

        return quote_gemini_minor(
            input_tokens,
            output_tokens,
            platform=platform,
            currency=currency,
        )

    def _expand_abbreviated_name(self, *, api_key: str, query: str) -> dict[str, Any]:
        """Expand abbreviated invoice / OCR product text to a full retail title."""
        query = (query or "").strip()
        if not query:
            return {"ok": False, "error": "empty", "usage": {"input_tokens": 0, "output_tokens": 0}}

        from apps.shopie.services.gemini_billing import add_usage, empty_usage, usage_from_gemini_payload

        prompt = (
            "This is an abbreviated product name from an Indian supplier invoice (trade "
            "shortenings, glued SKUs, OCR quirks). Expand it to the most likely full retail "
            "product title sold in India. Use web search when available. "
            "Preserve distinctive invoice tokens when listings support them: brand (PED→Pedigree), "
            "line codes (STR may be STAR or Starter — prefer the title that appears on Indian "
            "listings with the same RP/SKU), M & P, pack (6x3kg vs 63 kg), and RP/SKU numbers. "
            "Do not invent a different brand. "
            "Also set image_url to a direct https URL of the product pack front photo from an "
            "Indian retailer or brand CDN (amazon.in, flipkart, brand site). Prefer a real "
            ".jpg/.png/.webp image URL, not a search-results page. Leave image_url empty if none. "
            "Also set code to the product EAN/UPC/GTIN barcode digits from the listing when shown "
            "(usually 8, 12, 13, or 14 digits). Leave code empty if unknown — never invent a barcode. "
            "Return ONLY compact JSON with keys: name, brand, pack_size, image_url, code, confidence. "
            "If you cannot expand confidently, set name to the original invoice text. "
            f"Invoice name: {query}"
        )
        parts = [{"text": prompt}]
        attempts: list[dict[str, Any]] = []
        if GEMINI_TEXT_USE_SEARCH:
            attempts.append(
                {
                    "contents": [{"role": "user", "parts": parts}],
                    "tools": [{"google_search": {}}],
                    "generationConfig": {"temperature": 0.1},
                }
            )
        attempts.append(
            {
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            }
        )

        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        total_usage = empty_usage()
        last_error: dict[str, Any] | None = None
        for body in attempts:
            try:
                request = urllib.request.Request(
                    endpoint,
                    data=json.dumps(body).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "IE-Orbit-ShopIE/1.0"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=25 if body.get("tools") else 15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                logger.info("Gemini name expand HTTP %s", exc.code)
                last_error = {"ok": False, "error": "expand_http"}
                continue
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
                logger.info("Gemini name expand failed: %s", exc)
                last_error = {"ok": False, "error": "expand_failed"}
                continue

            add_usage(total_usage, usage_from_gemini_payload(payload))
            if not payload.get("candidates"):
                continue
            parsed = self._parse_gemini_payload(payload)
            if not parsed.get("ok"):
                last_error = parsed
                continue
            data = parsed.get("data") or {}
            for key, value in list(data.items()):
                if value is None:
                    data[key] = ""
            name = str(data.get("name") or "").strip()
            if not name:
                data["name"] = query
            image = self._plausible_remote_image_url(str(data.get("image_url") or ""))
            if not image:
                image = self._image_url_from_gemini_payload(payload)
            data["image_url"] = image or ""
            data["code"] = self._plausible_web_barcode(
                str(data.get("code") or data.get("barcode") or data.get("ean") or data.get("gtin") or "")
            )
            if not data["code"]:
                data["code"] = self._barcode_from_gemini_payload(payload)
            return {"ok": True, "data": data, "usage": dict(total_usage), "raw_payload": payload}

        failed = dict(last_error or {"ok": False, "error": "expand_failed"})
        failed["usage"] = dict(total_usage)
        return failed

    def _find_pack_image_url(self, *, api_key: str, name: str, brand: str = "") -> dict[str, Any]:
        """Web-search pack photo + GTIN for an expanded retail title."""
        listing = self._find_retail_listing(api_key=api_key, name=name, brand=brand)
        return {
            "ok": bool(listing.get("image_url") or listing.get("code")),
            "image_url": str(listing.get("image_url") or ""),
            "code": str(listing.get("code") or ""),
            "usage": listing.get("usage") or {"input_tokens": 0, "output_tokens": 0},
        }

    def _find_retail_listing(self, *, api_key: str, name: str, brand: str = "") -> dict[str, Any]:
        """Web-search pack front image URL and EAN/GTIN for an expanded retail title."""
        name = (name or "").strip()
        brand = (brand or "").strip()
        empty = {"ok": False, "image_url": "", "code": "", "usage": {"input_tokens": 0, "output_tokens": 0}}
        if not name:
            return empty

        from apps.shopie.services.gemini_billing import add_usage, empty_usage, usage_from_gemini_payload

        prompt = (
            "Find this retail product sold in India on Amazon.in, Flipkart, or the brand site. "
            "Return ONLY compact JSON with keys: image_url, code, source_page. "
            "image_url = direct https pack-front photo (.jpg/.png/.webp or retailer CDN). "
            "code = EAN/UPC/GTIN barcode digits from the listing (8/12/13/14 digits) when shown. "
            "Leave fields empty when unknown. Never invent image_url or code. "
            f"Brand: {brand or 'unknown'}. Product: {name}."
        )
        parts = [{"text": prompt}]
        attempts: list[dict[str, Any]] = []
        if GEMINI_TEXT_USE_SEARCH:
            attempts.append(
                {
                    "contents": [{"role": "user", "parts": parts}],
                    "tools": [{"google_search": {}}],
                    "generationConfig": {"temperature": 0.1},
                }
            )
        attempts.append(
            {
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            }
        )
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        total_usage = empty_usage()
        best_image = ""
        best_code = ""
        for body in attempts:
            try:
                request = urllib.request.Request(
                    endpoint,
                    data=json.dumps(body).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "IE-Orbit-ShopIE/1.0"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=25 if body.get("tools") else 15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
                logger.info("Gemini retail listing lookup failed: %s", exc)
                continue
            add_usage(total_usage, usage_from_gemini_payload(payload))
            if not payload.get("candidates"):
                continue
            parsed = self._parse_gemini_payload(payload)
            data = parsed.get("data") if parsed.get("ok") else {}
            image = self._plausible_remote_image_url(str((data or {}).get("image_url") or ""))
            if not image:
                image = self._image_url_from_gemini_payload(payload)
            code = self._plausible_web_barcode(
                str((data or {}).get("code") or (data or {}).get("barcode") or (data or {}).get("ean") or "")
            )
            if not code:
                code = self._barcode_from_gemini_payload(payload)
            if image and not best_image:
                best_image = image
            if code and not best_code:
                best_code = code
            if best_image and best_code:
                break
        return {
            "ok": bool(best_image or best_code),
            "image_url": best_image,
            "code": best_code,
            "usage": dict(total_usage),
        }

    def _plausible_web_barcode(self, value: str) -> str:
        digits = "".join(ch for ch in (value or "") if ch.isdigit())
        if self.enrichment.is_plausible_barcode(digits):
            return self.enrichment._normalize_code(digits)
        return ""

    def _barcode_from_gemini_payload(self, payload: dict[str, Any]) -> str:
        text = ""
        for candidate in payload.get("candidates") or []:
            content = candidate.get("content") or {}
            for part in content.get("parts") or []:
                if part.get("text"):
                    text += str(part["text"])
            metadata = candidate.get("groundingMetadata") or {}
            for chunk in metadata.get("groundingChunks") or []:
                web = chunk.get("web") if isinstance(chunk, dict) else None
                if isinstance(web, dict):
                    text += " " + str(web.get("title") or "") + " " + str(web.get("uri") or "")
        from apps.shopie.services.enrichment import BARCODE_RE

        for candidate in BARCODE_RE.findall(text):
            code = self._plausible_web_barcode(candidate)
            if code:
                return code
        return ""

    @staticmethod
    def _plausible_remote_image_url(url: str) -> str:
        value = (url or "").strip()
        if not value.startswith("https://"):
            return ""
        lowered = value.lower()
        if any(bad in lowered for bad in ("google.com/search", "bing.com/search", "yahoo.com/search")):
            return ""
        path = urllib_parse.urlparse(value).path.lower()
        if path.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
            return value.split("?", 1)[0] if "?" in value and "images" in lowered else value
        # Common retailer / CDN hosts often omit extensions in signed URLs.
        host = urllib_parse.urlparse(value).netloc.lower()
        if any(
            token in host
            for token in (
                "amazon",
                "flipkart",
                "fkapi",
                "cloudfront",
                "shopify",
                "pedigree",
                "mars",
                "openfoodfacts",
                "openpetfoodfacts",
                "walmart",
                "media-amazon",
            )
        ):
            return value
        return ""

    @classmethod
    def _image_url_from_gemini_payload(cls, payload: dict[str, Any]) -> str:
        """Best-effort pack image from Google Search grounding metadata."""
        for candidate in payload.get("candidates") or []:
            metadata = candidate.get("groundingMetadata") or {}
            for chunk in metadata.get("groundingChunks") or []:
                web = chunk.get("web") if isinstance(chunk, dict) else None
                if not isinstance(web, dict):
                    continue
                for key in ("uri", "url", "imageUrl", "image_url"):
                    image = cls._plausible_remote_image_url(str(web.get(key) or ""))
                    if image:
                        return image
            for query in metadata.get("retrievalQueries") or []:
                del query  # queries are text only
            for support in metadata.get("groundingSupports") or []:
                del support
        # Fallback: scan response text for https image-looking URLs.
        text = ""
        for candidate in payload.get("candidates") or []:
            content = candidate.get("content") or {}
            for part in content.get("parts") or []:
                if part.get("text"):
                    text += str(part["text"])
        for match in re.findall(r"https://[^\s\"'<>]+", text):
            image = cls._plausible_remote_image_url(match.rstrip(").,]}"))
            if image:
                return image
        return ""

    def _attach_expand_image(self, result: dict[str, Any], image_url: str) -> dict[str, Any]:
        image = self._plausible_remote_image_url(image_url)
        if not image:
            return result
        gallery = result.get("images") if isinstance(result.get("images"), dict) else {}
        return {
            **result,
            "image_url": image,
            "front_image_url": image,
            "local_image_url": result.get("local_image_url") or "",
            "images": {
                "front": image,
                "back": str(gallery.get("back") or ""),
                "gallery": [image],
            },
            "needs_pack_photo": False,
        }

    def _call_gemini(
        self,
        *,
        api_key: str,
        image_url: str,
        code: str,
        hint: str,
    ) -> dict[str, Any]:
        image_url = (image_url or "").strip()
        code = (code or "").strip()
        hint = (hint or "").strip()
        if image_url:
            prompts = [
                (
                    "Extract retail product details from this packaging photo. "
                    "Return ONLY compact JSON with keys: "
                    "code, name, brand, pack_size, serving_size, description, ingredients, "
                    "category, categories, hsn_sac, gst_rate, mrp. "
                    f"Barcode hint: {code or 'unknown'}. Extra hint: {hint or 'none'}."
                )
            ]
        elif code:
            prompts = [
                (
                    "Look up the exact retail product for this barcode GTIN (and optional name hint). "
                    "Use web search when available. Search Go-UPC, Open Food Facts, manufacturer and "
                    "retail listings for THIS exact GTIN. Fill name and brand when any listing "
                    "confirms the code — do not invent a nearby barcode. If no listing exists, leave "
                    "name and brand empty. "
                    "Return ONLY compact JSON with keys: "
                    "code, name, brand, pack_size, serving_size, description, ingredients, "
                    "category, categories, hsn_sac, gst_rate, mrp. "
                    f"Barcode: {code}. Name/query: {hint or 'none'}."
                ),
                (
                    f"Web-search barcode/EAN/GTIN {code}. "
                    "Return the product title and brand from the best exact-code match "
                    "(Go-UPC, retailer, or brand site). Optional hint: "
                    f"{hint or 'none'}. "
                    "Return ONLY compact JSON with keys: "
                    "code, name, brand, pack_size, serving_size, description, ingredients, "
                    "category, categories, hsn_sac, gst_rate, mrp. "
                    "Use empty strings when unknown — never guess a different GTIN."
                ),
            ]
        else:
            # Name-only Smart lookup (abbreviated invoice lines, typed search).
            prompts = [
                (
                    "Look up the retail product that best matches this product name from a supplier "
                    "invoice or shop search. The text may be abbreviated (e.g. STR for STAR, glued "
                    "SKU codes like RP1520). Use web search when available — prefer Indian retail / "
                    "brand listings. Return the full product title, brand, and pack size. "
                    "Do not invent a barcode; leave code empty unless a listing clearly shows one. "
                    "Return ONLY compact JSON with keys: "
                    "code, name, brand, pack_size, serving_size, description, ingredients, "
                    "category, categories, hsn_sac, gst_rate, mrp. "
                    f"Product name/query: {hint or 'none'}."
                ),
                (
                    f"Web-search this retail product name and return the best matching listing title: "
                    f"{hint or 'none'}. "
                    "Expand common invoice abbreviations. "
                    "Return ONLY compact JSON with keys: "
                    "code, name, brand, pack_size, serving_size, description, ingredients, "
                    "category, categories, hsn_sac, gst_rate, mrp. "
                    "Use empty strings when unknown."
                ),
            ]

        from apps.shopie.services.gemini_billing import add_usage, empty_usage, usage_from_gemini_payload

        use_search = bool(GEMINI_TEXT_USE_SEARCH and not image_url)
        attempts: list[dict[str, Any]] = []
        total_usage = empty_usage()
        for prompt in prompts:
            parts: list[dict[str, Any]] = [{"text": prompt}]
            if image_url:
                image_bytes = self._download_image(image_url)
                if image_bytes:
                    mime = "image/jpeg"
                    if image_url.lower().endswith(".png"):
                        mime = "image/png"
                    parts.append(
                        {
                            "inline_data": {
                                "mime_type": mime,
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        }
                    )
                else:
                    parts.append({"text": f"Image URL (fetch if possible): {image_url}"})
            if use_search:
                attempts.append(
                    {
                        "contents": [{"role": "user", "parts": parts}],
                        "tools": [{"google_search": {}}],
                        "generationConfig": {"temperature": 0.1},
                    }
                )
            attempts.append(
                {
                    "contents": [{"role": "user", "parts": parts}],
                    "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
                }
            )

        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        last_error: dict[str, Any] | None = None
        last_empty: dict[str, Any] | None = None
        for body in attempts:
            try:
                request = urllib.request.Request(
                    endpoint,
                    data=json.dumps(body).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "IE-Orbit-ShopIE/1.0"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=35 if body.get("tools") else 20) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    err_body = json.loads(exc.read().decode("utf-8", errors="replace"))
                    detail = str((err_body.get("error") or {}).get("message") or "")
                except Exception:
                    detail = str(exc)
                logger.info("Gemini smart lookup HTTP %s: %s", exc.code, detail[:300])
                if exc.code == 404:
                    return {
                        "ok": False,
                        "error": (
                            "Smart lookup model is unavailable. "
                            "Ask your platform admin to update GEMINI_MODEL, then try again."
                        ),
                    }
                if exc.code in {401, 403}:
                    return {
                        "ok": False,
                        "error": "Smart lookup API key was rejected. Check GEMINI_API_KEY on the server.",
                    }
                last_error = {
                    "ok": False,
                    "error": "Smart lookup could not reach the AI service. Try again, or capture a pack photo.",
                }
                continue
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError, OSError) as exc:
                logger.info("Gemini smart lookup failed: %s", exc)
                last_error = {
                    "ok": False,
                    "error": (
                        "Smart lookup could not reach the AI service. "
                        "Try again, or capture a pack photo."
                    ),
                }
                continue

            add_usage(total_usage, usage_from_gemini_payload(payload))
            if not payload.get("candidates"):
                logger.info("Gemini smart lookup returned no candidates; trying next attempt.")
                continue

            parsed = self._parse_gemini_payload(payload)
            if not parsed.get("ok"):
                last_error = parsed
                continue
            data = parsed.get("data") or {}
            # Normalize nulls from grounded JSON.
            for key, value in list(data.items()):
                if value is None:
                    data[key] = ""
            has_identity = bool(str(data.get("name") or "").strip() or str(data.get("brand") or "").strip())
            if has_identity or image_url:
                return {"ok": True, "data": data, "usage": dict(total_usage)}
            # Text lookup with empty identity — try next prompt/tool combo instead of stopping.
            last_empty = {"ok": True, "data": data, "usage": dict(total_usage)}
            logger.info("Gemini smart lookup returned empty identity; trying next attempt.")

        if last_empty:
            last_empty["usage"] = dict(total_usage)
            return last_empty
        if last_error:
            failed = dict(last_error)
            failed["usage"] = dict(total_usage)
            return failed
        return {
            "ok": False,
            "error": "Smart lookup could not reach the AI service. Try again, or capture a pack photo.",
            "usage": dict(total_usage),
        }

    def _parse_gemini_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = ""
        for candidate in payload.get("candidates") or []:
            content = candidate.get("content") or {}
            for part in content.get("parts") or []:
                if part.get("text"):
                    text += str(part["text"])
        from apps.shopie.services.gemini_billing import usage_from_gemini_payload

        usage = usage_from_gemini_payload(payload)
        try:
            data = json.loads(text) if text else {}
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    data = json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    return {"ok": False, "error": "Could not parse product details.", "usage": usage}
            else:
                return {"ok": False, "error": "Could not parse product details.", "usage": usage}
        if not isinstance(data, dict):
            return {"ok": False, "error": "Unexpected smart lookup response.", "usage": usage}
        return {"ok": True, "data": data, "usage": usage}

    def _download_image(self, url: str) -> bytes | None:
        url = (url or "").strip()
        if not url:
            return None
        local = self._read_local_media(url)
        if local:
            return local
        if url.startswith("/"):
            return None
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "IE-Orbit-ShopIE/1.0"})
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.info("Smart lookup image download failed: %s", exc)
            return None

    def _read_local_media(self, url: str) -> bytes | None:
        match = _MEDIA_FILE_RE.search(url.split("?", 1)[0])
        if not match:
            return None
        from apps.platform_media.models import Media
        from apps.platform_media.storage.factory import get_storage_provider

        media = Media.objects.filter(id=match.group(1)).first()
        if media is None:
            return None
        try:
            return get_storage_provider(media.storage_provider).read_bytes(path=media.storage_path)
        except (FileNotFoundError, ValueError, OSError) as exc:
            logger.info("Smart lookup local media read failed: %s", exc)
            return None

    def _image_mime(self, url: str, payload: bytes) -> str:
        if payload.startswith(b"\x89PNG"):
            return "image/png"
        if payload.startswith(b"RIFF") and b"WEBP" in payload[:16]:
            return "image/webp"
        if payload.startswith(b"%PDF"):
            return "application/pdf"
        lowered = url.lower()
        if lowered.endswith(".png"):
            return "image/png"
        if lowered.endswith(".webp"):
            return "image/webp"
        if lowered.endswith(".pdf"):
            return "application/pdf"
        return "image/jpeg"
