from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from apps.shopie.models import ShopBusinessSettings, ShopDeliveryZone


def _sla_from_settings(settings: ShopBusinessSettings | None) -> dict[str, Any]:
    metadata = dict((settings.metadata if settings else None) or {})
    delivery_sla = metadata.get("delivery_sla")
    if isinstance(delivery_sla, dict):
        return delivery_sla
    return {}


def compute_delivery_promise(
    *,
    zone: ShopDeliveryZone,
    settings: ShopBusinessSettings | None = None,
    reference: datetime | None = None,
) -> dict[str, Any]:
    """Return a customer-facing delivery promise for checkout and order confirmation."""
    now = reference or timezone.now()
    sla = _sla_from_settings(settings)
    zone_meta = dict(zone.metadata or {})
    min_days = int(zone_meta.get("delivery_days_min") or sla.get("default_delivery_days_min") or 3)
    max_days = int(zone_meta.get("delivery_days_max") or sla.get("default_delivery_days_max") or 5)
    cutoff_raw = str(sla.get("same_day_cutoff_time") or "14:00")
    try:
        hour, minute = [int(part) for part in cutoff_raw.split(":", 1)]
        cutoff = time(hour=hour, minute=minute)
    except (TypeError, ValueError):
        cutoff = time(hour=14, minute=0)

    if zone.same_day and now.time() < cutoff:
        arrives_by = now.date()
        label = "Same-day delivery"
        detail = f"Order before {cutoff.strftime('%I:%M %p').lstrip('0')} for same-day delivery"
    elif zone.same_day:
        arrives_by = now.date() + timedelta(days=1)
        label = "Arrives tomorrow"
        detail = "Same-day cutoff passed — arriving tomorrow"
    else:
        arrives_by = now.date() + timedelta(days=max_days)
        if min_days == max_days:
            label = f"Arrives in {min_days} business day{'s' if min_days != 1 else ''}"
        else:
            label = f"Arrives in {min_days}–{max_days} business days"
        detail = label

    return {
        "label": label,
        "detail": detail,
        "arrives_by": arrives_by.isoformat(),
        "same_day": bool(zone.same_day),
        "same_day_cutoff": cutoff.strftime("%H:%M"),
    }


def promise_from_shipment(*, estimated_delivery_at: date | None, status: str) -> dict[str, Any]:
    if estimated_delivery_at is None:
        return {"label": "On the way", "detail": "", "arrives_by": None}
    today = timezone.localdate()
    if estimated_delivery_at == today:
        label = "Arriving today"
    elif estimated_delivery_at == today + timedelta(days=1):
        label = "Arriving tomorrow"
    else:
        label = f"Arriving {estimated_delivery_at.strftime('%a, %d %b').replace(' 0', ' ')}"
    return {
        "label": label,
        "detail": label,
        "arrives_by": estimated_delivery_at.isoformat(),
    }
