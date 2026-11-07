"""Tests for abbreviated invoice name → catalog search helpers."""

from __future__ import annotations

from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.query_normalize import (
    apply_pet_trade_expansions,
    search_query_variants,
    split_glued_alphanumerics,
    token_matches,
)

INVOICE_NAME = "PED PRO STR M & P Large 3F 6x3kg M RP1520"
CATALOG_NAME = "PED PRO STAR M & P Large 3F 63 kg M RP 1520"


def test_split_glued_codes_keeps_short_tags() -> None:
    assert "RP 1520" in split_glued_alphanumerics(INVOICE_NAME)
    assert "3F" in split_glued_alphanumerics(INVOICE_NAME)


def test_pet_trade_expands_str_and_ped() -> None:
    expanded = apply_pet_trade_expansions("PED PRO STR Large")
    assert "STAR" in expanded.upper()
    assert "PEDIGREE" in expanded.upper()


def test_search_variants_prefer_normalized_pedigree_line() -> None:
    variants = search_query_variants(INVOICE_NAME, prefer_pet=True, max_variants=3)
    assert variants
    top = variants[0].lower()
    assert "star" in top
    assert "rp 1520" in top or "rp1520" not in top.replace(" ", "")
    assert "63" in top
    assert "kg" in top


def test_soft_token_match_str_to_star() -> None:
    haystack = CATALOG_NAME.lower()
    hay_tokens = {token for token in haystack.replace("&", " ").split() if token}
    # STR is not a string prefix of STAR; consonant-skeleton soft-match covers it.
    assert token_matches("str", haystack, hay_tokens)
    assert token_matches("star", haystack, hay_tokens)
    assert token_matches("ped", haystack, {"pedigree", "adult"})  # prefix
    assert not token_matches("xyzzy", haystack, hay_tokens)
    # Regression: "str" must NOT match inside "industrie" (Migros false positive).
    assert not token_matches("str", "m classic migros industrie", {"m", "classic", "migros", "industrie"})


def test_best_search_hit_rejects_wrong_brand_despite_generic_overlap() -> None:
    """Pedigree expanded query must not select Authority 'large breed puppy food'."""
    enrichment = ProductEnrichmentService()
    hits = [
        {
            "code": "0737257516458",
            "product_name": "large breed puppy food",
            "brands": ["authority"],
            "quantity": "38 lbs",
        },
        {
            "code": "890123",
            "product_name": CATALOG_NAME,
            "brands": "Pedigree",
        },
    ]
    query = "Pedigree Pro Mother & Pup Starter Large Breed Dog Food 3kg"
    chosen = enrichment._best_search_hit(hits, query)
    assert chosen is not None
    assert chosen.get("code") == "890123"
    assert enrichment._best_search_hit([hits[0]], query) is None
    assert not enrichment.catalog_agrees_with_query(
        {"found": True, "name": "large breed puppy food", "brand": "authority"},
        query,
    )


def test_best_search_hit_rejects_industrie_substring_false_positive() -> None:
    """Invoice STR must not select Migros M-Classic via str⊂industrie."""
    enrichment = ProductEnrichmentService()
    hits = [
        {
            "code": "7613269182979",
            "product_name": None,
            "brands": ["M Classic", " Migros M-Classic", " M-Classic - Migros Industrie"],
        },
        {"code": "890123", "product_name": CATALOG_NAME, "brands": "Pedigree"},
    ]
    variant = "PED PRO STR M P Large 3F 63 kg M RP 1520"
    chosen = enrichment._best_search_hit(hits, variant)
    assert chosen is not None
    assert chosen.get("code") == "890123"

    # Alone, the Migros row must not score.
    assert enrichment._best_search_hit([hits[0]], variant) is None


def test_best_search_hit_selects_abbreviated_pedigree_line() -> None:
    enrichment = ProductEnrichmentService()
    hits = [
        {"code": "1", "product_name": "Unrelated Dry Food Large", "brands": "Other"},
        {"code": "890123", "product_name": CATALOG_NAME, "brands": "Pedigree"},
        {"code": "2", "product_name": "PED Adult Chicken 3kg", "brands": "Pedigree"},
    ]
    # Score against a normalized variant (what _search tries after expand).
    variants = search_query_variants(INVOICE_NAME, prefer_pet=True, max_variants=3)
    chosen = enrichment._best_search_hit(hits, variants[0])
    assert chosen is not None
    assert chosen.get("code") == "890123"
    assert CATALOG_NAME in str(chosen.get("product_name") or "")


def test_best_search_hit_rejects_weak_soft_single_token() -> None:
    enrichment = ProductEnrichmentService()
    hits = [{"code": "9", "product_name": "Starter Mix", "brands": "Acme"}]
    # "str" soft-matches "starter" only — score 1 with soft → reject.
    assert enrichment._best_search_hit(hits, "STR") is None


def test_looks_like_pet_query_accepts_ped_abbreviation() -> None:
    assert ProductEnrichmentService.looks_like_pet_query(INVOICE_NAME)
    assert ProductEnrichmentService.looks_like_pet_query("Pedigree Adult 3kg")
    assert not ProductEnrichmentService.looks_like_pet_query("Amul Taaza Milk")
