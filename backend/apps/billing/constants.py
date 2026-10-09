from __future__ import annotations

# Plan prices in paise (INR × 100). Update when Razorpay plans are configured.
PLAN_PRICE_PAISE: dict[str, int] = {
    "appointie-starter": 39900,
    "appointie-pro": 79900,
    "shopie-starter": 39900,
    "shopie-pro": 79900,
}

# Parallel USD catalog in cents (USD × 100). Used for non-India SaaS checkout.
PLAN_PRICE_USD_CENTS: dict[str, int] = {
    "appointie-starter": 499,
    "appointie-pro": 999,
    "shopie-starter": 499,
    "shopie-pro": 999,
}

ADDON_STAFF_PRICE_USD_CENTS = 299
ADDON_OFFICE_PRICE_USD_CENTS = 399
ADDON_PETS_PRICE_USD_CENTS = 699

# Yearly = N × monthly (default: 10 = 2 months free). Per-package yearly_months_charged overrides this.
YEARLY_PRICE_MULTIPLIER = 10


def clamp_yearly_months_charged(value: object | None, *, default: int = YEARLY_PRICE_MULTIPLIER) -> int:
    """Return months charged for a yearly plan (1–12)."""
    try:
        months = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        months = int(default)
    if months < 1:
        return 1
    if months > 12:
        return 12
    return months


def yearly_months_from_definition(definition: dict | None, *, default: int = YEARLY_PRICE_MULTIPLIER) -> int:
    if not definition:
        return clamp_yearly_months_charged(default)
    return clamp_yearly_months_charged(definition.get("yearly_months_charged"), default=default)

# Self-serve add-on unit prices (monthly, paise).
ADDON_STAFF_PRICE_PAISE = 19900
ADDON_OFFICE_PRICE_PAISE = 29900
ADDON_PETS_PRICE_PAISE = 50000  # Orbit Mart Pets pack · ₹500/month

DEFAULT_CHECKOUT_CURRENCY = "INR"
INTL_CHECKOUT_CURRENCY = "USD"
CHECKOUT_SESSION_TTL_HOURS = 24

# Retry schedule in seconds: 1m, 5m, 30m.
WEBHOOK_RETRY_DELAYS_SECONDS: tuple[int, ...] = (60, 300, 1800)

# Cooldown for bulk reprocess operations per tenant+user.
BULK_REPROCESS_COOLDOWN_SECONDS = 60
