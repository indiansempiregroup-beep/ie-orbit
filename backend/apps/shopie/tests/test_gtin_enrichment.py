from __future__ import annotations

import re

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.shopie.models import PlatformGtinCatalog, ProductStatus, ShopProductCategory
from apps.shopie.services.categories import CategoryService
from apps.shopie.services.enrichment import ProductEnrichmentService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="gtin-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="gtin-tenant",
        display_name="GTIN Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="GTIN Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="gtin-biz",
        business_name="GTIN Biz",
        display_name="GTIN Biz",
        selected_product="shopie",
    )


@pytest.mark.django_db
def test_category_service_seeds_and_creates_custom() -> None:
    service = CategoryService()
    created = service.seed_builtins()
    assert created >= 13
    assert ShopProductCategory.objects.filter(slug="pet_food", is_builtin=True).exists()

    row = service.ensure_category(label="Dry dog food")
    assert row is not None
    # Builtin pet_food wins over a custom dry_dog_food slug when the label is pet-related.
    assert row.slug in {"dry_dog_food", "pet_food"}
    assert row.is_builtin is (row.slug == "pet_food")

    again = service.ensure_category(label="Dry  Dog Food")
    assert again is not None
    assert again.id == row.id


@pytest.mark.django_db
def test_category_guess_prefers_builtin() -> None:
    service = CategoryService()
    service.seed_builtins()
    row = service.ensure_category(label="Pedigree Adult Dog Food")
    assert row is not None
    assert row.slug == "pet_food"


@pytest.mark.django_db
def test_platform_gtin_round_trip(shop_business: Business, monkeypatch: pytest.MonkeyPatch) -> None:
    del shop_business  # fixture ensures DB is ready
    enrichment = ProductEnrichmentService()
    result = {
        "found": True,
        "code": "8906002483006",
        "source": "open_pet_food_facts_barcode",
        "name": "Pedigree Puppy",
        "brand": "Pedigree",
        "pack_size": "2.8 kg",
        "categories": "Dog food, Dry food",
        "image_url": "https://example.com/front.jpg",
        "front_image_url": "https://example.com/front.jpg",
        "images": {"front": "https://example.com/front.jpg", "back": "", "gallery": ["https://example.com/front.jpg"]},
        "confidence": "high",
        "mrp": "0",
        "gst_rate": "0",
    }
    enriched = enrichment._attach_category(result)
    enrichment._upsert_platform_gtin(enrichment._payload_for_platform_upsert(enriched))

    row = PlatformGtinCatalog.objects.get(code="8906002483006")
    assert row.name == "Pedigree Puppy"
    assert row.category in {"pet_food", "dry_food", "dog_food"}
    assert row.gst_rate is None

    # Catalog rows with mrp=0 gap-fill OpenMRP/commercial; keep them quiet here.
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_commercial_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: False)

    def fake_fetch(self, code: str, *, prefer_pet: bool = False):  # noqa: ARG001
        return {"found": False, "code": code, "source": "barcode_lookup", "confidence": "none"}

    monkeypatch.setattr(ProductEnrichmentService, "_fetch_by_barcode", fake_fetch)

    cached = enrichment.enrich(code="8906002483006")
    assert cached["found"] is True
    assert cached["source"] == "platform_gtin"
    assert cached["name"] == "Pedigree Puppy"
    assert cached["pack_size"] == "2.8 kg"


@pytest.mark.django_db
def test_enrich_gap_fills_mrp_and_pack_from_name(monkeypatch: pytest.MonkeyPatch) -> None:
    PlatformGtinCatalog.objects.create(
        code="8901058000290",
        name="maggi 70g",
        brand="Maggi",
        pack_size="70",
        mrp=0,
        source="open_food_facts",
        confidence="high",
        image_url="https://example.com/maggi.jpg",
        images={"front": "https://example.com/maggi.jpg", "back": "", "gallery": ["https://example.com/maggi.jpg"]},
    )

    def fake_openmrp(code: str):
        return {
            "found": True,
            "code": code,
            "source": "openmrp",
            "name": "Maggi 2-Minute Noodles",
            "brand": "Maggi",
            "pack_size": "70 g",
            "mrp": "14",
            "currency": "INR",
            "gst_rate": None,
            "image_url": "https://example.com/maggi.jpg",
            "front_image_url": "https://example.com/maggi.jpg",
            "images": {"front": "https://example.com/maggi.jpg", "back": "", "gallery": ["https://example.com/maggi.jpg"]},
            "confidence": "high",
        }

    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", fake_openmrp)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: False)

    result = ProductEnrichmentService().enrich(code="8901058000290")
    assert result["found"] is True
    assert re.sub(r"\s+", "", result["pack_size"]).lower() == "70g"
    assert result["mrp"] == "14"
    assert result["source"] == "openmrp"
    row = PlatformGtinCatalog.objects.get(code="8901058000290")
    assert row.mrp == 14
    assert "70" in row.pack_size.lower()


