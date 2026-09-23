from __future__ import annotations

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
    assert row.slug == "dry_dog_food"
    assert row.is_builtin is False

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
def test_platform_gtin_round_trip(shop_business: Business) -> None:
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
    enrichment._upsert_platform_gtin(enriched)

    row = PlatformGtinCatalog.objects.get(code="8906002483006")
    assert row.name == "Pedigree Puppy"
    assert row.category in {"pet_food", "dry_food", "dog_food"}

    cached = enrichment.enrich(code="8906002483006")
    assert cached["found"] is True
    assert cached["source"] == "platform_gtin"
    assert cached["name"] == "Pedigree Puppy"


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
    monkeypatch.setattr("apps.shopie.services.enrichment.barcode_api_configured", lambda: True)
    monkeypatch.setattr("apps.shopie.services.enrichment.lookup_commercial_barcode", fake_commercial)
    result = enrichment.enrich(code="8901234567890")
    assert result["found"] is True
    assert result["name"] == "Acme Widget"
    assert PlatformGtinCatalog.objects.filter(code="8901234567890", name="Acme Widget").exists()
