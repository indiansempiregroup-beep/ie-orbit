from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from apps.workflow.services.handlers import (
    customer_birthday_today,
    customer_has_tag,
    discount_offer,
    offer_staff_hint,
    pet_birthday_today,
)
from apps.workflow.services.registry import actions_for_product, known_actions, known_conditions
from apps.workflow.services.schema import validate_workflow_payload
from rest_framework.exceptions import ValidationError


def test_registry_loads_handlers():
    # Import side-effect registration
    import apps.workflow.services.handlers  # noqa: F401

    assert "customer.birthday_today" in known_conditions()
    assert "discount.offer" in known_actions()
    assert "discount.offer" in actions_for_product("shopie")
    assert "discount.offer" not in actions_for_product("appointie")
    assert "offer.staff_hint" in actions_for_product("appointie")


def test_validate_rejects_mart_action_on_appoint():
    import apps.workflow.services.handlers  # noqa: F401

    with pytest.raises(ValidationError):
        validate_workflow_payload(
            data={
                "name": "Bad",
                "trigger": {"type": "booking.quote"},
                "conditions": [],
                "actions": [{"type": "discount.offer", "discount_value": "10"}],
            },
            product_code="appointie",
        )


def test_coerce_maps_mart_actions_for_appoint_refine():
    from apps.workflow.services.gemini_creator import _coerce_for_product, _merge_draft

    prior = {
        "name": "Pet birthday",
        "trigger": {"type": "booking.quote"},
        "conditions": [{"type": "pet.birthday_today"}],
        "actions": [
            {
                "type": "offer.staff_hint",
                "discount_type": "percent",
                "discount_value": "15",
                "label": "Pet birthday",
            }
        ],
    }
    incoming = {
        "name": "Pet birthday",
        "trigger": {"type": "booking.quote"},
        "conditions": [{"type": "pet.birthday_today"}],
        "actions": [
            {
                "type": "discount.offer",
                "discount_type": "percent",
                "discount_value": "10",
                "label": "Pet birthday",
            },
            {"type": "coupon.ensure", "code": "PETBDAY"},
            {"type": "notify.customer"},
        ],
    }
    coerced = _coerce_for_product(_merge_draft(prior, incoming), product_code="appointie")
    validated = validate_workflow_payload(data=coerced, product_code="appointie")
    types = [a["type"] for a in validated["actions"]]
    assert types == ["offer.staff_hint", "notify.customer"]
    assert validated["actions"][0]["discount_value"] == "10"


def test_flatten_nested_parameters_and_percent_message():
    from apps.workflow.services.schema import flatten_step_params

    step = flatten_step_params(
        {
            "type": "offer.staff_hint",
            "parameters": {"message": "15% discount on bills for POS and Online orders"},
        }
    )
    assert step["type"] == "offer.staff_hint"
    assert step["discount_type"] == "percent"
    assert step["discount_value"] == "15"
    assert "15%" in step["label"] or "discount" in step["label"].lower()


def test_condition_customer_birthday_and_tag():
    from datetime import date

    customer = SimpleNamespace(
        date_of_birth=date.today(),
        tags=["VIP", "local"],
    )
    assert customer_birthday_today({}, {"customer": customer, "today": date.today()})
    assert customer_has_tag({"tag": "vip"}, {"customer": customer})
    assert not customer_has_tag({"tag": "gold"}, {"customer": customer})


def test_condition_pet_birthday():
    from datetime import date

    pet = SimpleNamespace(birthday=date.today(), name="Bruno")
    assert pet_birthday_today({}, {"pet": pet, "today": date.today()})


def test_discount_and_staff_hint_actions():
    ctx: dict = {"offers": [], "staff_hints": [], "workflow_id": "abc", "workflow_name": "Test"}
    offer = discount_offer(
        {"discount_type": "percent", "discount_value": "15", "label": "Bday"},
        ctx,
    )
    assert offer["ok"] is True
    assert offer["discount_value"] == "15.00"
    assert len(ctx["offers"]) == 1

    hint = offer_staff_hint(
        {"discount_type": "percent", "discount_value": Decimal("10"), "label": "VIP"},
        ctx,
    )
    assert hint["ok"] is True
    assert len(ctx["staff_hints"]) == 1


def test_resolve_automation_product_prefers_mart_for_pos_prompt():
    from apps.workflow.services.access import _MART_INTENT, _APPOINT_INTENT

    assert _MART_INTENT.search("15% off at POS and Online orders")
    assert _MART_INTENT.search("It should be for Orbit Mart")
    assert _APPOINT_INTENT.search("booking staff hint for Orbit Appoint")
