from __future__ import annotations

PRODUCT_APPOINTIE = "appointie"
PRODUCT_SHOPIE = "shopie"

VALID_PRODUCT_CODES = frozenset(
    {
        PRODUCT_APPOINTIE,
        PRODUCT_SHOPIE,
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

FEATURE_APPOINTIE_BOOKINGS = "appointie_bookings"
FEATURE_APPOINTIE_CALENDAR = "appointie_calendar"
FEATURE_APPOINTIE_CUSTOMERS = "appointie_customers"
FEATURE_APPOINTIE_REVIEWS = "appointie_reviews"
FEATURE_APPOINTIE_SERVICES = "appointie_services"
FEATURE_APPOINTIE_STAFF = "appointie_staff"

FEATURE_SHOPIE_POS = "shopie_pos"
FEATURE_SHOPIE_PRODUCTS = "shopie_products"
FEATURE_SHOPIE_ORDERS = "shopie_orders"
FEATURE_SHOPIE_RETURNS = "shopie_returns"
FEATURE_SHOPIE_DELIVERY_ZONES = "shopie_delivery_zones"
FEATURE_SHOPIE_INSTANT_DELIVERY = "shopie_instant_delivery"
FEATURE_SHOPIE_COUPONS = "shopie_coupons"
FEATURE_SHOPIE_LOYALTY = "shopie_loyalty"

FEATURE_SHOPIE_BOOKS_SALE = "shopie_books_sale"
FEATURE_SHOPIE_BOOKS_PURCHASE = "shopie_books_purchase"
FEATURE_SHOPIE_BOOKS_CASH = "shopie_books_cash"
FEATURE_SHOPIE_BOOKS_EXPENSE = "shopie_books_expense"
FEATURE_SHOPIE_BOOKS_QUOTATIONS = "shopie_books_quotations"
FEATURE_SHOPIE_BOOKS_NOTES = "shopie_books_notes"
FEATURE_SHOPIE_BOOKS_STOCK = "shopie_books_stock"
FEATURE_SHOPIE_BOOKS_PARTIES = "shopie_books_parties"
FEATURE_SHOPIE_BOOKS_SALE_ORDER = "shopie_books_sale_order"
FEATURE_SHOPIE_BOOKS_PURCHASE_ORDER = "shopie_books_purchase_order"
FEATURE_SHOPIE_BOOKS_CHALLAN = "shopie_books_challan"
FEATURE_SHOPIE_BOOKS_GODOWNS = "shopie_books_godowns"
FEATURE_SHOPIE_BOOKS_CHEQUES = "shopie_books_cheques"
FEATURE_SHOPIE_BOOKS_LOANS = "shopie_books_loans"
FEATURE_SHOPIE_BOOKS_JOB_WORK = "shopie_books_job_work"
FEATURE_SHOPIE_GST_REPORTS = "shopie_gst_reports"
FEATURE_SHOPIE_EINVOICE = "shopie_einvoice"
FEATURE_SHOPIE_EWAY = "shopie_eway"

FEATURE_SHOPIE_GROW_WHATSAPP = "shopie_grow_whatsapp"
FEATURE_SHOPIE_GROW_GOOGLE = "shopie_grow_google"
FEATURE_SHOPIE_GROW_SYNC = "shopie_grow_sync"
FEATURE_SHOPIE_GROW_UTILITIES = "shopie_grow_utilities"
FEATURE_SHOPIE_GROW_ADS = "shopie_grow_ads"
FEATURE_SHOPIE_CUSTOMER_REFERRAL = "shopie_customer_referral"
# Legacy key retained for package backfill cleanup only.
FEATURE_SHOPIE_GROW_POSTER = "shopie_grow_poster"

APPOINTIE_FUNCTION_FEATURES: tuple[str, ...] = (
    FEATURE_APPOINTIE_BOOKINGS,
    FEATURE_APPOINTIE_CALENDAR,
    FEATURE_APPOINTIE_CUSTOMERS,
    FEATURE_APPOINTIE_REVIEWS,
    FEATURE_APPOINTIE_SERVICES,
    FEATURE_APPOINTIE_STAFF,
)

SHOPIE_COMMERCE_FEATURES: tuple[str, ...] = (
    FEATURE_SHOPIE_POS,
    FEATURE_SHOPIE_PRODUCTS,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_RETURNS,
    FEATURE_SHOPIE_DELIVERY_ZONES,
    FEATURE_SHOPIE_INSTANT_DELIVERY,
    FEATURE_SHOPIE_COUPONS,
)

SHOPIE_BOOKS_FEATURES: tuple[str, ...] = (
    FEATURE_SHOPIE_BOOKS_SALE,
    FEATURE_SHOPIE_BOOKS_PURCHASE,
    FEATURE_SHOPIE_BOOKS_CASH,
    FEATURE_SHOPIE_BOOKS_EXPENSE,
    FEATURE_SHOPIE_BOOKS_QUOTATIONS,
    FEATURE_SHOPIE_BOOKS_NOTES,
    FEATURE_SHOPIE_BOOKS_STOCK,
    FEATURE_SHOPIE_BOOKS_PARTIES,
    FEATURE_SHOPIE_BOOKS_SALE_ORDER,
    FEATURE_SHOPIE_BOOKS_PURCHASE_ORDER,
    FEATURE_SHOPIE_BOOKS_CHALLAN,
    FEATURE_SHOPIE_BOOKS_GODOWNS,
    FEATURE_SHOPIE_BOOKS_CHEQUES,
    FEATURE_SHOPIE_BOOKS_LOANS,
    FEATURE_SHOPIE_BOOKS_JOB_WORK,
    FEATURE_SHOPIE_GST_REPORTS,
    FEATURE_SHOPIE_EINVOICE,
    FEATURE_SHOPIE_EWAY,
)

SHOPIE_GROW_FEATURES: tuple[str, ...] = (
    FEATURE_SHOPIE_GROW_WHATSAPP,
    FEATURE_SHOPIE_GROW_GOOGLE,
    FEATURE_SHOPIE_GROW_SYNC,
    FEATURE_SHOPIE_GROW_UTILITIES,
    FEATURE_SHOPIE_GROW_ADS,
)

SHOPIE_ALL_FUNCTION_FEATURES: tuple[str, ...] = (
    *SHOPIE_COMMERCE_FEATURES,
    *SHOPIE_BOOKS_FEATURES,
    *SHOPIE_GROW_FEATURES,
    FEATURE_SHOPIE_LOYALTY,
    FEATURE_SHOPIE_CUSTOMER_REFERRAL,
)

PLAN_FEATURES_LIMITED: tuple[str, ...] = APPOINTIE_FUNCTION_FEATURES
PLAN_FEATURES_FULL = (*APPOINTIE_FUNCTION_FEATURES, FEATURE_REWARD_POINTS)

VOUCHER_TYPE_FEATURES: dict[str, tuple[str, ...]] = {
    "sale": (FEATURE_SHOPIE_BOOKS_SALE, FEATURE_SHOPIE_POS),
    "purchase": (FEATURE_SHOPIE_BOOKS_PURCHASE,),
    "payment_in": (FEATURE_SHOPIE_BOOKS_CASH,),
    "payment_out": (FEATURE_SHOPIE_BOOKS_CASH,),
    "transfer": (FEATURE_SHOPIE_BOOKS_CASH,),
    "credit_note": (FEATURE_SHOPIE_BOOKS_NOTES,),
    "debit_note": (FEATURE_SHOPIE_BOOKS_NOTES,),
    "expense": (FEATURE_SHOPIE_BOOKS_EXPENSE,),
    "other_income": (FEATURE_SHOPIE_BOOKS_EXPENSE,),
}

DOCUMENT_TYPE_FEATURES: dict[str, str] = {
    "sale_order": FEATURE_SHOPIE_BOOKS_SALE_ORDER,
    "purchase_order": FEATURE_SHOPIE_BOOKS_PURCHASE_ORDER,
    "delivery_challan": FEATURE_SHOPIE_BOOKS_CHALLAN,
    "job_work": FEATURE_SHOPIE_BOOKS_JOB_WORK,
}


def product_code_for_feature(feature: str) -> str:
    if feature.startswith("shopie_"):
        return PRODUCT_SHOPIE
    if feature.startswith("appointie_"):
        return PRODUCT_APPOINTIE
    return DEFAULT_PRODUCT_CODE

DEFAULT_LOYALTY_PREFERENCES: dict[str, object] = {
    "enabled": False,
    "points_per_currency_unit": 10,
    "max_redeem_percent": 50,
    "min_redeem_points": 10,
    "earn_points_per_100": 1,
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
            "features": list(SHOPIE_ALL_FUNCTION_FEATURES),
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
            "features": [*SHOPIE_ALL_FUNCTION_FEATURES, FEATURE_REWARD_POINTS],
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
