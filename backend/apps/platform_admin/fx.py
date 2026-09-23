from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.platform_admin.models import PlatformSmartLookupSettings

logger = logging.getLogger(__name__)

FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD&to=INR"


def fetch_usd_inr_rate() -> tuple[Decimal, str]:
    """Fetch USD→INR from Frankfurter (ECB-based, no API key)."""
    request = urllib.request.Request(
        FRANKFURTER_URL,
        headers={"User-Agent": "IE-Orbit-ShopIE/1.0", "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8"))
    rates = payload.get("rates") or {}
    raw = rates.get("INR")
    if raw is None:
        raise ValueError("Frankfurter response missing INR rate.")
    rate = Decimal(str(raw)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    if rate <= 0:
        raise ValueError("Invalid FX rate.")
    return rate, "frankfurter"


@transaction.atomic
def refresh_platform_usd_inr(*, source_label: str | None = None) -> dict[str, Any]:
    """Update singleton Smart lookup FX from the live market rate."""
    rate, source = fetch_usd_inr_rate()
    if source_label:
        source = source_label
    row, _ = PlatformSmartLookupSettings.objects.select_for_update().get_or_create(
        key="default",
        defaults={
            "enabled": True,
            "usd_to_inr": rate,
            "gst_percent": Decimal("18"),
            "markup_bps": 0,
            "min_charge_paise": 1,
            "input_usd_per_million": Decimal("0.10"),
            "output_usd_per_million": Decimal("0.40"),
            "suggested_top_up_paise": [5000, 10000, 25000, 50000],
        },
    )
    before = Decimal(str(row.usd_to_inr))
    row.usd_to_inr = rate
    row.usd_to_inr_fetched_at = timezone.now()
    row.usd_to_inr_source = source
    row.save(
        update_fields=[
            "usd_to_inr",
            "usd_to_inr_fetched_at",
            "usd_to_inr_source",
            "updated_at",
            "version",
        ]
    )
    logger.info(
        "smart_lookup_fx_refreshed before=%s after=%s source=%s",
        before,
        rate,
        source,
    )
    return {
        "usd_to_inr": float(rate),
        "previous_usd_to_inr": float(before),
        "source": source,
        "fetched_at": row.usd_to_inr_fetched_at.isoformat() if row.usd_to_inr_fetched_at else None,
    }
