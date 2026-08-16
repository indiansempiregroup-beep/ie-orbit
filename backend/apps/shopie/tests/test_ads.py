from __future__ import annotations

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.platform_media.models import Media, MediaType, MediaVisibility, StorageProviderType
from apps.shopie.api.serializers import ShopDashboardAdSerializer
from apps.shopie.services.ads import DashboardAdService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="shopie-ads@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-ads-tenant",
        display_name="ShopIE Ads Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Ads Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-ads",
        business_name="ShopIE Ads",
        display_name="ShopIE Ads",
        selected_product="shopie",
    )


@pytest.mark.django_db
def test_create_ad_drops_transient_picker_url(shop_business: Business) -> None:
    ad = DashboardAdService().create_ad(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"title": "Promo", "image_url": "blob:http://localhost/abc"},
    )
    assert ad.image_url == ""


@pytest.mark.django_db
def test_create_ad_stores_relative_media_path(shop_business: Business) -> None:
    ad = DashboardAdService().create_ad(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"title": "Promo", "image_url": "http://localhost:8000/media/uploads/ad.jpg"},
    )
    assert ad.image_url == "/media/uploads/ad.jpg"


@pytest.mark.django_db
def test_serializer_falls_back_to_media_public_url(shop_business: Business) -> None:
    media = Media.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        media_type=MediaType.IMAGE,
        original_filename="ad.jpg",
        storage_filename="ad.jpg",
        display_name="Ad",
        file_extension="jpg",
        mime_type="image/jpeg",
        file_size=12,
        storage_provider=StorageProviderType.LOCAL,
        storage_path="tenants/ads/ad.jpg",
        checksum="abc123",
        visibility=MediaVisibility.PUBLIC,
        metadata={"public_url": "/media/uploads/ad.jpg"},
    )
    ad = DashboardAdService().create_ad(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"title": "Promo", "media_id": media.id, "image_url": "blob:http://localhost/abc"},
    )
    assert ad.image_url == "/media/uploads/ad.jpg"
    ad.image_url = "blob:http://localhost/stale"
    ad.save(update_fields=["image_url"])
    payload = ShopDashboardAdSerializer(ad).data
    assert payload["image_url"] == "/media/uploads/ad.jpg"


@pytest.mark.django_db
def test_mobile_lists_active_ads(shop_business: Business) -> None:
    from rest_framework.test import APIClient

    DashboardAdService().create_ad(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"title": "Summer sale", "body": "Up to 40% off", "is_active": True},
    )
    DashboardAdService().create_ad(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"title": "Hidden", "is_active": False},
    )
    client = APIClient()
    response = client.get(
        "/api/v1/mobile/shop/ads",
        {
            "tenant_slug": shop_business.tenant.slug,
            "business_code": shop_business.business_code,
        },
    )
    assert response.status_code == 200
    titles = [row["title"] for row in response.json()["data"]]
    assert titles == ["Summer sale"]
