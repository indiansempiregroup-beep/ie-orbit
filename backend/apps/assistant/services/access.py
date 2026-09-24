from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.assistant.services.wallet import AssistantWalletService
from apps.businesses.constants import (
    FEATURE_APPOINTIE_AI_ASSISTANT,
    FEATURE_SHOPIE_AI_ASSISTANT,
    PRODUCT_APPOINTIE,
    PRODUCT_SHOPIE,
)
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.feature_flags import AI_ASSISTANT_FLAG, tenant_feature_enabled
from apps.tenancy.models import Tenant


@dataclass(frozen=True)
class AssistantAccess:
    mart_enabled: bool
    appoint_enabled: bool

    @property
    def any_enabled(self) -> bool:
        return self.mart_enabled or self.appoint_enabled


def assistant_daily_message_limit() -> int:
    raw = (os.environ.get("ASSISTANT_DAILY_MESSAGE_LIMIT") or "50").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 50


def assistant_daily_confirm_limit() -> int:
    raw = (os.environ.get("ASSISTANT_DAILY_CONFIRM_LIMIT") or "25").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 25


def assistant_brain_name() -> str:
    value = (os.environ.get("ASSISTANT_BRAIN") or "rules").strip().lower()
    return value or "rules"


def resolve_assistant_access(*, business: Business) -> AssistantAccess:
    if not tenant_feature_enabled(tenant=business.tenant, key=AI_ASSISTANT_FLAG, default=True):
        return AssistantAccess(mart_enabled=False, appoint_enabled=False)
    entitlements = EntitlementService()
    return AssistantAccess(
        mart_enabled=entitlements.has_feature(
            business=business,
            feature=FEATURE_SHOPIE_AI_ASSISTANT,
            product_code=PRODUCT_SHOPIE,
        ),
        appoint_enabled=entitlements.has_feature(
            business=business,
            feature=FEATURE_APPOINTIE_AI_ASSISTANT,
            product_code=PRODUCT_APPOINTIE,
        ),
    )


def ensure_assistant_access(*, business: Business) -> AssistantAccess:
    access = resolve_assistant_access(business=business)
    if not access.any_enabled:
        raise PermissionDenied("Business Assistant is not enabled for this workspace.")
    return access


def ensure_message_quota(*, business: Business, used: int) -> None:
    """Legacy free-only gate. Prefer consume_message_quota for prepaid fallback."""
    limit = assistant_daily_message_limit()
    if used >= limit:
        raise ValidationError(
            {"detail": f"Daily free Assistant limit reached ({limit} messages). Try again tomorrow."}
        )


def ensure_confirm_quota(*, business: Business, used: int) -> None:
    """Legacy free-only gate. Prefer consume_confirm_quota for prepaid fallback."""
    limit = assistant_daily_confirm_limit()
    if used >= limit:
        raise ValidationError(
            {"detail": f"Daily free Assistant confirm limit reached ({limit}). Try again tomorrow."}
        )


def _raise_no_balance(*, kind: Literal["message", "confirm"], free_limit: int) -> None:
    label = "messages" if kind == "message" else "confirms"
    raise ValidationError(
        {
            "code": "assistant_no_balance",
            "detail": (
                f"Daily free Assistant limit reached ({free_limit} {label}) and wallet balance "
                "is too low. Top up to continue."
            ),
        }
    )


def consume_message_quota(*, tenant: Tenant, business: Business, used: int) -> Literal["free", "wallet"]:
    """Allow a message from free daily quota or prepaid wallet debit."""
    limit = assistant_daily_message_limit()
    if used < limit:
        return "free"

    wallet = AssistantWalletService()
    if not wallet.platform_overage_enabled():
        raise ValidationError(
            {
                "code": "assistant_no_balance",
                "detail": f"Daily free Assistant limit reached ({limit} messages). Try again tomorrow.",
            }
        )
    price = wallet.message_price_paise()
    balance = int(wallet.ensure_wallet(tenant=tenant, business=business).balance_paise)
    if balance < price:
        _raise_no_balance(kind="message", free_limit=limit)
    wallet.debit_wallet(
        tenant=tenant,
        business=business,
        amount_paise=price,
        source="message",
        metadata={"unit_price_paise": price},
    )
    return "wallet"


def consume_confirm_quota(*, tenant: Tenant, business: Business, used: int) -> Literal["free", "wallet"]:
    """Allow a confirm from free daily quota or prepaid wallet debit."""
    limit = assistant_daily_confirm_limit()
    if used < limit:
        return "free"

    wallet = AssistantWalletService()
    if not wallet.platform_overage_enabled():
        raise ValidationError(
            {
                "code": "assistant_no_balance",
                "detail": f"Daily free Assistant confirm limit reached ({limit}). Try again tomorrow.",
            }
        )
    price = wallet.confirm_price_paise()
    balance = int(wallet.ensure_wallet(tenant=tenant, business=business).balance_paise)
    if balance < price:
        _raise_no_balance(kind="confirm", free_limit=limit)
    wallet.debit_wallet(
        tenant=tenant,
        business=business,
        amount_paise=price,
        source="confirm",
        metadata={"unit_price_paise": price},
    )
    return "wallet"
