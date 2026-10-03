from __future__ import annotations

from decimal import Decimal

import pytest

from apps.shopie.models import PlatformGtinCatalog
from apps.shopie.services.catalog_import.barcodes import canonical_barcode, is_valid_gtin
from apps.shopie.services.catalog_import.importer import PlatformCatalogImporter
from apps.shopie.services.catalog_import.normalize import (
    collect_images,
    infer_pack_size,
    pack_size_from_parts,
)


@pytest.mark.django_db
def test_canonical_barcode_keeps_checksum_valid_gtin13() -> None:
    code = "8901030865420"  # may fail checksum — use a known-good pattern from GTIN math
    # Build a valid EAN-13: base 890123456789 + check
    body = "890123456789"
    total = 0
    for index, char in enumerate(reversed(body)):
        total += int(char) * (3 if index % 2 == 0 else 1)
    check = (10 - (total % 10)) % 10
    valid = f"{body}{check}"
    assert is_valid_gtin(valid)
    assert canonical_barcode(valid) == valid


def test_collect_images_caps_at_five() -> None:
    urls = [f"https://cdn.example.com/{i}.jpg" for i in range(8)]
    assert len(collect_images(*urls)) == 5


def test_pack_size_from_parts() -> None:
    assert pack_size_from_parts(label="500 ml") == "500 ml"
    assert pack_size_from_parts(size=100, unit="g") == "100 g"


def test_infer_pack_size_from_name_and_digits() -> None:
    assert infer_pack_size(name="Maggi Masala Noodles 560G") == "560G"
    assert infer_pack_size(pack_size="70", name="maggi 70g") == "70g"
    assert infer_pack_size(pack_size="140 g", name="Maggi") == "140 g"


@pytest.mark.django_db
def test_importer_upserts_and_skips_missing_image() -> None:
    importer = PlatformCatalogImporter()
    good = {
        "found": True,
        "code": "8901234567890",
        "source": "openmrp",
        "name": "Test Biscuit",
        "brand": "Acme",
        "pack_size": "100 g",
        "description": "Wheat flour, sugar",
        "details_html": "Vegetarian",
        "categories": "Snacks",
        "mrp": "20",
        "currency": "INR",
        "gst_rate": None,
        "image_url": "https://cdn.example.com/biscuit.jpg",
        "images": {"gallery": ["https://cdn.example.com/biscuit.jpg"]},
        "confidence": "high",
        "metadata": {"enrichment_source": "openmrp"},
    }
    # Ensure barcode is valid for importer
    body = "890123456789"
    total = 0
    for index, char in enumerate(reversed(body)):
        total += int(char) * (3 if index % 2 == 0 else 1)
    check = (10 - (total % 10)) % 10
    good["code"] = f"{body}{check}"

    seen: set[str] = set()
    outcome = importer._process_row(good, require_image=True, dry_run=False, seen_codes=seen)
    assert outcome["reason"] == "imported"
    row = PlatformGtinCatalog.objects.get(code=good["code"])
    assert row.name == "Test Biscuit"
    assert row.currency == "INR"
    assert row.gst_rate is None
    assert row.mrp == Decimal("20.00")
    assert row.image_url.endswith("biscuit.jpg")

    no_image = {**good, "code": "", "image_url": "", "images": {"gallery": []}}
    # second valid code
    body2 = "890123456780"
    total2 = 0
    for index, char in enumerate(reversed(body2)):
        total2 += int(char) * (3 if index % 2 == 0 else 1)
    check2 = (10 - (total2 % 10)) % 10
    no_image["code"] = f"{body2}{check2}"
    outcome2 = importer._process_row(no_image, require_image=True, dry_run=False, seen_codes=seen)
    assert outcome2["reason"] == "missing_image"
