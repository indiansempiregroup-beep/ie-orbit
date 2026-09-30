from __future__ import annotations

import re
from typing import Any

from rest_framework.exceptions import ValidationError

from apps.businesses.constants import PRODUCT_APPOINTIE, PRODUCT_SHOPIE
from apps.workflow.services.registry import actions_for_product, known_conditions

ALLOWED_TRIGGERS = {
    "schedule.daily",
    "checkout.quote",
    "booking.quote",
    "calendar.date",
}


def flatten_step_params(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize Gemini-style `{type, parameters:{...}}` into a flat step dict."""
    if not isinstance(raw, dict):
        return {}
    nested = raw.get("parameters") if isinstance(raw.get("parameters"), dict) else {}
    flat = {**nested, **{k: v for k, v in raw.items() if k not in {"type", "parameters"}}}
    atype = str(raw.get("type") or "").strip()
    # Recover percent offers stored only as prose in `message`.
    if atype in {"offer.staff_hint", "discount.offer"}:
        if not flat.get("discount_value"):
            message = str(flat.get("message") or flat.get("body") or flat.get("label") or "")
            match = re.search(r"(\d+(?:\.\d+)?)\s*%", message)
            if match:
                flat["discount_type"] = flat.get("discount_type") or "percent"
                flat["discount_value"] = match.group(1)
        if not flat.get("label"):
            flat["label"] = str(flat.get("message") or "Special offer").strip()[:80] or "Special offer"
    return {"type": atype, **flat} if atype else flat


def validate_workflow_payload(
    *,
    data: dict[str, Any],
    product_code: str,
) -> dict[str, Any]:
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValidationError({"name": "Name is required."})
    if len(name) > 160:
        raise ValidationError({"name": "Name is too long."})

    product = (product_code or str(data.get("product_code") or "")).strip().lower()
    if product not in {PRODUCT_APPOINTIE, PRODUCT_SHOPIE}:
        raise ValidationError({"product_code": "product_code must be appointie or shopie."})

    trigger = data.get("trigger") or {}
    if not isinstance(trigger, dict):
        raise ValidationError({"trigger": "Trigger must be an object."})
    trigger_type = str(trigger.get("type") or "").strip()
    if trigger_type not in ALLOWED_TRIGGERS:
        raise ValidationError(
            {"trigger": f"Unsupported trigger type. Allowed: {sorted(ALLOWED_TRIGGERS)}"}
        )

    conditions = data.get("conditions") or []
    if not isinstance(conditions, list):
        raise ValidationError({"conditions": "Conditions must be a list."})
    allowed_conditions = set(known_conditions())
    normalized_conditions: list[dict[str, Any]] = []
    for idx, raw in enumerate(conditions):
        if not isinstance(raw, dict):
            raise ValidationError({"conditions": f"Condition {idx} must be an object."})
        step = flatten_step_params(raw)
        ctype = str(step.get("type") or "").strip()
        if ctype and ctype not in allowed_conditions:
            raise ValidationError({"conditions": f"Unknown condition type: {ctype}"})
        if ctype:
            normalized_conditions.append(step)

    actions = data.get("actions") or []
    if not isinstance(actions, list) or not actions:
        raise ValidationError({"actions": "At least one action is required."})
    allowed_actions = set(actions_for_product(product))
    normalized_actions: list[dict[str, Any]] = []
    for idx, raw in enumerate(actions):
        if not isinstance(raw, dict):
            raise ValidationError({"actions": f"Action {idx} must be an object."})
        step = flatten_step_params(raw)
        atype = str(step.get("type") or "").strip()
        if atype not in allowed_actions:
            raise ValidationError(
                {
                    "actions": (
                        f"Action '{atype}' is not allowed for {product}. "
                        f"Allowed: {sorted(allowed_actions)}"
                    )
                }
            )
        normalized_actions.append(step)

    return {
        "name": name,
        "description": str(data.get("description") or "").strip(),
        "product_code": product,
        "trigger": {"type": trigger_type, **{k: v for k, v in trigger.items() if k != "type"}},
        "conditions": normalized_conditions,
        "actions": normalized_actions,
        "metadata": data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
    }
