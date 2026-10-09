from __future__ import annotations

from typing import Any

from django.db.utils import OperationalError, ProgrammingError

from apps.billing.constants import (
    ADDON_OFFICE_PRICE_PAISE,
    ADDON_OFFICE_PRICE_USD_CENTS,
    ADDON_PETS_PRICE_PAISE,
    ADDON_PETS_PRICE_USD_CENTS,
    ADDON_STAFF_PRICE_PAISE,
    ADDON_STAFF_PRICE_USD_CENTS,
)

DEFAULT_ADDON_PRICES = {
    "staff_price_paise": ADDON_STAFF_PRICE_PAISE,
    "office_price_paise": ADDON_OFFICE_PRICE_PAISE,
    "pets_price_paise": ADDON_PETS_PRICE_PAISE,
}

DEFAULT_ADDON_PRICES_MINOR = {
    "INR": {
        "staff": ADDON_STAFF_PRICE_PAISE,
        "office": ADDON_OFFICE_PRICE_PAISE,
        "pets": ADDON_PETS_PRICE_PAISE,
    },
    "USD": {
        "staff": ADDON_STAFF_PRICE_USD_CENTS,
        "office": ADDON_OFFICE_PRICE_USD_CENTS,
        "pets": ADDON_PETS_PRICE_USD_CENTS,
    },
}


def get_addon_prices_minor() -> dict[str, dict[str, int]]:
    """Return add-on unit prices for INR and USD in minor units."""

    try:
        from apps.platform_admin.models import PlatformAddonPricing

        row = PlatformAddonPricing.objects.filter(key="default").first()
    except (OperationalError, ProgrammingError, ImportError):
        return {
            "INR": dict(DEFAULT_ADDON_PRICES_MINOR["INR"]),
            "USD": dict(DEFAULT_ADDON_PRICES_MINOR["USD"]),
        }
    if row is None:
        return {
            "INR": dict(DEFAULT_ADDON_PRICES_MINOR["INR"]),
            "USD": dict(DEFAULT_ADDON_PRICES_MINOR["USD"]),
        }
    raw = getattr(row, "prices_minor", None) or {}
    inr = raw.get("INR") if isinstance(raw, dict) else None
    usd = raw.get("USD") if isinstance(raw, dict) else None
    return {
        "INR": {
            "staff": int((inr or {}).get("staff") or row.staff_price_paise or ADDON_STAFF_PRICE_PAISE),
            "office": int((inr or {}).get("office") or row.office_price_paise or ADDON_OFFICE_PRICE_PAISE),
            "pets": int((inr or {}).get("pets") or row.pets_price_paise or ADDON_PETS_PRICE_PAISE),
        },
        "USD": {
            "staff": int((usd or {}).get("staff") or ADDON_STAFF_PRICE_USD_CENTS),
            "office": int((usd or {}).get("office") or ADDON_OFFICE_PRICE_USD_CENTS),
            "pets": int((usd or {}).get("pets") or ADDON_PETS_PRICE_USD_CENTS),
        },
    }


def get_addon_prices(*, currency: str = "INR") -> dict[str, int]:
    """Return platform add-on unit prices for one SaaS currency (legacy key names)."""

    code = str(currency or "INR").strip().upper()
    if code not in {"INR", "USD"}:
        code = "USD"
    minor = get_addon_prices_minor()[code]
    return {
        "staff_price_paise": minor["staff"],
        "office_price_paise": minor["office"],
        "pets_price_paise": minor["pets"],
    }


def serialize_addon_prices(
    prices: dict[str, int] | None = None,
    *,
    currency: str = "INR",
) -> dict[str, Any]:
    code = str(currency or "INR").strip().upper()
    if code not in {"INR", "USD"}:
        code = "USD"
    resolved = prices or get_addon_prices(currency=code)
    all_minor = get_addon_prices_minor()
    return {
        "currency": code,
        "staff_price_paise": resolved["staff_price_paise"],
        "office_price_paise": resolved["office_price_paise"],
        "pets_price_paise": resolved["pets_price_paise"],
        "staff_price_inr": resolved["staff_price_paise"] / 100 if code == "INR" else None,
        "office_price_inr": resolved["office_price_paise"] / 100 if code == "INR" else None,
        "pets_price_inr": resolved["pets_price_paise"] / 100 if code == "INR" else None,
        "staff_price_major": resolved["staff_price_paise"] / 100,
        "office_price_major": resolved["office_price_paise"] / 100,
        "pets_price_major": resolved["pets_price_paise"] / 100,
        "prices_minor": all_minor,
    }
