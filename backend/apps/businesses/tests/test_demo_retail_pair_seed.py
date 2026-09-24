from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from PIL import Image

from apps.authentication.models import User
from apps.bookings.models import Booking
from apps.businesses.models import Business, BusinessProductSubscription, WhiteLabelProfile
from apps.businesses.services.demo_retail_pair_seed import (
    ANTIQUE_CUSTOMERS,
    ANTIQUE_OWNER_EMAIL,
    ANTIQUE_PRODUCTS,
    ANTIQUE_TENANT_SLUG,
    DEMO_COUPONS,
    DEMO_ZONES,
    PET_BOOKINGS,
    PET_CATEGORIES,
    PET_CUSTOMERS,
    PET_OWNER_EMAIL,
    PET_PRODUCTS,
    PET_SERVICES,
    PET_SPECS,
    PET_STAFF,
    PET_TENANT_SLUG,
    SEED_TAG,
)
from apps.customers.models import Customer
from apps.services.models import Service, ServiceCategory, ServiceImage
from apps.shopie.models import ShopCoupon, ShopDeliveryZone, ShopOrder, ShopPet, ShopProduct
from apps.staff.models import Staff, StaffServiceAssignment
from apps.tenancy.models import Branding


def _jpeg_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (48, 48), "teal").save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.mark.django_db
def test_seed_demo_retail_pair_is_idempotent(settings, tmp_path) -> None:
    settings.PLATFORM_MEDIA_STORAGE_PROVIDER = "local"
    settings.PLATFORM_MEDIA_LOCAL_ROOT = tmp_path
    jpeg = _jpeg_bytes()

    # First pass uploads logos + service images + product images for both shops.
    # Second pass should skip already-backed media (logos + service/product images).
    expected_first_pass_fetches = (
        2  # logos
        + len(PET_SERVICES)
        + len(PET_PRODUCTS)
        + len(ANTIQUE_PRODUCTS)
    )

    with patch(
        "apps.businesses.services.demo_retail_pair_seed._fetch_image_bytes",
        return_value=jpeg,
    ) as fetch_image:
        call_command("seed_demo_retail_pair")
        first_calls = fetch_image.call_count
        call_command("seed_demo_retail_pair")
        second_calls = fetch_image.call_count

    assert first_calls == expected_first_pass_fetches
    assert second_calls == first_calls

    pet_owner = User.objects.get(email__iexact=PET_OWNER_EMAIL)
    antique_owner = User.objects.get(email__iexact=ANTIQUE_OWNER_EMAIL)
    assert pet_owner.check_password("DemoPetPass123!")
    assert antique_owner.check_password("DemoAntiquePass123!")
    assert pet_owner.id != antique_owner.id

    pet = Business.objects.get(tenant__slug=PET_TENANT_SLUG, business_code="MAIN")
    antique = Business.objects.get(tenant__slug=ANTIQUE_TENANT_SLUG, business_code="MAIN")
    assert pet.tenant.owner_id == pet_owner.id
    assert antique.tenant.owner_id == antique_owner.id
    assert pet.selected_product == "appointie"
    assert antique.selected_product == "shopie"
    assert pet.logo.startswith("/api/v1/media/")
    assert antique.logo.startswith("/api/v1/media/")

    pet_wl = WhiteLabelProfile.objects.get(business=pet)
    antique_wl = WhiteLabelProfile.objects.get(business=antique)
    assert pet_wl.logo == pet.logo
    assert antique_wl.logo == antique.logo
    assert Branding.objects.get(tenant=pet.tenant).logo == pet.logo

    assert set(
        BusinessProductSubscription.objects.filter(business=pet).values_list("product_code", flat=True)
    ) == {"appointie", "shopie"}
    assert list(
        BusinessProductSubscription.objects.filter(business=antique).values_list("product_code", flat=True)
    ) == ["shopie"]
    shopie = BusinessProductSubscription.objects.get(business=pet, product_code="shopie")
    assert shopie.pets_pack_enabled is True

    assert ServiceCategory.objects.filter(business=pet).count() == len(PET_CATEGORIES)
    assert Service.objects.filter(business=pet).count() == len(PET_SERVICES)
    assert ServiceImage.objects.filter(service__business=pet, is_primary=True).count() == len(PET_SERVICES)
    assert ShopProduct.objects.filter(business=pet).count() == len(PET_PRODUCTS)
    assert Staff.objects.filter(business=pet, is_bookable=True).count() == len(PET_STAFF)
    assert StaffServiceAssignment.objects.filter(service__business=pet).count() == len(PET_SERVICES) * len(PET_STAFF)

    assert Service.objects.filter(business=antique).count() == 0
    assert ShopProduct.objects.filter(business=antique).count() == len(ANTIQUE_PRODUCTS)

    product = ShopProduct.objects.get(business=pet, sku="pedigree-adult-10kg")
    assert product.category == "pet_food"
    assert str(product.price) == "1878.00"
    assert product.image_url.startswith("/api/v1/media/")
    # Seeded POS + pickup orders consume 2 units from the opening stock of 20.
    assert product.stock_on_hand == Decimal("18")

    antique_product = ShopProduct.objects.get(business=antique, sku="teak-side-table")
    assert antique_product.category == "household"
    assert antique_product.image_url.startswith("/api/v1/media/")

    assert Customer.objects.filter(business=pet).count() == len(PET_CUSTOMERS)
    assert Customer.objects.filter(business=antique).count() == len(ANTIQUE_CUSTOMERS)
    assert ShopDeliveryZone.objects.filter(business=pet).count() == len(DEMO_ZONES)
    assert ShopDeliveryZone.objects.filter(business=antique).count() == len(DEMO_ZONES)
    assert ShopCoupon.objects.filter(business=pet).count() == len(DEMO_COUPONS)
    assert ShopCoupon.objects.filter(business=antique).count() == len(DEMO_COUPONS)
    assert ShopPet.objects.filter(business=pet).count() == len(PET_SPECS)
    assert ShopPet.objects.filter(business=antique).count() == 0
    assert Booking.objects.filter(business=pet).count() == len(PET_BOOKINGS)
    assert Booking.objects.filter(business=antique).count() == 0
    assert ShopOrder.objects.filter(business=pet, metadata__seed=SEED_TAG).count() == 4
    assert ShopOrder.objects.filter(business=antique, metadata__seed=SEED_TAG).count() == 4
    assert ShopOrder.objects.filter(business=pet, metadata__seed_key="pet-delivery-1").exists()
    assert ShopCoupon.objects.get(business=pet, code="WELCOME10").discount_type == "percent"
