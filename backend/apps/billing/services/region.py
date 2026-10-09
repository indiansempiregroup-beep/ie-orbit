from __future__ import annotations

from typing import Literal

from rest_framework.exceptions import ValidationError

BillingRegion = Literal["IN", "INTL"]
SaasCurrency = Literal["INR", "USD"]

SAAS_CURRENCIES: frozenset[str] = frozenset({"INR", "USD"})

# Normalized country tokens treated as India for SaaS billing rails.
_INDIA_TOKENS: frozenset[str] = frozenset(
    {
        "in",
        "ind",
        "india",
        "bharat",
        "भारत",
    }
)

# ISO-ish deny list for signup (sanctions / blocked). Expand via settings later if needed.
DEFAULT_SANCTIONS_DENY_COUNTRIES: frozenset[str] = frozenset(
    {
        "kp",
        "north korea",
        "cu",
        "cuba",
        "ir",
        "iran",
        "sy",
        "syria",
        "ru",
        "russia",
        "by",
        "belarus",
    }
)


def normalize_country(country: str | None) -> str:
    return " ".join(str(country or "").strip().lower().split())


def is_india_country(country: str | None) -> bool:
    normalized = normalize_country(country)
    if not normalized:
        return False
    if normalized in _INDIA_TOKENS:
        return True
    # "Republic of India", "IN - India", etc.
    parts = {part.strip(".,") for part in normalized.replace("/", " ").replace("-", " ").split() if part}
    return bool(parts & _INDIA_TOKENS)


def billing_region_for_country(country: str | None) -> BillingRegion:
    return "IN" if is_india_country(country) else "INTL"


def saas_currency_for_country(country: str | None) -> SaasCurrency:
    return "INR" if is_india_country(country) else "USD"


def billing_region_for_business(business: object) -> BillingRegion:
    country = getattr(business, "country", None)
    return billing_region_for_country(str(country or ""))


def saas_currency_for_business(business: object) -> SaasCurrency:
    stored = str(getattr(business, "saas_currency", "") or "").strip().upper()
    if stored in SAAS_CURRENCIES:
        # Still re-derive from country so country wins if they diverge.
        return saas_currency_for_country(str(getattr(business, "country", "") or ""))
    return saas_currency_for_country(str(getattr(business, "country", "") or ""))


def assert_saas_currency_allowed(*, country: str | None, saas_currency: str | None) -> SaasCurrency:
    expected = saas_currency_for_country(country)
    requested = str(saas_currency or "").strip().upper()
    if requested and requested != expected:
        raise ValidationError(
            {
                "saas_currency": (
                    f"SaaS currency is locked to {expected} for this business country "
                    f"(got {requested})."
                ),
                "code": "saas_currency_locked",
            }
        )
    return expected


def is_country_sanctioned(country: str | None) -> bool:
    normalized = normalize_country(country)
    if not normalized:
        return False
    if normalized in DEFAULT_SANCTIONS_DENY_COUNTRIES:
        return True
    parts = {part.strip(".,") for part in normalized.replace("/", " ").replace("-", " ").split() if part}
    return bool(parts & DEFAULT_SANCTIONS_DENY_COUNTRIES)


def assert_country_allowed_for_signup(country: str | None) -> None:
    if is_country_sanctioned(country):
        raise ValidationError(
            {
                "country": "IE Orbit is not available for signup from this country.",
                "code": "country_blocked",
            }
        )


# Plan feature codes that must not run outside India.
INDIA_ONLY_FEATURE_CODES: frozenset[str] = frozenset(
    {
        "shopie_instant_delivery",
        "shopie_einvoice",
        "shopie_eway",
        "razorpay_payments",
        "cashfree_payments",
    }
)


def is_india_only_feature(feature_code: str | None) -> bool:
    code = str(feature_code or "").strip().lower()
    return code in INDIA_ONLY_FEATURE_CODES


def business_allows_india_feature(business: object, feature_code: str | None) -> bool:
    """Return False when an India-only feature is requested for an INTL business."""

    if not is_india_only_feature(feature_code):
        return True
    return billing_region_for_business(business) == "IN"


def normalize_prices_minor(raw: object | None) -> dict[str, dict[str, int | None]]:
    """Normalize prices_minor to {INR|USD: {monthly, yearly}} with int minor units."""

    result: dict[str, dict[str, int | None]] = {
        "INR": {"monthly": None, "yearly": None},
        "USD": {"monthly": None, "yearly": None},
    }
    if not isinstance(raw, dict):
        return result
    for code in ("INR", "USD"):
        entry = raw.get(code) or raw.get(code.lower())
        if not isinstance(entry, dict):
            continue
        monthly = entry.get("monthly")
        yearly = entry.get("yearly")
        try:
            result[code]["monthly"] = int(monthly) if monthly is not None else None
        except (TypeError, ValueError):
            result[code]["monthly"] = None
        try:
            result[code]["yearly"] = int(yearly) if yearly is not None else None
        except (TypeError, ValueError):
            result[code]["yearly"] = None
    return result


def price_minor_for_currency(
    prices_minor: object | None,
    *,
    currency: str,
    interval: str = "monthly",
    inr_monthly: int | None = None,
    inr_yearly: int | None = None,
) -> int | None:
    """Resolve a minor-unit price for INR/USD, falling back to legacy INR fields."""

    code = str(currency or "INR").strip().upper()
    if code not in SAAS_CURRENCIES:
        code = "USD" if code != "INR" else "INR"
    normalized = normalize_prices_minor(prices_minor)
    bucket = normalized[code]
    key = "yearly" if str(interval).lower() == "yearly" else "monthly"
    value = bucket.get(key)
    if value is not None:
        return int(value)
    if code == "INR":
        return inr_yearly if key == "yearly" else inr_monthly
    return None
