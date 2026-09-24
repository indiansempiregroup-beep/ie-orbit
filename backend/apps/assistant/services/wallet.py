from __future__ import annotations

from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.assistant.models import AssistantWallet, AssistantWalletLedger
from apps.businesses.models import Business
from apps.platform_admin.models import PlatformAssistantSettings
from apps.tenancy.models import Tenant

DEFAULT_SUGGESTED_TOP_UPS = [5000, 10000, 25000, 50000]
DEFAULT_MESSAGE_PRICE_PAISE = 50
DEFAULT_CONFIRM_PRICE_PAISE = 100


def get_platform_assistant_row() -> PlatformAssistantSettings:
    row, _ = PlatformAssistantSettings.objects.get_or_create(
        key="default",
        defaults={
            "enabled": True,
            "message_price_paise": DEFAULT_MESSAGE_PRICE_PAISE,
            "confirm_price_paise": DEFAULT_CONFIRM_PRICE_PAISE,
            "suggested_top_up_paise": list(DEFAULT_SUGGESTED_TOP_UPS),
        },
    )
    return row


def serialize_platform_assistant_settings(
    row: PlatformAssistantSettings | None = None,
) -> dict[str, Any]:
    settings = row or get_platform_assistant_row()
    tops = settings.suggested_top_up_paise if isinstance(settings.suggested_top_up_paise, list) else []
    cleaned = [int(v) for v in tops if int(v) > 0] or list(DEFAULT_SUGGESTED_TOP_UPS)
    return {
        "enabled": bool(settings.enabled),
        "message_price_paise": int(settings.message_price_paise),
        "confirm_price_paise": int(settings.confirm_price_paise),
        "suggested_top_up_paise": cleaned,
        "suggested_top_up_inr": [round(v / 100, 2) for v in cleaned],
    }


def serialize_ledger_row(row: AssistantWalletLedger) -> dict[str, Any]:
    charged = int(row.charged_paise or 0)
    if charged < 0 or row.source == "wallet_top_up":
        entry_type = "credit"
    elif charged > 0:
        entry_type = "debit"
    else:
        entry_type = "other"
    return {
        "id": str(row.id),
        "source": row.source,
        "entry_type": entry_type,
        "charged_paise": charged,
        "charged_inr": round(charged / 100, 2),
        "balance_after_paise": row.balance_after_paise,
        "balance_after_inr": (
            round(int(row.balance_after_paise) / 100, 2) if row.balance_after_paise is not None else None
        ),
        "metadata": row.metadata or {},
        "created_at": row.created_at.isoformat(),
    }


class AssistantWalletService:
    def ensure_wallet(self, *, tenant: Tenant, business: Business) -> AssistantWallet:
        wallet, _ = AssistantWallet.objects.get_or_create(
            tenant=tenant,
            business=business,
            defaults={"balance_paise": 0},
        )
        return wallet

    def platform_overage_enabled(self) -> bool:
        return bool(get_platform_assistant_row().enabled)

    def message_price_paise(self) -> int:
        return max(1, int(get_platform_assistant_row().message_price_paise or DEFAULT_MESSAGE_PRICE_PAISE))

    def confirm_price_paise(self) -> int:
        return max(1, int(get_platform_assistant_row().confirm_price_paise or DEFAULT_CONFIRM_PRICE_PAISE))

    def wallet_snapshot(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        settings = serialize_platform_assistant_settings()
        balance = int(wallet.balance_paise)
        return {
            "balance_paise": balance,
            "balance_inr": round(balance / 100, 2),
            "overage_enabled": bool(settings["enabled"]),
            "message_price_paise": int(settings["message_price_paise"]),
            "confirm_price_paise": int(settings["confirm_price_paise"]),
            "suggested_top_up_paise": settings["suggested_top_up_paise"],
            "suggested_top_up_inr": settings["suggested_top_up_inr"],
        }

    @transaction.atomic
    def credit_wallet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        reason: str = "top_up",
    ) -> AssistantWallet:
        if amount_paise <= 0:
            raise ValueError("Top-up amount must be positive.")
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        wallet = AssistantWallet.objects.select_for_update().get(pk=wallet.pk)
        wallet.balance_paise = int(wallet.balance_paise) + int(amount_paise)
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
        AssistantWalletLedger.objects.create(
            tenant=tenant,
            business=business,
            source="wallet_top_up",
            charged_paise=-int(amount_paise),
            balance_after_paise=int(wallet.balance_paise),
            metadata={"reason": reason},
        )
        return wallet

    @transaction.atomic
    def debit_wallet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        source: str,
        metadata: dict[str, Any] | None = None,
    ) -> AssistantWallet:
        amount = int(amount_paise or 0)
        if amount <= 0:
            raise ValidationError({"detail": "Debit amount must be positive."})
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        wallet = AssistantWallet.objects.select_for_update().get(pk=wallet.pk)
        if int(wallet.balance_paise) < amount:
            raise ValidationError(
                {
                    "code": "assistant_no_balance",
                    "detail": (
                        "Free Assistant limit used and wallet balance is too low. "
                        "Top up to continue."
                    ),
                }
            )
        wallet.balance_paise = int(wallet.balance_paise) - amount
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
        AssistantWalletLedger.objects.create(
            tenant=tenant,
            business=business,
            source=source,
            charged_paise=amount,
            balance_after_paise=int(wallet.balance_paise),
            metadata=metadata or {},
        )
        return wallet

    def wallet_history(
        self,
        *,
        tenant: Tenant,
        business: Business,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = min(100, max(1, int(page_size or 20)))
        qs = AssistantWalletLedger.objects.require_tenant(tenant).filter(business=business)
        total = qs.count()
        start = (page - 1) * page_size
        rows = list(qs.order_by("-created_at")[start : start + page_size])
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "results": [serialize_ledger_row(row) for row in rows],
        }
