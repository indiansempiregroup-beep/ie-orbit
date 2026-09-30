from __future__ import annotations

from typing import Any, Callable

ConditionHandler = Callable[[dict[str, Any], dict[str, Any]], bool]
ActionHandler = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]

_CONDITIONS: dict[str, ConditionHandler] = {}
_ACTIONS: dict[str, ActionHandler] = {}


def register_condition(key: str):
    def decorator(fn: ConditionHandler) -> ConditionHandler:
        _CONDITIONS[key] = fn
        return fn

    return decorator


def register_action(key: str):
    def decorator(fn: ActionHandler) -> ActionHandler:
        _ACTIONS[key] = fn
        return fn

    return decorator


def get_condition(key: str) -> ConditionHandler | None:
    return _CONDITIONS.get(key)


def get_action(key: str) -> ActionHandler | None:
    return _ACTIONS.get(key)


def known_conditions() -> list[str]:
    return sorted(_CONDITIONS.keys())


def known_actions() -> list[str]:
    return sorted(_ACTIONS.keys())


def actions_for_product(product_code: str) -> list[str]:
    code = (product_code or "").strip().lower()
    mart_only = {"discount.offer", "coupon.ensure"}
    appoint_only = {"offer.staff_hint"}
    shared = {
        "notify.staff",
        "notify.customer",
    }
    if code == "shopie":
        return sorted(shared | mart_only)
    if code == "appointie":
        return sorted(shared | appoint_only)
    return sorted(shared | mart_only | appoint_only)
