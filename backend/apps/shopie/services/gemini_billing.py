"""Bill Gemini calls from the token counts Google returns on each response.

One prepaid AI wallet (SmartLookupWallet) covers pack-photo fill, invoice scan,
and automation drafts. The debit is the configured token price, optional markup,
FX, and GST — the same formula for every call. Thinking tokens are billed as
output, because Gemini invoices them that way. When several attempts run, the
caller passes the summed counts. A short wallet still pays the full amount
(balance may go negative) so the next call stays blocked until the owner tops up.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Business
from apps.shopie.models import SmartLookupUsage, SmartLookupWallet
from apps.tenancy.models import Tenant


def empty_usage() -> dict[str, int]:
    return {"input_tokens": 0, "output_tokens": 0}


def add_usage(total: dict[str, int], extra: dict[str, Any] | None) -> dict[str, int]:
    extra = extra or {}
    total["input_tokens"] = int(total.get("input_tokens") or 0) + int(extra.get("input_tokens") or 0)
    total["output_tokens"] = int(total.get("output_tokens") or 0) + int(extra.get("output_tokens") or 0)
    return total


def usage_from_gemini_payload(payload: dict[str, Any] | None) -> dict[str, int]:
    """Input = prompt tokens. Output = answer tokens + thinking tokens.

    Some models only expose thinking as totalTokenCount minus prompt and candidates.
    That gap is billed as output so the wallet matches the Gemini invoice.
    """
    meta = (payload or {}).get("usageMetadata") or {}
    prompt = max(0, int(meta.get("promptTokenCount") or 0))
    candidates = max(0, int(meta.get("candidatesTokenCount") or 0))
    thoughts = max(0, int(meta.get("thoughtsTokenCount") or 0))
    total = max(0, int(meta.get("totalTokenCount") or 0))
    output = candidates + thoughts
    gap = total - prompt - candidates - thoughts
    if gap > 0:
        output += gap
    return {"input_tokens": prompt, "output_tokens": output}


def charge_phrase(charged_paise: int, currency: str) -> str:
    amount = int(charged_paise or 0)
    if amount <= 0:
        return ""
    symbol = "$" if str(currency or "INR").strip().upper() == "USD" else "₹"
    return f"{symbol}{amount / 100:.2f} charged to your AI wallet."


def quote_gemini_minor(
    input_tokens: int,
    output_tokens: int,
    *,
    platform: Any | None = None,
    currency: str = "INR",
) -> tuple[int, int]:
    from apps.shopie.services.smart_lookup import (
        get_platform_smart_lookup_row,
        smart_lookup_prices_for_currency,
    )

    settings = platform or get_platform_smart_lookup_row()
    code = str(currency or "INR").strip().upper()
    if code not in {"INR", "USD"}:
        code = "INR"
    input_rate = Decimal(str(settings.input_usd_per_million or "0.10"))
    output_rate = Decimal(str(settings.output_usd_per_million or "0.40"))
    fx = Decimal(str(settings.usd_to_inr or "85"))
    currency_prices = smart_lookup_prices_for_currency(code, row=settings)
    min_debit = max(0, int(currency_prices["min_charge"] or 0))
    markup_bps = max(0, int(settings.markup_bps or 0))
    gst_percent = Decimal(str(getattr(settings, "gst_percent", None) or "0"))
    if gst_percent < 0:
        gst_percent = Decimal("0")

    usd = (Decimal(input_tokens) / Decimal(1_000_000)) * input_rate + (
        Decimal(output_tokens) / Decimal(1_000_000)
    ) * output_rate
    if markup_bps:
        usd = usd * (Decimal(1) + Decimal(markup_bps) / Decimal(10_000))
    usd_micros = int((usd * Decimal(1_000_000)).to_integral_value(rounding=ROUND_HALF_UP))
    if code == "USD":
        minor = int((usd * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP))
    else:
        inr = usd * fx
        if gst_percent:
            inr = inr * (Decimal(1) + gst_percent / Decimal(100))
        minor = int((inr * Decimal(100)).to_integral_value(rounding=ROUND_HALF_UP))
    if (input_tokens or output_tokens) and minor < max(1, min_debit):
        minor = max(1, min_debit)
    return minor, usd_micros


def ensure_gemini_prepaid(*, tenant: Tenant, business: Business) -> None:
    """Block a new Gemini call when the platform switch is off or the wallet cannot cover the minimum."""
    from apps.billing.services.region import saas_currency_for_business
    from apps.shopie.services.smart_lookup import (
        SmartLookupService,
        get_platform_smart_lookup_row,
        smart_lookup_prices_for_currency,
    )

    platform = get_platform_smart_lookup_row()
    if not platform.enabled:
        raise ValidationError({"prompt": "AI wallet lookups are temporarily unavailable."})
    currency = saas_currency_for_business(business)
    prices = smart_lookup_prices_for_currency(currency, row=platform)
    min_debit = max(1, int(prices["min_charge"] or 1))
    wallet = SmartLookupService().ensure_wallet(tenant=tenant, business=business)
    if int(wallet.balance_paise) < min_debit:
        raise ValidationError(
            {
                "code": "smart_lookup_no_balance",
                "prompt": "Add AI wallet balance under Products & billing, then try again.",
            }
        )


@transaction.atomic
def settle_gemini_usage(
    *,
    tenant: Tenant,
    business: Business,
    source: str,
    found: bool,
    code: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    model: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Debit actual token cost. Zero tokens write a free ledger row and do not touch the balance."""
    from apps.billing.services.region import saas_currency_for_business
    from apps.shopie.services.smart_lookup import SmartLookupService, get_platform_smart_lookup_row

    platform = get_platform_smart_lookup_row()
    currency = saas_currency_for_business(business)
    charged_paise, usd_micros = quote_gemini_minor(
        int(input_tokens or 0),
        int(output_tokens or 0),
        platform=platform,
        currency=currency,
    )
    wallet = SmartLookupService().ensure_wallet(tenant=tenant, business=business)
    wallet = SmartLookupWallet.objects.select_for_update().get(pk=wallet.pk)
    if charged_paise:
        wallet.balance_paise = int(wallet.balance_paise) - int(charged_paise)
        wallet.save(update_fields=["balance_paise", "updated_at", "version"])
    meta = dict(metadata or {})
    meta.setdefault("markup_bps", int(platform.markup_bps))
    meta.setdefault("currency", currency)
    usage_row = SmartLookupUsage.objects.create(
        tenant=tenant,
        business=business,
        code=(code or "")[:64],
        source=source,
        found=bool(found),
        charged_paise=int(charged_paise),
        balance_after_paise=int(wallet.balance_paise),
        input_tokens=max(0, int(input_tokens or 0)),
        output_tokens=max(0, int(output_tokens or 0)),
        usd_micros=max(0, int(usd_micros)),
        model=model or "",
        metadata=meta,
    )
    phrase = charge_phrase(charged_paise, currency)
    if charged_paise and int(wallet.balance_paise) < 0:
        phrase = f"{phrase} Top up under Products & billing before the next AI action."
    return {
        "charged_paise": int(charged_paise),
        "usd_micros": int(usd_micros),
        "balance_after_paise": int(wallet.balance_paise),
        "charge_currency": currency,
        "usage_id": str(usage_row.id),
        "message": phrase,
    }
