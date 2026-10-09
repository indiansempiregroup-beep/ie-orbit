from __future__ import annotations

from typing import Any

from django.db.utils import OperationalError, ProgrammingError

from apps.businesses.constants import PRODUCT_PLAN_CATALOG, plan_extra_cap


def _fallback_definitions(product_code: str) -> list[dict[str, Any]]:
    from apps.billing.constants import PLAN_PRICE_PAISE, PLAN_PRICE_USD_CENTS, YEARLY_PRICE_MULTIPLIER

    plans = PRODUCT_PLAN_CATALOG.get(product_code, [])
    result: list[dict[str, Any]] = []
    for plan in plans:
        code = str(plan["code"])
        monthly_inr = PLAN_PRICE_PAISE.get(code)
        monthly_usd = PLAN_PRICE_USD_CENTS.get(code)
        result.append(
            {
                "product_code": product_code,
                "code": code,
                "name": str(plan.get("name", plan["code"])),
                "description": str(plan.get("description", "")),
                "billing_interval": str(plan.get("billing_interval", "monthly")),
                "trial_days": int(plan.get("trial_days", 0) or 0),
                "is_default": bool(plan.get("is_default", False)),
                "max_staff": int(plan.get("max_staff", 1) or 1),
                "max_branches": int(plan.get("max_branches", 1) or 1),
                "max_extra_staff": plan_extra_cap(plan, "max_extra_staff"),
                "max_extra_offices": plan_extra_cap(plan, "max_extra_offices"),
                "bi_features": list(plan.get("bi_features") or []),
                "features": list(plan.get("features") or []),
                "amount_paise": monthly_inr,
                "yearly_amount_paise": (
                    monthly_inr * YEARLY_PRICE_MULTIPLIER if monthly_inr is not None else None
                ),
                "prices_minor": {
                    "INR": {
                        "monthly": monthly_inr,
                        "yearly": (
                            monthly_inr * YEARLY_PRICE_MULTIPLIER if monthly_inr is not None else None
                        ),
                    },
                    "USD": {
                        "monthly": monthly_usd,
                        "yearly": (
                            monthly_usd * YEARLY_PRICE_MULTIPLIER if monthly_usd is not None else None
                        ),
                    },
                },
                "yearly_months_charged": YEARLY_PRICE_MULTIPLIER,
                "is_public": True,
            }
        )
    return result


def _serialize_row(row: Any) -> dict[str, Any]:
    from apps.billing.constants import PLAN_PRICE_USD_CENTS, YEARLY_PRICE_MULTIPLIER
    from apps.billing.services.region import normalize_prices_minor

    months = int(getattr(row, "yearly_months_charged", None) or 10)
    prices_minor = normalize_prices_minor(getattr(row, "prices_minor", None))
    if prices_minor["INR"]["monthly"] is None:
        prices_minor["INR"]["monthly"] = int(row.amount_paise or 0) or None
    if prices_minor["INR"]["yearly"] is None:
        yearly = row.yearly_amount_paise
        if yearly is not None:
            prices_minor["INR"]["yearly"] = int(yearly)
        elif prices_minor["INR"]["monthly"]:
            prices_minor["INR"]["yearly"] = int(prices_minor["INR"]["monthly"]) * months
    if prices_minor["USD"]["monthly"] is None:
        usd = PLAN_PRICE_USD_CENTS.get(str(row.code))
        if usd is not None:
            prices_minor["USD"]["monthly"] = usd
            prices_minor["USD"]["yearly"] = usd * (months or YEARLY_PRICE_MULTIPLIER)
    return {
        "id": str(row.id),
        "product_code": row.product_code,
        "code": row.code,
        "name": row.name,
        "description": row.description,
        "billing_interval": row.billing_interval,
        "trial_days": row.trial_days,
        "is_default": row.is_default,
        "max_staff": row.max_staff,
        "max_branches": row.max_branches,
        "max_extra_staff": getattr(row, "max_extra_staff", None),
        "max_extra_offices": getattr(row, "max_extra_offices", None),
        "bi_features": list(row.bi_features or []),
        "features": list(row.features or []),
        "amount_paise": row.amount_paise,
        "yearly_amount_paise": row.yearly_amount_paise,
        "prices_minor": prices_minor,
        "yearly_months_charged": months,
        "is_public": bool(row.is_public),
    }


def _db_definitions_by_product() -> dict[str, list[dict[str, Any]]]:
    from apps.platform_admin.models import PlatformPlanPackage

    by_product: dict[str, list[dict[str, Any]]] = {}
    try:
        rows = PlatformPlanPackage.objects.filter(is_active=True).order_by("product_code", "sort_order", "code")
        for row in rows:
            by_product.setdefault(row.product_code, []).append(_serialize_row(row))
    except (OperationalError, ProgrammingError):
        # Table not migrated yet (e.g. mid-migration bootstrap) — fall back to the seed catalog.
        return {}
    return by_product


def list_plan_definitions(product_code: str | None = None) -> list[dict[str, Any]]:
    """List plan definitions, preferring active PlatformPlanPackage rows over the seed catalog."""

    normalized = product_code.strip().lower() if product_code else None
    db_by_product = _db_definitions_by_product()

    if normalized:
        return db_by_product.get(normalized) or _fallback_definitions(normalized)

    product_codes = list(dict.fromkeys([*PRODUCT_PLAN_CATALOG.keys(), *db_by_product.keys()]))
    result: list[dict[str, Any]] = []
    for code in product_codes:
        result.extend(db_by_product.get(code) or _fallback_definitions(code))
    return result


def get_plan_definition_resolved(product_code: str, plan_code: str) -> dict[str, Any] | None:
    normalized_product = (product_code or "").strip().lower()
    normalized_plan = (plan_code or "").strip().lower()
    if not normalized_product or not normalized_plan:
        return None
    for definition in list_plan_definitions(normalized_product):
        if str(definition.get("code", "")).strip().lower() == normalized_plan:
            return definition
    return None


def get_default_plan_code_resolved(product_code: str) -> str | None:
    normalized_product = (product_code or "").strip().lower()
    definitions = list_plan_definitions(normalized_product)
    for definition in definitions:
        if definition.get("is_default"):
            return str(definition["code"])
    return str(definitions[0]["code"]) if definitions else None
