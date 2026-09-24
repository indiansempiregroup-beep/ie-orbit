from __future__ import annotations

from django.db.models import F
from django.utils import timezone

from apps.assistant.models import AssistantUsageDaily
from apps.assistant.services.access import (
    assistant_daily_confirm_limit,
    assistant_daily_message_limit,
)
from apps.assistant.services.wallet import AssistantWalletService
from apps.businesses.models import Business
from apps.tenancy.models import Tenant


def _today():
    return timezone.localdate()


def get_or_create_usage(*, tenant: Tenant, business: Business) -> AssistantUsageDaily:
    usage, _ = AssistantUsageDaily.objects.get_or_create(
        tenant=tenant,
        business=business,
        usage_date=_today(),
        defaults={"message_count": 0, "confirm_count": 0},
    )
    return usage


def increment_message_usage(*, tenant: Tenant, business: Business) -> AssistantUsageDaily:
    usage = get_or_create_usage(tenant=tenant, business=business)
    AssistantUsageDaily.objects.filter(id=usage.id).update(message_count=F("message_count") + 1)
    usage.refresh_from_db(fields=["message_count", "confirm_count"])
    return usage


def increment_confirm_usage(*, tenant: Tenant, business: Business) -> AssistantUsageDaily:
    usage = get_or_create_usage(tenant=tenant, business=business)
    AssistantUsageDaily.objects.filter(id=usage.id).update(confirm_count=F("confirm_count") + 1)
    usage.refresh_from_db(fields=["message_count", "confirm_count"])
    return usage


def usage_snapshot(*, tenant: Tenant, business: Business) -> dict:
    usage = get_or_create_usage(tenant=tenant, business=business)
    message_limit = assistant_daily_message_limit()
    confirm_limit = assistant_daily_confirm_limit()
    messages_remaining = max(0, message_limit - usage.message_count)
    confirms_remaining = max(0, confirm_limit - usage.confirm_count)

    wallet_svc = AssistantWalletService()
    wallet = wallet_svc.wallet_snapshot(tenant=tenant, business=business)
    balance = int(wallet["balance_paise"])
    overage_enabled = bool(wallet["overage_enabled"])
    message_price = int(wallet["message_price_paise"])
    confirm_price = int(wallet["confirm_price_paise"])

    can_send = messages_remaining > 0 or (overage_enabled and balance >= message_price)
    can_confirm = confirms_remaining > 0 or (overage_enabled and balance >= confirm_price)
    using_prepaid_messages = messages_remaining <= 0 and can_send
    using_prepaid_confirms = confirms_remaining <= 0 and can_confirm

    return {
        "usage_date": usage.usage_date.isoformat(),
        "message_count": usage.message_count,
        "confirm_count": usage.confirm_count,
        "message_limit": message_limit,
        "confirm_limit": confirm_limit,
        "messages_remaining": messages_remaining,
        "confirms_remaining": confirms_remaining,
        "balance_paise": balance,
        "balance_inr": wallet["balance_inr"],
        "overage_enabled": overage_enabled,
        "message_price_paise": message_price,
        "confirm_price_paise": confirm_price,
        "suggested_top_up_paise": wallet["suggested_top_up_paise"],
        "suggested_top_up_inr": wallet["suggested_top_up_inr"],
        "can_send": can_send,
        "can_confirm": can_confirm,
        "using_prepaid_messages": using_prepaid_messages,
        "using_prepaid_confirms": using_prepaid_confirms,
    }
