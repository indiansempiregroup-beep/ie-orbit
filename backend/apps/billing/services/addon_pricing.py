from __future__ import annotations

from typing import Any

from django.db.utils import OperationalError, ProgrammingError

from apps.billing.constants import (
    ADDON_OFFICE_PRICE_PAISE,
    ADDON_PETS_PRICE_PAISE,
    ADDON_STAFF_PRICE_PAISE,
)

DEFAULT_ADDON_PRICES = {
    "staff_price_paise": ADDON_STAFF_PRICE_PAISE,
    "office_price_paise": ADDON_OFFICE_PRICE_PAISE,
    "pets_price_paise": ADDON_PETS_PRICE_PAISE,
}


def get_addon_prices() -> dict[str, int]:
    """Return platform add-on unit prices, falling back to catalog defaults."""

    try:
        from apps.platform_admin.models import PlatformAddonPricing

        row = PlatformAddonPricing.objects.filter(key="default").first()
    except (OperationalError, ProgrammingError, ImportError):
        return dict(DEFAULT_ADDON_PRICES)
    if row is None:
        return dict(DEFAULT_ADDON_PRICES)
    return {
        "staff_price_paise": int(row.staff_price_paise),
        "office_price_paise": int(row.office_price_paise),
        "pets_price_paise": int(row.pets_price_paise),
    }


def serialize_addon_prices(prices: dict[str, int] | None = None) -> dict[str, Any]:
    resolved = prices or get_addon_prices()
    return {
        "staff_price_paise": resolved["staff_price_paise"],
        "office_price_paise": resolved["office_price_paise"],
        "pets_price_paise": resolved["pets_price_paise"],
        "staff_price_inr": resolved["staff_price_paise"] / 100,
        "office_price_inr": resolved["office_price_paise"] / 100,
        "pets_price_inr": resolved["pets_price_paise"] / 100,
    }
