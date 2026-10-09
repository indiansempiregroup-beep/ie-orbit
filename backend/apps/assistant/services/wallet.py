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
DEFAULT_ASSISTANT_PRICES_MINOR = {
    "INR": {
        "message": DEFAULT_MESSAGE_PRICE_PAISE,
        "confirm": DEFAULT_CONFIRM_PRICE_PAISE,
        "top_ups": list(DEFAULT_SUGGESTED_TOP_UPS),
    },
    "USD": {
        "message": 1,
        "confirm": 2,
        "top_ups": [500, 1000, 2500, 5000],
    },
}


def get_platform_assistant_row() -> PlatformAssistantSettings:
    row, _ = PlatformAssistantSettings.objects.get_or_create(
        key="default",
        defaults={
            "enabled": True,
            "message_price_paise": DEFAULT_MESSAGE_PRICE_PAISE,
            "confirm_price_paise": DEFAULT_CONFIRM_PRICE_PAISE,
            "suggested_top_up_paise": list(DEFAULT_SUGGESTED_TOP_UPS),
            "prices_minor": dict(DEFAULT_ASSISTANT_PRICES_MINOR),
        },
    )
    return row


def _assistant_prices_minor(settings: PlatformAssistantSettings) -> dict[str, dict[str, Any]]:
    raw = getattr(settings, "prices_minor", None) or {}
    inr_raw = raw.get("INR") if isinstance(raw, dict) else None
    usd_raw = raw.get("USD") if isinstance(raw, dict) else None
    tops = settings.suggested_top_up_paise if isinstance(settings.suggested_top_up_paise, list) else []
    cleaned_inr = [int(v) for v in tops if int(v) > 0] or list(DEFAULT_SUGGESTED_TOP_UPS)
    inr = {
        "message": int(
            (inr_raw or {}).get("message")
            if isinstance(inr_raw, dict) and (inr_raw or {}).get("message") is not None
            else settings.message_price_paise
            or DEFAULT_MESSAGE_PRICE_PAISE
        ),
        "confirm": int(
            (inr_raw or {}).get("confirm")
            if isinstance(inr_raw, dict) and (inr_raw or {}).get("confirm") is not None
            else settings.confirm_price_paise
            or DEFAULT_CONFIRM_PRICE_PAISE
        ),
        "top_ups": (
            [int(v) for v in (inr_raw or {}).get("top_ups", []) if int(v) > 0]
            if isinstance(inr_raw, dict) and isinstance((inr_raw or {}).get("top_ups"), list)
            else cleaned_inr
        )
        or cleaned_inr,
    }
    usd_defaults = DEFAULT_ASSISTANT_PRICES_MINOR["USD"]
    usd = {
        "message": int(
            (usd_raw or {}).get("message")
            if isinstance(usd_raw, dict) and (usd_raw or {}).get("message") is not None
            else usd_defaults["message"]
        ),
        "confirm": int(
            (usd_raw or {}).get("confirm")
            if isinstance(usd_raw, dict) and (usd_raw or {}).get("confirm") is not None
            else usd_defaults["confirm"]
        ),
        "top_ups": (
            [int(v) for v in (usd_raw or {}).get("top_ups", []) if int(v) > 0]
            if isinstance(usd_raw, dict) and isinstance((usd_raw or {}).get("top_ups"), list)
            else list(usd_defaults["top_ups"])
        )
        or list(usd_defaults["top_ups"]),
    }
    return {"INR": inr, "USD": usd}


def serialize_platform_assistant_settings(
    row: PlatformAssistantSettings | None = None,
) -> dict[str, Any]:
    settings = row or get_platform_assistant_row()
    prices = _assistant_prices_minor(settings)
    cleaned = prices["INR"]["top_ups"]
    return {
        "enabled": bool(settings.enabled),
        "message_price_paise": int(prices["INR"]["message"]),
        "confirm_price_paise": int(prices["INR"]["confirm"]),
        "suggested_top_up_paise": cleaned,
        "suggested_top_up_inr": [round(v / 100, 2) for v in cleaned],
        "prices_minor": prices,
    }


def assistant_prices_for_currency(currency: str = "INR") -> dict[str, Any]:
    code = str(currency or "INR").strip().upper()
    if code not in {"INR", "USD"}:
        code = "INR"
    prices = _assistant_prices_minor(get_platform_assistant_row())
    return {"currency": code, **prices[code]}


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

    def message_price_paise(self, *, currency: str = "INR") -> int:
        prices = assistant_prices_for_currency(currency)
        return max(1, int(prices["message"]))

    def confirm_price_paise(self, *, currency: str = "INR") -> int:
        prices = assistant_prices_for_currency(currency)
        return max(1, int(prices["confirm"]))

    def wallet_snapshot(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        from apps.billing.services.region import saas_currency_for_business

        wallet = self.ensure_wallet(tenant=tenant, business=business)
        settings = serialize_platform_assistant_settings()
        currency = saas_currency_for_business(business)
        prices = assistant_prices_for_currency(currency)
        balance = int(wallet.balance_paise)
        tops = list(prices["top_ups"])
        return {
            "currency": currency,
            "balance_paise": balance,
            "balance_inr": round(balance / 100, 2),
            "balance_major": round(balance / 100, 2),
            "overage_enabled": bool(settings["enabled"]),
            "message_price_paise": int(prices["message"]),
            "confirm_price_paise": int(prices["confirm"]),
            "suggested_top_up_paise": tops,
            "suggested_top_up_inr": [round(v / 100, 2) for v in tops],
            "suggested_top_up_major": [round(v / 100, 2) for v in tops],
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

    @transaction.atomic
    def clawback_wallet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        reason: str = "refund",
        metadata: dict[str, Any] | None = None,
    ) -> tuple[AssistantWallet, int]:
        """Debit up to amount_paise from the wallet. Returns (wallet, clawed_paise)."""
        wanted = max(0, int(amount_paise or 0))
        wallet = self.ensure_wallet(tenant=tenant, business=business)
        wallet = AssistantWallet.objects.select_for_update().get(pk=wallet.pk)
        clawed = min(wanted, max(0, int(wallet.balance_paise)))
        if clawed <= 0:
            return wallet, 0
        wallet.balance_paise = int(wallet.balance_paise) - clawed
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
        meta = dict(metadata or {})
        meta.setdefault("reason", reason)
        AssistantWalletLedger.objects.create(
            tenant=tenant,
            business=business,
            source="refund_clawback",
            charged_paise=clawed,
            balance_after_paise=int(wallet.balance_paise),
            metadata=meta,
        )
        return wallet, clawed

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
