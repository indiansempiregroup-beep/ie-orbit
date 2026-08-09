from __future__ import annotations

from typing import Any

from django.db.utils import OperationalError, ProgrammingError

from apps.businesses.constants import PRODUCT_PLAN_CATALOG


def _fallback_definitions(product_code: str) -> list[dict[str, Any]]:
    plans = PRODUCT_PLAN_CATALOG.get(product_code, [])
    return [
        {
            "product_code": product_code,
            "code": str(plan["code"]),
            "name": str(plan.get("name", plan["code"])),
            "description": str(plan.get("description", "")),
            "billing_interval": str(plan.get("billing_interval", "monthly")),
            "trial_days": int(plan.get("trial_days", 0) or 0),
            "is_default": bool(plan.get("is_default", False)),
            "max_staff": int(plan.get("max_staff", 1) or 1),
            "max_branches": int(plan.get("max_branches", 1) or 1),
            "bi_features": list(plan.get("bi_features") or []),
            "features": list(plan.get("features") or []),
        }
        for plan in plans
    ]


def _serialize_row(row: Any) -> dict[str, Any]:
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
        "bi_features": list(row.bi_features or []),
        "features": list(row.features or []),
        "amount_paise": row.amount_paise,
        "yearly_amount_paise": row.yearly_amount_paise,
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
