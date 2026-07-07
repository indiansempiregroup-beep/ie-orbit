from __future__ import annotations

# Plan prices in paise (INR × 100). Update when Razorpay plans are configured.
PLAN_PRICE_PAISE: dict[str, int] = {
    "appointie-starter": 99900,
    "appointie-pro": 199900,
    "invoiceie-starter": 79900,
    "invoiceie-pro": 149900,
    "crmie-starter": 59900,
    "crmie-pro": 129900,
}

DEFAULT_CHECKOUT_CURRENCY = "INR"
CHECKOUT_SESSION_TTL_HOURS = 24
