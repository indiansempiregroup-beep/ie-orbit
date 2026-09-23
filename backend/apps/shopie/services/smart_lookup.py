from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
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
        },
    )
    return row


def serialize_platform_smart_lookup_settings(
    row: PlatformSmartLookupSettings | None = None,
) -> dict[str, Any]:
    settings = row or get_platform_smart_lookup_row()
    tops = settings.suggested_top_up_paise if isinstance(settings.suggested_top_up_paise, list) else []
    cleaned = [int(v) for v in tops if int(v) > 0] or list(DEFAULT_SUGGESTED_TOP_UPS)
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
        "min_charge_paise": int(settings.min_charge_paise),
        "input_usd_per_million": float(settings.input_usd_per_million),
        "output_usd_per_million": float(settings.output_usd_per_million),
        "suggested_top_up_paise": cleaned,
        "suggested_top_up_inr": [round(v / 100, 2) for v in cleaned],
        "model": GEMINI_MODEL,
    }


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
        return tenant_feature_enabled(tenant=tenant, key="shopie_smart_lookup", default=True)

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

    def dashboard(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        settings = self.ensure_settings(tenant=tenant, business=business)
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        platform = serialize_platform_smart_lookup_settings()
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
            "platform": platform,
            "balance_paise": wallet.balance_paise,
            "balance_inr": wallet.balance_paise / 100,
            "month": {
                "free_lookups": free_count,
                "paid_lookups": paid_count,
                "spent_paise": spent_paise,
                "spent_inr": spent_paise / 100,
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

        platform = get_platform_smart_lookup_row()
        min_debit = max(1, int(platform.min_charge_paise or 1))
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

        vision = self._call_gemini(api_key=api_key, image_url=image_url, code=code, hint=hint)
        source_ok = "gemini_vision" if mode == "vision" else "gemini_text"
        source_err = "gemini_vision_error" if mode == "vision" else "gemini_text_error"
        if not vision.get("ok"):
            SmartLookupUsage.objects.create(
                tenant=tenant,
                business=business,
                code=code or "",
                source=source_err,
                found=False,
                charged_paise=0,
                model=GEMINI_MODEL,
                metadata={"error": vision.get("error") or "failed", "mode": mode},
            )
            return {
                "found": False,
                "code": code,
                "source": source_ok,
                "needs_pack_photo": mode == "text",
                "message": vision.get("error")
                or (
                    "Could not read the pack photo. Try again or fill manually."
                    if mode == "vision"
                    else "Smart lookup could not identify this product. Try a pack photo or fill manually."
                ),
                "confidence": "none",
            }

        usage = vision.get("usage") or {}
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        data = vision.get("data") or {}
        found = bool(data.get("name") or data.get("brand"))
        # Text barcode/name guesses with no identity: don't debit (avoid charging for blanks).
        # Pack-photo vision still debits because image tokens were consumed.
        if mode == "text" and not found:
            SmartLookupUsage.objects.create(
                tenant=tenant,
                business=business,
                code=code or "",
                source="gemini_text",
                found=False,
                charged_paise=0,
                balance_after_paise=int(wallet.balance_paise),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=GEMINI_MODEL,
                metadata={"mode": mode, "hint": hint[:200], "no_charge": "empty_identity"},
            )
            return {
                "found": False,
                "code": code,
                "source": "gemini_text",
                "needs_pack_photo": True,
                "charged_paise": 0,
                "message": (
                    "Smart lookup could not identify this barcode from text alone. "
                    "Capture a clear pack photo to fill details (wallet will be charged)."
                ),
                "confidence": "none",
            }

        charged_paise, usd_micros = self._cost_paise(input_tokens, output_tokens, platform=platform)

        wallet = SmartLookupWallet.objects.select_for_update().get(pk=wallet.pk)
        if wallet.balance_paise < charged_paise:
            return {
                "found": False,
                "code": code,
                "source": "smart_lookup_no_balance",
                "needs_pack_photo": True,
                "message": "Wallet balance is too low for this lookup. Top up under Products & billing.",
                "confidence": "none",
            }

        wallet.balance_paise = int(wallet.balance_paise) - charged_paise
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])

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
            "charged_paise": charged_paise,
            "message": (
                "Filled from pack photo. Review price/stock, then save."
                if mode == "vision"
                else "Filled by Smart lookup. Review carefully — pack photo improves accuracy."
            ),
        }
        if result["found"]:
            # Vision reads the pack — safe to cache in platform GTIN.
            # Text-only Gemini guesses must NOT poison the shared catalog.
            if mode == "vision":
                result = self.enrichment.upsert_from_vision(result)
            else:
                result = self.enrichment._attach_category(result)
                result["needs_pack_photo"] = True
                result["message"] = (
                    "Possible match from Smart lookup (not verified). "
                    "Review carefully, or capture a pack photo to confirm and save to catalog."
                )
        else:
            result["needs_pack_photo"] = True
            result["message"] = (
                "Pack photo saved, but we could not read the label clearly."
                if mode == "vision"
                else "Smart lookup could not identify this barcode. Take a pack photo or enter details manually."
            )

        SmartLookupUsage.objects.create(
            tenant=tenant,
            business=business,
            code=result.get("code") or code or "",
            source=source_ok,
            found=bool(result.get("found")),
            charged_paise=charged_paise,
            balance_after_paise=int(wallet.balance_paise),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            usd_micros=usd_micros,
            model=GEMINI_MODEL,
            metadata={
                "image_url": image_url,
                "markup_bps": int(platform.markup_bps),
                "mode": mode,
                "hint": hint[:200],
            },
        )
        return ProductEnrichmentService.with_user_message(result)

    def _cost_paise(
        self,
        input_tokens: int,
        output_tokens: int,
        *,
        platform: PlatformSmartLookupSettings | None = None,
    ) -> tuple[int, int]:
        settings = platform or get_platform_smart_lookup_row()
        input_rate = Decimal(str(settings.input_usd_per_million or "0.10"))
        output_rate = Decimal(str(settings.output_usd_per_million or "0.40"))
        fx = Decimal(str(settings.usd_to_inr or "85"))
        min_debit = max(0, int(settings.min_charge_paise or 0))
        markup_bps = max(0, int(settings.markup_bps or 0))
        gst_percent = Decimal(str(getattr(settings, "gst_percent", None) or "0"))
        if gst_percent < 0:
            gst_percent = Decimal("0")

        usd = (Decimal(input_tokens) / Decimal(1_000_000)) * input_rate + (
            Decimal(output_tokens) / Decimal(1_000_000)
        ) * output_rate
        if markup_bps:
            usd = usd * (Decimal(1) + Decimal(markup_bps) / Decimal(10_000))
        usd_micros = int((usd * Decimal(1_000_000)).to_integral_value(rounding=ROUND_HALF_UP))
        inr = usd * fx
        if gst_percent:
            inr = inr * (Decimal(1) + gst_percent / Decimal(100))
        paise = int((inr * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP))
        if (input_tokens or output_tokens) and paise < max(1, min_debit):
            paise = max(1, min_debit)
        return paise, usd_micros

    def _call_gemini(
        self,
        *,
        api_key: str,
        image_url: str,
        code: str,
        hint: str,
    ) -> dict[str, Any]:
        image_url = (image_url or "").strip()
        if image_url:
            prompt = (
                "Extract retail product details from this packaging photo. "
                "Return ONLY compact JSON with keys: "
                "code, name, brand, pack_size, serving_size, description, ingredients, "
                "category, categories, hsn_sac, gst_rate, mrp. "
                f"Barcode hint: {code or 'unknown'}. Extra hint: {hint or 'none'}."
            )
        else:
            prompt = (
                "Look up the exact retail product for this barcode GTIN (and optional name hint). "
                "Use web search when available. Only fill name/brand when sources confirm THIS exact "
                "GTIN — never invent or reuse a nearby barcode. If unsure, leave name and brand empty. "
                "Return ONLY compact JSON with keys: "
                "code, name, brand, pack_size, serving_size, description, ingredients, "
                "category, categories, hsn_sac, gst_rate, mrp. "
                f"Barcode: {code or 'unknown'}. Name/query: {hint or 'none'}."
            )
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

        use_search = bool(GEMINI_TEXT_USE_SEARCH and not image_url)
        # Prefer grounded search for text GTIN lookups; fall back without tools if needed.
        attempts: list[dict[str, Any]] = []
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
        payload: dict[str, Any] | None = None
        last_error: dict[str, Any] | None = None
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
                # Grounded calls sometimes return empty candidates — try next attempt.
                if payload.get("candidates"):
                    break
                logger.info("Gemini smart lookup returned no candidates; trying fallback.")
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
                # Tool/search unsupported → try next body without tools.
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

        if not payload or not payload.get("candidates"):
            return last_error or {
                "ok": False,
                "error": "Smart lookup could not reach the AI service. Try again, or capture a pack photo.",
            }

        text = ""
        for candidate in payload.get("candidates") or []:
            content = candidate.get("content") or {}
            for part in content.get("parts") or []:
                if part.get("text"):
                    text += str(part["text"])
        usage_meta = payload.get("usageMetadata") or {}
        usage = {
            "input_tokens": int(usage_meta.get("promptTokenCount") or 0),
            "output_tokens": int(usage_meta.get("candidatesTokenCount") or 0),
        }
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
        if url.startswith("/"):
            return None
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "IE-Orbit-ShopIE/1.0"})
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.info("Smart lookup image download failed: %s", exc)
            return None
