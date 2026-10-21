import json
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.shopie.models import SmartLookupUsage, SmartLookupWallet
from apps.shopie.services.gemini_billing import usage_from_gemini_payload


def test_usage_counts_thinking_tokens_hidden_in_the_total() -> None:
    usage = usage_from_gemini_payload(
        {
            "usageMetadata": {
                "promptTokenCount": 40,
                "candidatesTokenCount": 30,
                "totalTokenCount": 100,
            }
        }
    )
    assert usage == {"input_tokens": 40, "output_tokens": 60}


class _Platform:
    enabled = True
    markup_bps = 0
    input_usd_per_million = Decimal("0.10")
    output_usd_per_million = Decimal("0.40")
    usd_to_inr = Decimal("85")
    gst_percent = Decimal("0")


def _patch_rates(monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services import smart_lookup as smart_mod

    monkeypatch.setattr(smart_mod, "get_platform_smart_lookup_row", lambda: _Platform())
    monkeypatch.setattr(
        smart_mod,
        "smart_lookup_prices_for_currency",
        lambda *args, **kwargs: {"min_charge": 1},
    )


@pytest.mark.django_db
def test_failed_invoice_scan_still_charges_reported_tokens(
    shop_business, monkeypatch: pytest.MonkeyPatch
) -> None:
    from apps.shopie.services import smart_lookup as smart_mod

    SmartLookupWallet.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        balance_paise=500,
    )
    _patch_rates(monkeypatch)
    monkeypatch.setattr(
        smart_mod.SmartLookupService,
        "_call_invoice_gemini",
        lambda self, **kwargs: {
            "ok": False,
            "error": "Could not read that invoice photo.",
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        },
    )
    result = smart_mod.SmartLookupService().invoice_vision(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/bill.jpg"],
    )
    assert result["ok"] is False
    assert result["charged_paise"] > 0
    row = SmartLookupUsage.objects.get(source="gemini_invoice_error")
    assert row.input_tokens == 1000
    assert row.output_tokens == 200
    assert row.charged_paise == result["charged_paise"]
    wallet = SmartLookupWallet.objects.get(business=shop_business)
    assert wallet.balance_paise == 500 - result["charged_paise"]


@pytest.mark.django_db
def test_automation_draft_charges_input_output_and_thinking_tokens(
    shop_business, monkeypatch: pytest.MonkeyPatch
) -> None:
    import apps.workflow.services.handlers  # noqa: F401
    from apps.workflow.services.gemini_creator import GeminiAutomationCreator

    SmartLookupWallet.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        balance_paise=500,
    )
    _patch_rates(monkeypatch)
    draft = {
        "name": "Low stock",
        "description": "Alert staff",
        "trigger": {"type": "inventory.low_stock"},
        "conditions": [{"type": "inventory.out_of_stock"}],
        "actions": [{"type": "notify.staff", "subject": "Out of stock", "body": "{product} is at {stock}"}],
        "how_it_works": "Staff are told when a product is out of stock.",
        "clarifying_questions": [],
    }

    class _Response:
        status_code = 200
        text = ""

        def json(self):
            return {
                "candidates": [{"content": {"parts": [{"text": json.dumps(draft)}]}}],
                "usageMetadata": {
                    "promptTokenCount": 1000,
                    "candidatesTokenCount": 200,
                    "thoughtsTokenCount": 50,
                    "totalTokenCount": 1250,
                },
            }

    monkeypatch.setattr(
        "apps.workflow.services.gemini_creator.requests.post",
        lambda *args, **kwargs: _Response(),
    )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    result = GeminiAutomationCreator().draft_from_prompt(
        tenant=shop_business.tenant,
        business=shop_business,
        prompt="Tell staff when a product is out of stock",
        product_code="shopie",
    )
    from apps.shopie.services.gemini_billing import quote_gemini_minor

    usage = result["usage"]
    expected, _micros = quote_gemini_minor(
        1000,
        250,
        platform=_Platform(),
        currency=str(usage["currency"]),
    )
    assert usage["prompt_tokens"] == 1000
    assert usage["completion_tokens"] == 250
    assert usage["charged_paise"] == expected
    assert expected > 0
    row = SmartLookupUsage.objects.get(source="gemini_automation")
    assert row.input_tokens == 1000
    assert row.output_tokens == 250
    assert row.charged_paise == expected
    wallet = SmartLookupWallet.objects.get(business=shop_business)
    assert wallet.balance_paise == 500 - expected


@pytest.mark.django_db
def test_automation_draft_is_blocked_before_gemini_when_wallet_is_empty(
    shop_business, monkeypatch: pytest.MonkeyPatch
) -> None:
    from apps.workflow.services.gemini_creator import GeminiAutomationCreator

    SmartLookupWallet.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        balance_paise=0,
    )
    _patch_rates(monkeypatch)
    called = {"n": 0}

    def _post(*args, **kwargs):
        called["n"] += 1
        raise AssertionError("Gemini should not be called")

    monkeypatch.setattr("apps.workflow.services.gemini_creator.requests.post", _post)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    with pytest.raises(ValidationError):
        GeminiAutomationCreator().draft_from_prompt(
            tenant=shop_business.tenant,
            business=shop_business,
            prompt="Tell staff when a product is out of stock",
            product_code="shopie",
        )
    assert called["n"] == 0
    assert SmartLookupUsage.objects.filter(source="gemini_automation").count() == 0
