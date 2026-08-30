from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.management import call_command

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business, BusinessProductSubscription, WhiteLabelProfile
from apps.businesses.services.sanket_pet_shop_seed import CATEGORIES, FLAVOR_KEY, PRODUCTS, SERVICES
from apps.services.models import Service, ServiceCategory, ServiceImage
from apps.shopie.models import ShopProduct
from apps.staff.models import StaffServiceAssignment
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def sanket_pet_shop() -> Business:
    owner = User.objects.create_user(
        email="sanket-pet-owner@example.com",
        password="ValidPass123",
        first_name="Sanket",
        last_name="Pathak",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="sanket-pet-shop",
        display_name="Sanket Pet Shop",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Sanket Pet Shop")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="sanket-pet-shop",
        business_name="Sanket Pet Shop",
        display_name="Sanket Pet Shop",
        selected_product="appointie",
        currency="INR",
    )
    WhiteLabelProfile.objects.create(
        tenant=tenant,
        business=business,
        flavor_key=FLAVOR_KEY,
        app_slug="sanket-pet-shop",
        app_name="Sanket Pet Shop",
        primary_color="#d936bb",
        secondary_color="#567dd2",
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        pets_pack_enabled=False,
    )
    return business


@pytest.mark.django_db
def test_seed_sanket_pet_shop_is_idempotent(sanket_pet_shop: Business) -> None:
    call_command("seed_sanket_pet_shop")
    call_command("seed_sanket_pet_shop")

    assert ServiceCategory.objects.filter(business=sanket_pet_shop).count() == len(CATEGORIES)
    assert Service.objects.filter(business=sanket_pet_shop).count() == len(SERVICES)
    assert ServiceImage.objects.filter(service__business=sanket_pet_shop, is_primary=True).count() == len(SERVICES)
    assert ShopProduct.objects.filter(business=sanket_pet_shop).count() == len(PRODUCTS)
    assert StaffServiceAssignment.objects.filter(service__business=sanket_pet_shop).count() == len(SERVICES)

    bath = Service.objects.get(business=sanket_pet_shop, service_code="dog-bath-medium")
    assert bath.display_name == "Dog Bath — Medium"
    assert bath.prices.filter(is_default=True).first().base_price == 800
    assert bath.images.filter(is_primary=True).first().media.metadata["public_url"]

    product = ShopProduct.objects.get(business=sanket_pet_shop, sku="pedigree-adult-10kg")
    assert product.category == "pet_food"
    assert str(product.price) == "1878.00"
    assert product.image_url
    assert product.stock_on_hand == Decimal("20")

    shopie = BusinessProductSubscription.objects.get(business=sanket_pet_shop, product_code="shopie")
    assert shopie.pets_pack_enabled is True
