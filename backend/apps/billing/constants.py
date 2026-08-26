from __future__ import annotations

# Plan prices in paise (INR × 100). Update when Razorpay plans are configured.
PLAN_PRICE_PAISE: dict[str, int] = {
    "appointie-starter": 99900,
    "appointie-pro": 199900,
    "shopie-starter": 99900,
    "shopie-pro": 199900,
}

# Yearly = 10 × monthly (2 months free).
YEARLY_PRICE_MULTIPLIER = 10

# Self-serve add-on unit prices (monthly, paise).
ADDON_STAFF_PRICE_PAISE = 19900
ADDON_OFFICE_PRICE_PAISE = 29900
ADDON_PETS_PRICE_PAISE = 50000  # Orbit Mart Pets pack · ₹500/month

DEFAULT_CHECKOUT_CURRENCY = "INR"
CHECKOUT_SESSION_TTL_HOURS = 24

# Retry schedule in seconds: 1m, 5m, 30m.
WEBHOOK_RETRY_DELAYS_SECONDS: tuple[int, ...] = (60, 300, 1800)

# Cooldown for bulk reprocess operations per tenant+user.
BULK_REPROCESS_COOLDOWN_SECONDS = 60
