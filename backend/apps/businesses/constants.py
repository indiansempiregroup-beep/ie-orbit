from __future__ import annotations

PRODUCT_APPOINTIE = "appointie"
PRODUCT_INVOICEIE = "invoiceie"
PRODUCT_CRMIE = "crmie"

VALID_PRODUCT_CODES = frozenset(
    {
        PRODUCT_APPOINTIE,
        PRODUCT_INVOICEIE,
        PRODUCT_CRMIE,
    }
)

DEFAULT_PRODUCT_CODE = PRODUCT_APPOINTIE

BILLING_INTERVAL_MONTHLY = "monthly"
BILLING_INTERVAL_YEARLY = "yearly"

DEFAULT_TRIAL_DAYS = 14

PRODUCT_PLAN_CATALOG: dict[str, list[dict[str, object]]] = {
    PRODUCT_APPOINTIE: [
        {
            "code": "appointie-starter",
            "name": "AppointIE Starter",
            "description": "Scheduling and bookings for a single location.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
        },
        {
            "code": "appointie-pro",
            "name": "AppointIE Pro",
            "description": "Advanced scheduling, staff, and customer workflows.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
        },
    ],
    PRODUCT_INVOICEIE: [
        {
            "code": "invoiceie-starter",
            "name": "InvoiceIE Starter",
            "description": "Invoicing essentials for small teams.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": True,
        },
        {
            "code": "invoiceie-pro",
            "name": "InvoiceIE Pro",
            "description": "Advanced invoicing, reminders, and reporting.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
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
        },
        {
            "code": "crmie-pro",
            "name": "CRMIE Pro",
            "description": "Pipeline, segmentation, and multi-location CRM.",
            "billing_interval": BILLING_INTERVAL_MONTHLY,
            "trial_days": DEFAULT_TRIAL_DAYS,
            "is_default": False,
        },
    ],
}


def get_default_plan_code(product_code: str) -> str | None:
    plans = PRODUCT_PLAN_CATALOG.get(product_code, [])
    for plan in plans:
        if plan.get("is_default"):
            return str(plan["code"])
    return str(plans[0]["code"]) if plans else None


def get_plan_definition(product_code: str, plan_code: str) -> dict[str, object] | None:
    for plan in PRODUCT_PLAN_CATALOG.get(product_code, []):
        if plan["code"] == plan_code:
            return plan
    return None
