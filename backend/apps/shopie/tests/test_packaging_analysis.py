from __future__ import annotations

from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.shopie.services.packaging_analysis import PackagingAnalysisService


def test_parse_packaging_text_extracts_pedigree_brand() -> None:
    service = PackagingAnalysisService()
    parsed = service._parse_packaging_text(
        front_text="Pedigree\nAdult Complete Nutrition\nChicken & Vegetables\n3 kg\n",
        back_text="Ingredients: Cereals, meat and animal derivatives...\nNutrition information...",
        hint="",
    )
    assert "pedigree" in parsed["brand"].lower()
    assert "adult" in parsed["name"].lower() or "chicken" in parsed["name"].lower()
    assert "3" in parsed["pack_size"]


def test_plausible_barcode_checksum() -> None:
    assert ProductEnrichmentService.is_plausible_barcode("3065896410002")
    assert not ProductEnrichmentService.is_plausible_barcode("00000000")
    assert not ProductEnrichmentService.is_plausible_barcode("123")
    assert not ProductEnrichmentService.is_plausible_barcode("1111111111111")


def test_catalog_match_requires_overlap() -> None:
    service = PackagingAnalysisService()
    catalog = {"name": "Some Random Biscuit", "brand": "OtherBrand"}
    assert not service._catalog_matches_packaging(catalog, "Pedigree Adult Dog Food", "")
    catalog_ok = {"name": "Pedigree Adult", "brand": "Pedigree"}
    assert service._catalog_matches_packaging(catalog_ok, "Pedigree Adult Dog Food", "")


def test_looks_like_pet_query() -> None:
    assert ProductEnrichmentService.looks_like_pet_query("Pedigree Adult 3kg")
    assert not ProductEnrichmentService.looks_like_pet_query("Amul Taaza Milk")