@pytest.mark.django_db
def test_enrich_miss_sets_needs_pack_photo(monkeypatch: pytest.MonkeyPatch) -> None:
    enrichment = ProductEnrichmentService()

    def fake_fetch(self, code: str, *, prefer_pet: bool = False):  # noqa: ARG001
        return {
            "found": False,
            "code": code,
            "source": "barcode_lookup",
            "confidence": "none",
            "needs_pack_photo": True,
        }

    monkeypatch.setattr(ProductEnrichmentService, "_fetch_by_barcode", fake_fetch)
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: False)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", lambda code: None)  # noqa: ARG005
    result = enrichment.enrich(code="8906002483785")
    assert result["found"] is False
    assert result["needs_pack_photo"] is True
    assert not PlatformGtinCatalog.objects.filter(code="8906002483785").exists()


@pytest.mark.django_db
def test_shop_product_contributes_manufacturer_gtin(shop_business: Business) -> None:
    from apps.shopie.services.catalog import CatalogService

    catalog = CatalogService()
    product = catalog.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Pedigree Adult Small Breed Chicken",
            "brand": "Pedigree",
            "pack_size": "1.75 kg",
            "price": "450",
            "gst_rate": "18",
            "category": "pet_food",
            "image_url": "https://cdn.example.com/pedigree.jpg",
            "metadata": {"images": {"front": "https://cdn.example.com/pedigree.jpg", "gallery": ["https://cdn.example.com/pedigree.jpg"]}},
        },
        barcodes=[{"code": "6006078004036", "barcode_type": "manufacturer", "is_primary": True}],
    )
    assert product.name.startswith("Pedigree")
    row = PlatformGtinCatalog.objects.get(code="6006078004036")
    assert row.name == "Pedigree Adult Small Breed Chicken"
    assert row.brand == "Pedigree"
    assert row.source == "shop_shared"
    # Shop selling price must not leak into shared MRP.
    assert row.mrp == 0
    assert "pedigree.jpg" in (row.image_url or "")


@pytest.mark.django_db
def test_enrich_uses_commercial_barcode_after_open_facts_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    enrichment = ProductEnrichmentService()

    def fake_fetch(self, code: str, *, prefer_pet: bool = False):  # noqa: ARG001
        return {
            "found": False,
            "code": code,
            "source": "barcode_lookup",
            "confidence": "none",
            "needs_pack_photo": True,
        }

    def fake_commercial(code: str):
        return {
            "found": True,
            "code": code,
            "source": "commercial_barcodelookup",
            "name": "Acme Widget",
            "brand": "Acme",
            "pack_size": "500 g",
            "description": "Test",
            "categories": "Grocery",
            "image_url": "https://cdn.example.com/acme.jpg",
            "front_image_url": "https://cdn.example.com/acme.jpg",
            "images": {"front": "https://cdn.example.com/acme.jpg", "back": "", "gallery": ["https://cdn.example.com/acme.jpg"]},
            "mrp": "99",
            "gst_rate": "0",
            "confidence": "medium",
        }

    monkeypatch.setattr(ProductEnrichmentService, "_fetch_by_barcode", fake_fetch)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: True)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_commercial_barcode", fake_commercial)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", lambda code: None)  # noqa: ARG005
    result = enrichment.enrich(code="8901234567890")
    assert result["found"] is True
    assert result["name"] == "Acme Widget"
    assert PlatformGtinCatalog.objects.filter(code="8901234567890", name="Acme Widget").exists()


