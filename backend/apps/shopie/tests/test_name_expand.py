"""Smart Lookup: expand abbreviated invoice names, then free catalog retry."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from apps.shopie.services import smart_lookup as smart_mod
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.smart_lookup import SmartLookupService

INVOICE = "PED PRO STR M & P Large 3F 6x3kg M RP1520"
EXPANDED = "PED PRO STAR M & P Large 3F 63 kg M RP 1520"


def _patch_smart_gates(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    settlements: list[dict] = []
    monkeypatch.setattr(SmartLookupService, "platform_allows", lambda self, **kwargs: True)
    monkeypatch.setattr(SmartLookupService, "plan_allows", lambda self, **kwargs: True)
    monkeypatch.setattr(SmartLookupService, "is_enabled", lambda self, **kwargs: True)
    monkeypatch.setattr(
        SmartLookupService,
        "ensure_wallet",
        lambda self, **kwargs: SimpleNamespace(balance_paise=5000),
    )
    monkeypatch.setattr(
        smart_mod,
        "get_platform_smart_lookup_row",
        lambda: SimpleNamespace(enabled=True),
    )
    monkeypatch.setattr(
        smart_mod,
        "smart_lookup_prices_for_currency",
        lambda *args, **kwargs: {"min_charge": 1},
    )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_settle(**kwargs):
        settlements.append(kwargs)
        return {"charged_paise": 15, "message": "₹0.15 charged to your AI wallet."}

    monkeypatch.setattr(
        "apps.shopie.services.gemini_billing.settle_gemini_usage",
        fake_settle,
    )
    return settlements


def test_smart_enrich_expands_name_then_hits_free_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    settlements = _patch_smart_gates(monkeypatch)

    monkeypatch.setattr(
        SmartLookupService,
        "_expand_abbreviated_name",
        lambda self, **kwargs: {
            "ok": True,
            "data": {"name": EXPANDED, "brand": "Pedigree", "pack_size": "63 kg"},
            "usage": {"input_tokens": 120, "output_tokens": 50},
        },
    )

    def fake_enrich(self, *, code: str = "", query: str = "", prefer_pet: bool = False):
        assert "STAR" in query.upper()
        return {
            "found": True,
            "code": "8901234567890",
            "source": "open_pet_food_facts_search",
            "name": EXPANDED,
            "brand": "Pedigree",
            "pack_size": "63 kg",
            "image_url": "https://example.com/ped.jpg",
            "front_image_url": "https://example.com/ped.jpg",
            "confidence": "medium",
            "needs_pack_photo": False,
        }

    monkeypatch.setattr(ProductEnrichmentService, "enrich", fake_enrich)
    monkeypatch.setattr(
        SmartLookupService,
        "_call_gemini",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("full Gemini product lookup should not run after catalog hit")
        ),
    )

    # Bypass @transaction.atomic so this unit test needs no Postgres.
    result = SmartLookupService.smart_enrich.__wrapped__(
        SmartLookupService(),
        tenant=MagicMock(),
        business=MagicMock(),
        hint=INVOICE,
    )
    assert result["found"] is True
    assert result["source"] == "gemini_name_expand"
    assert result["name"] == EXPANDED
    assert result["expanded_from"] == INVOICE
    assert result["expanded_name"] == EXPANDED
    assert result["charged_paise"] == 15
    assert "expanded" in (result.get("message") or "").lower()
    assert len(settlements) == 1
    assert settlements[0]["source"] == "gemini_name_expand"
    assert settlements[0]["input_tokens"] == 120


def test_smart_enrich_returns_expand_only_when_catalog_brand_mismatches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Do not attach Authority (or other wrong-brand) catalog rows after expand."""
    settlements = _patch_smart_gates(monkeypatch)
    monkeypatch.setattr(
        SmartLookupService,
        "_expand_abbreviated_name",
        lambda self, **kwargs: {
            "ok": True,
            "data": {"name": EXPANDED, "brand": "Pedigree", "pack_size": "63 kg"},
            "usage": {"input_tokens": 100, "output_tokens": 40},
        },
    )
    monkeypatch.setattr(
        SmartLookupService,
        "_call_gemini",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("should not full-lookup")),
    )
    monkeypatch.setattr(
        SmartLookupService,
        "_find_retail_listing",
        lambda self, **kwargs: {
            "ok": True,
            "image_url": "https://m.media-amazon.com/images/I/pedigree-pack.jpg",
            "code": "8901030865523",
            "usage": {"input_tokens": 40, "output_tokens": 20},
        },
    )
    monkeypatch.setattr(
        ProductEnrichmentService,
        "is_plausible_barcode",
        staticmethod(lambda code: str(code).isdigit() and len(str(code)) in {8, 12, 13, 14}),
    )
    monkeypatch.setattr(ProductEnrichmentService, "_gtin_checksum_ok", staticmethod(lambda digits: True))

    def enrich_side_effect(self, *, code: str = "", query: str = "", prefer_pet: bool = False):
        if code:
            return {"found": False, "code": code, "source": "barcode_lookup", "confidence": "none"}
        return {
            "found": True,
            "code": "0737257516458",
            "source": "open_food_facts_search",
            "name": "large breed puppy food",
            "brand": "authority",
            "pack_size": "38 lbs",
            "image_url": "https://example.com/wrong.jpg",
            "confidence": "medium",
        }

    monkeypatch.setattr(ProductEnrichmentService, "enrich", enrich_side_effect)

    result = SmartLookupService.smart_enrich.__wrapped__(
        SmartLookupService(),
        tenant=MagicMock(),
        business=MagicMock(),
        hint=INVOICE,
    )
    assert result["found"] is True
    assert result["source"] == "gemini_name_expand"
    assert result["name"] == EXPANDED
    assert result["brand"] == "Pedigree"
    assert result.get("code") == "8901030865523"
    assert "media-amazon.com" in (result.get("image_url") or "")
    assert result["needs_pack_photo"] is False
    assert settlements and settlements[0]["metadata"].get("catalog_rejected") is True


