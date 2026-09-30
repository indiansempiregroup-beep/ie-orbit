from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from apps.businesses.models import Business
from apps.platform_media.utils.images import fit_to_product_canvas
from apps.shopie.models import ShopMasterKind
from apps.shopie.services.masters import MasterService
from apps.tenancy.models import Organization


def _rgb_png(size=(800, 600), color=(200, 40, 40)) -> BytesIO:
    image = Image.new("RGB", size, color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def test_fit_to_product_canvas_letterboxes_transparent():
    buffer = fit_to_product_canvas(_rgb_png(), canvas_size=1200)
    out = Image.open(buffer)
    assert out.size == (1200, 1200)
    assert out.mode == "RGBA"
    assert out.getpixel((0, 0))[3] == 0


def test_fit_to_product_canvas_does_not_upscale_small_crop():
    """Small free crops keep pixel size; transparent padding fills the canvas."""
    buffer = fit_to_product_canvas(_rgb_png((200, 100)), canvas_size=1200)
    out = Image.open(buffer)
    assert out.size == (1200, 1200)
    # Crop is centered at ~500,550 — opaque; far corner transparent.
    cx, cy = 600, 600
    assert out.getpixel((cx, cy))[3] == 255
    assert out.getpixel((0, 0))[3] == 0
    # Content should still be ~200×100 (not stretched to fill).
    opaque = [
        (x, y)
        for y in range(0, 1200, 20)
        for x in range(0, 1200, 20)
        if out.getpixel((x, y))[3] > 0
    ]
    xs = [p[0] for p in opaque]
    ys = [p[1] for p in opaque]
    assert max(xs) - min(xs) <= 220
    assert max(ys) - min(ys) <= 120


def test_fit_to_product_canvas_respects_crop_box():
    buffer = fit_to_product_canvas(_rgb_png((400, 400)), crop_box=(100, 100, 300, 300), canvas_size=1200)
    out = Image.open(buffer)
    assert out.size == (1200, 1200)


@pytest.mark.django_db
def test_master_ensure_category_is_business_scoped(shop_business: Business):
    service = MasterService()
    tenant = shop_business.tenant
    organization = Organization.objects.filter(tenant=tenant).first()
    other_business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shop-other",
        business_name="Shop Other",
        display_name="Shop Other",
        selected_product="shopie",
        address_line1="2 Shop Road",
        city="Mumbai",
        postal_code="400002",
        currency="INR",
    )

    row = service.ensure(
        tenant=tenant,
        business=shop_business,
        kind=ShopMasterKind.CATEGORY,
        label="Dry dog food",
    )
    assert row is not None
    assert row.slug != "other"
    again = service.ensure(
        tenant=tenant,
        business=shop_business,
        kind=ShopMasterKind.CATEGORY,
        label="Dry  Dog Food",
    )
    assert again is not None
    assert again.id == row.id

    other = service.ensure(
        tenant=tenant,
        business=other_business,
        kind=ShopMasterKind.CATEGORY,
        label="Dry dog food",
    )
    assert other is not None
    assert other.id != row.id

    items = service.list_records(tenant=tenant, business=shop_business, kind=ShopMasterKind.CATEGORY)
    slugs = {item["slug"] for item in items}
    assert "food_grocery" in slugs
    assert row.slug in slugs


@pytest.mark.django_db
def test_mobile_shop_filters_from_master_records(shop_business: Business):
    from rest_framework.test import APIClient

    from apps.shopie.models import ProductStatus, ShopProduct
    from apps.shopie.services.catalog import CatalogService

    masters = MasterService()
    masters.ensure(
        tenant=shop_business.tenant,
        business=shop_business,
        kind=ShopMasterKind.BRAND,
        label="Pedigree",
    )
    masters.ensure(
        tenant=shop_business.tenant,
        business=shop_business,
        kind=ShopMasterKind.BRAND,
        label="Unused Brand",
    )
    CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Adult kibble",
            "brand": "Pedigree",
            "price": "499",
            "category": "pet_food",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
        },
    )
    ShopProduct.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Hidden inactive",
        brand="Royal Canin",
        price="100",
        category="food_grocery",
        status=ProductStatus.INACTIVE,
    )

    client = APIClient()
    response = client.get(
        "/api/v1/mobile/shop/filters",
        {
            "tenant_slug": shop_business.tenant.slug,
            "business_code": shop_business.business_code,
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    category_slugs = {item["slug"] for item in payload["categories"]}
    brand_labels = {item["label"] for item in payload["brands"]}
    assert "pet_food" in category_slugs
    assert "food_grocery" not in category_slugs
    assert "Pedigree" in brand_labels
    assert "Unused Brand" not in brand_labels
    assert "Royal Canin" not in brand_labels