@pytest.mark.django_db
def test_enrich_uses_public_go_upc_after_open_facts_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    enrichment = ProductEnrichmentService()

    def fake_fetch(self, code: str, *, prefer_pet: bool = False):  # noqa: ARG001
        return {
            "found": False,
            "code": code,
            "source": "barcode_lookup",
            "confidence": "none",
            "needs_pack_photo": True,
        }

    def fake_public(code: str):
        return {
            "found": True,
            "code": code,
            "source": "public_go_upc",
            "name": "Himalaya Liv 52 Drops, Dogs And Cats, 30 Ml",
            "brand": "Himalaya",
            "pack_size": "30 Ml",
            "description": "",
            "categories": "Pet Vitamins & Supplements",
            "image_url": "https://go-upc.s3.amazonaws.com/images/example.webp",
            "front_image_url": "https://go-upc.s3.amazonaws.com/images/example.webp",
            "images": {
                "front": "https://go-upc.s3.amazonaws.com/images/example.webp",
                "back": "",
                "gallery": ["https://go-upc.s3.amazonaws.com/images/example.webp"],
            },
            "mrp": "0",
            "gst_rate": "0",
            "confidence": "medium",
        }

    monkeypatch.setattr(ProductEnrichmentService, "_fetch_by_barcode", fake_fetch)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: False)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", fake_public)
    result = enrichment.enrich(code="8901138501235")
    assert result["found"] is True
    assert result["name"].startswith("Himalaya Liv 52")
    assert result["source"] == "public_go_upc"
    assert PlatformGtinCatalog.objects.filter(code="8901138501235").exists()


@pytest.mark.django_db
def test_enrich_uses_datakick_after_open_facts_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    enrichment = ProductEnrichmentService()

    def fake_fetch(self, code: str, *, prefer_pet: bool = False):  # noqa: ARG001
        return {
            "found": False,
            "code": code,
            "source": "barcode_lookup",
            "confidence": "none",
            "needs_pack_photo": True,
        }

    def fake_datakick(code: str):
        return {
            "found": True,
            "code": code,
            "source": "datakick",
            "name": "Vitamin C 500 mg",
            "brand": "Meijer",
            "pack_size": "100 caplets",
            "description": "Ascorbic acid",
            "details_html": "100 caplets",
            "categories": "",
            "image_url": "",
            "images": {"front": "", "back": "", "gallery": []},
            "mrp": "0",
            "gst_rate": None,
            "confidence": "medium",
            "needs_pack_photo": True,
        }

    monkeypatch.setattr(ProductEnrichmentService, "_fetch_by_barcode", fake_fetch)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_openmrp_barcode", lambda code: None)  # noqa: ARG005
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_datakick_barcode", fake_datakick)
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: False)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_public_barcode", lambda code: None)  # noqa: ARG005
    result = enrichment.enrich(code="41250500735")
    assert result["found"] is True
    assert result["source"] == "datakick"
    assert result["name"] == "Vitamin C 500 mg"
    assert PlatformGtinCatalog.objects.filter(code="41250500735", name="Vitamin C 500 mg").exists()


def test_datakick_gtin14_parser(monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services import barcode_providers as providers

    payload = [
        {
            "id": 2,
            "gtin14": "00041250500735",
            "brand_name": "Meijer",
            "name": "Vitamin C 500 mg",
            "size": "100 caplets",
            "ingredients": "Ascorbic acid",
            "serving_size": "1 caplet",
        }
    ]

    monkeypatch.setattr(providers, "_http_json", lambda url, headers=None: payload)  # noqa: ARG005
    result = providers.lookup_datakick_barcode("41250500735")
    assert result is not None
    assert result["found"] is True
    assert result["source"] == "datakick"
    assert result["name"] == "Vitamin C 500 mg"
    assert result["brand"] == "Meijer"
    assert result["pack_size"] == "100 caplets"
    assert "Ascorbic" in result["description"]


def test_go_upc_public_html_parser(monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services import barcode_providers as providers

    html = """
    <html><head><title>Himalaya Liv 52 Drops — EAN 8901138501235 — Go-UPC</title></head>
    <body>
      <h1>Himalaya Liv 52 Drops, Dogs And Cats, 30 Ml</h1>
      <table>
        <tr><td>EAN</td><td>8901138501235</td></tr>
        <tr><td>Brand</td><td>Himalaya</td></tr>
        <tr><td>Category</td><td>Pet Vitamins &amp; Supplements</td></tr>
      </table>
      <img src="https://go-upc.s3.amazonaws.com/images/122044980.webp" />
    </body></html>
    """

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return html.encode("utf-8")

    def fake_urlopen(request, timeout=None):  # noqa: ARG001
        return FakeResponse()

    monkeypatch.setattr(providers.urllib.request, "urlopen", fake_urlopen)
    raw = providers._fetch_go_upc_public("8901138501235")

    assert raw is not None
    assert raw["name"].startswith("Himalaya Liv 52")
    assert raw["brand"] == "Himalaya"
    assert "Pet Vitamins" in raw["categories"]
    assert raw["image_url"].endswith(".webp")
    assert raw["pack_size"].lower() == "30 ml"
