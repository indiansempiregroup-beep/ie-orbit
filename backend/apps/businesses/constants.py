from __future__ import annotations

PRODUCT_APPOINTIE = "appointie"
PRODUCT_SHOPIE = "shopie"
PRODUCT_CRMIE = "crmie"
# Legacy stub kept for existing subscription rows; not offered in new catalogs.
PRODUCT_INVOICEIE = "invoiceie"

VALID_PRODUCT_CODES = frozenset(
    {
        PRODUCT_APPOINTIE,
        PRODUCT_SHOPIE,
        PRODUCT_CRMIE,
        PRODUCT_INVOICEIE,
    }
)

DEFAULT_PRODUCT_CODE = PRODUCT_APPOINTIE

BILLING_INTERVAL_MONTHLY = "monthly"
BILLING_INTERVAL_YEARLY = "yearly"

DEFAULT_TRIAL_DAYS = 15

BI_FEATURE_OVERVIEW = "overview"
BI_FEATURE_GROWTH = "growth"
BI_FEATURE_REVENUE = "revenue"
BI_FEATURE_FORECAST = "forecast"
BI_FEATURE_REPORTS = "reports"

BI_FEATURES_LIMITED = (BI_FEATURE_OVERVIEW,)
BI_FEATURES_FULL = (
    BI_FEATURE_OVERVIEW,
    BI_FEATURE_GROWTH,
    BI_FEATURE_REVENUE,
    BI_FEATURE_FORECAST,
    BI_FEATURE_REPORTS,
)

FEATURE_REWARD_POINTS = "reward_points"
PLAN_FEATURES_LIMITED: tuple[str, ...] = ()
PLAN_FEATURES_FULL = (FEATURE_REWARD_POINTS,)

FEATURE_SHOPIE_BOOKS_SALE = "shopie_books_sale"
FEATURE_SHOPIE_BOOKS_PURCHASE = "shopie_books_purchase"
FEATURE_SHOPIE_BOOKS_CASH = "shopie_books_cash"
FEATURE_SHOPIE_BOOKS_EXPENSE = "shopie_books_expense"
FEATURE_SHOPIE_GST_REPORTS = "shopie_gst_reports"
FEATURE_SHOPIE_EINVOICE = "shopie_einvoice"
FEATURE_SHOPIE_EWAY = "shopie_eway"

DEFAULT_LOYALTY_PREFERENCES: dict[str, object] = {
    "enabled": False,
    "points_per_currency_unit": 10,
    "max_redeem_percent": 50,
    "min_redeem_points": 10,
}

PRODUCT_PLAN_CATALOG: dict[str, list[dict[str, object]]] = {
    PRODUCT_APPOINTIE: [
        {
            "code": "appointie-starter",
            "name": "AppointIE Starter",
            "description": "Scheduling and bookings for a single location.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
            "max_staff": 1,
            "max_branches": 1,
            "bi_features": list(BI_FEATURES_LIMITED),
            "features": list(PLAN_FEATURES_LIMITED),
        },
        {
            "code": "appointie-pro",
            "name": "AppointIE Pro",
            "description": "Multi-location scheduling with full business intelligence.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
            "max_staff": 5,
            "max_branches": 5,
            "bi_features": list(BI_FEATURES_FULL),
            "features": list(PLAN_FEATURES_FULL),
        },
    ],
    PRODUCT_SHOPIE: [
        {
            "code": "shopie-starter",
            "name": "ShopIE Starter",
            "description": "Catalog, POS, inventory, and billing for a single location.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
            "max_staff": 2,
            "max_branches": 1,
            "bi_features": list(BI_FEATURES_LIMITED),
            "features": list(PLAN_FEATURES_LIMITED),
        },
        {
            "code": "shopie-pro",
            "name": "ShopIE Pro",
            "description": "Multi-location commerce with advanced inventory and billing.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
            "max_staff": 5,
            "max_branches": 5,
            "bi_features": list(BI_FEATURES_FULL),
            "features": [*PLAN_FEATURES_FULL, FEATURE_SHOPIE_EINVOICE, FEATURE_SHOPIE_EWAY],
        },
    ],
    PRODUCT_INVOICEIE: [
        {
            "code": "invoiceie-starter",
            "name": "InvoiceIE Starter (legacy)",
            "description": "Legacy plan — use ShopIE Billing instead.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
            "max_staff": 1,
            "max_branches": 1,
            "bi_features": list(BI_FEATURES_LIMITED),
            "features": list(PLAN_FEATURES_LIMITED),
        },
        {
            "code": "invoiceie-pro",
            "name": "InvoiceIE Pro (legacy)",
            "description": "Legacy plan — use ShopIE Billing instead.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
            "max_staff": 5,
            "max_branches": 5,
            "bi_features": list(BI_FEATURES_FULL),
            "features": list(PLAN_FEATURES_FULL),
        },
    ],
    PRODUCT_CRMIE: [
        {
            "code": "crmie-starter",
            "name": "CRMIE Starter",
            "description": "Customer records and follow-ups for one business.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
            "max_staff": 1,
            "max_branches": 1,
            "bi_features": list(BI_FEATURES_LIMITED),
            "features": list(PLAN_FEATURES_LIMITED),
        },
        {
            "code": "crmie-pro",
            "name": "CRMIE Pro",
            "description": "Pipeline, segmentation, and multi-location CRM.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
            "max_staff": 5,
            "max_branches": 5,
            "bi_features": list(BI_FEATURES_FULL),
            "features": list(PLAN_FEATURES_FULL),
        },
    ],
}


def get_default_plan_code(product_code: str) -> str | None:
    from apps.businesses.services.plan_catalog import get_default_plan_code_resolved

    return get_default_plan_code_resolved(product_code)


def get_plan_definition(product_code: str, plan_code: str) -> dict[str, object] | None:
    from apps.businesses.services.plan_catalog import get_plan_definition_resolved

    return get_plan_definition_resolved(product_code, plan_code)


def plan_rank(plan_code: str | None) -> int:
    """Higher rank = higher tier. Used to decide upgrade vs deferred downgrade."""
    code = (plan_code or "").strip().lower()
    if not code:
        return 0
    if code.endswith("-pro") or code.endswith("_pro") or "-pro-" in code:
        return 2
    if "starter" in code:
        return 1
    definition_staff = 0
    for plans in PRODUCT_PLAN_CATALOG.values():
        for plan in plans:
            if str(plan["code"]) == code:
                definition_staff = int(plan.get("max_staff", 0) or 0)
                break
    return 2 if definition_staff >= 5 else 1 if definition_staff else 0


def is_plan_upgrade(*, current_plan_code: str | None, target_plan_code: str) -> bool:
    return plan_rank(target_plan_code) > plan_rank(current_plan_code)