def test_smart_enrich_expand_only_when_free_catalog_misses(monkeypatch: pytest.MonkeyPatch) -> None:
    """After a successful expand, return the expanded title — do not attach a random OFF hit."""
    settlements = _patch_smart_gates(monkeypatch)

    monkeypatch.setattr(
        SmartLookupService,
        "_expand_abbreviated_name",
        lambda self, **kwargs: {
            "ok": True,
            "data": {"name": EXPANDED, "brand": "Pedigree", "pack_size": "63 kg"},
            "usage": {"input_tokens": 80, "output_tokens": 30},
        },
    )
    monkeypatch.setattr(
        ProductEnrichmentService,
        "enrich",
        lambda self, **kwargs: {"found": False, "source": "catalog_search", "confidence": "none"},
    )
    monkeypatch.setattr(
        SmartLookupService,
        "_call_gemini",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("full lookup not needed")),
    )
    monkeypatch.setattr(
        SmartLookupService,
        "_find_retail_listing",
        lambda self, **kwargs: {
            "ok": False,
            "image_url": "",
            "code": "",
            "usage": {"input_tokens": 10, "output_tokens": 5},
        },
    )

    result = SmartLookupService.smart_enrich.__wrapped__(
        SmartLookupService(),
        tenant=MagicMock(),
        business=MagicMock(),
        hint=INVOICE,
    )
    assert result["found"] is True
    assert result["source"] == "gemini_name_expand"
    assert result["name"] == EXPANDED
    assert result["brand"] == "Pedigree"
    assert result["needs_pack_photo"] is True
    assert len(settlements) == 1
    assert settlements[0]["source"] == "gemini_name_expand"
    assert settlements[0]["input_tokens"] == 90


def test_call_gemini_name_only_prompt_mentions_abbreviations(monkeypatch: pytest.MonkeyPatch) -> None:
    """Name-only path (no barcode) asks Gemini to expand invoice abbreviations."""
    captured: list[dict] = []

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            import json

            return json.dumps(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps(
                                            {
                                                "name": EXPANDED,
                                                "brand": "Pedigree",
                                                "pack_size": "63 kg",
                                                "code": "",
                                            }
                                        )
                                    }
                                ]
                            }
                        }
                    ],
                    "usageMetadata": {
                        "promptTokenCount": 10,
                        "candidatesTokenCount": 5,
                        "totalTokenCount": 15,
                    },
                }
            ).encode()

    def fake_urlopen(request, timeout=0):
        import json

        body = json.loads(request.data.decode("utf-8"))
        captured.append(body)
        return _Resp()

    monkeypatch.setattr(smart_mod.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(smart_mod, "GEMINI_TEXT_USE_SEARCH", False)

    result = SmartLookupService()._call_gemini(api_key="k", image_url="", code="", hint=INVOICE)
    assert result["ok"] is True
    assert captured
    prompt = str(captured[0]["contents"][0]["parts"][0]["text"])
    assert "abbreviated" in prompt.lower()
    assert "STR" in prompt
    assert INVOICE in prompt


def test_plausible_remote_image_url() -> None:
    assert SmartLookupService._plausible_remote_image_url(
        "https://m.media-amazon.com/images/I/71abc.jpg"
    ).startswith("https://")
    assert SmartLookupService._plausible_remote_image_url("https://google.com/search?q=x") == ""
    assert SmartLookupService._plausible_remote_image_url("http://example.com/a.jpg") == ""


def test_with_user_message_for_name_expand() -> None:
    msg = ProductEnrichmentService.with_user_message(
        {
            "found": True,
            "source": "gemini_name_expand",
            "name": EXPANDED,
            "charged_paise": 12,
            "message": (
                "Matched catalog after Smart expanded the invoice name. "
                "₹0.12 deducted from Smart Fill wallet. Review carefully, then save."
            ),
        }
    )
    assert "expanded" in msg["message"].lower()
