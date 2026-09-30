from __future__ import annotations

import re

from apps.businesses.constants import (
    DEFAULT_PRODUCT_CODE,
    FEATURE_AUTOMATIONS,
    PRODUCT_APPOINTIE,
    PRODUCT_SHOPIE,
)
from apps.businesses.models import Business, BusinessProductSubscriptionStatus
from apps.businesses.services.entitlements import EntitlementService
from rest_framework.exceptions import PermissionDenied

_MART_INTENT = re.compile(
    r"\b(pos|online\s+order|orbit\s+mart|shopie|counter|checkout|bill)\b",
    re.I,
)
_APPOINT_INTENT = re.compile(
    r"\b(orbit\s+appoint|appointie|booking|appointment|salon|staff\s+hint)\b",
    re.I,
)


def has_automations(*, business: Business) -> bool:
    return FEATURE_AUTOMATIONS in EntitlementService().entitled_features(business=business)


def ensure_automations(*, business: Business) -> None:
    if not has_automations(business=business):
        raise PermissionDenied(
            "Automations are not included in the current plan. "
            "Ask your platform admin to enable Automations on the plan package."
        )


def active_product_codes(*, business: Business) -> list[str]:
    skip = {BusinessProductSubscriptionStatus.CANCELED}
    codes: list[str] = []
    for sub in business.product_subscriptions.exclude(status__in=skip).order_by("created_at"):
        code = str(sub.product_code or "").strip().lower()
        if code and code not in codes:
            codes.append(code)
    return codes


def resolve_product_code(*, business: Business) -> str:
    """Prefer the owner's selected product when they still subscribe to it."""
    available = active_product_codes(business=business)
    selected = str(getattr(business, "selected_product", "") or "").strip().lower()
    if selected in available:
        return selected
    if available:
        return available[0]
    return DEFAULT_PRODUCT_CODE


def resolve_automation_product_code(*, business: Business, prompt: str = "") -> str:
    """
    Pick Mart vs Appoint for automation creation.

    POS / online / Orbit Mart wording wins when Mart is subscribed.
    Appoint wording wins when Appoint is subscribed.
    Otherwise fall back to the business selected product.
    """
    available = set(active_product_codes(business=business))
    text = prompt or ""
    if _MART_INTENT.search(text) and PRODUCT_SHOPIE in available:
        return PRODUCT_SHOPIE
    if _APPOINT_INTENT.search(text) and PRODUCT_APPOINTIE in available:
        return PRODUCT_APPOINTIE
    return resolve_product_code(business=business)
