from __future__ import annotations

from io import BytesIO

import pytest
from django.core.management import call_command
from PIL import Image

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.platform_media.folders import (
    classify_legacy_folder_type,
    intended_folder_type,
    rewrite_folder_segment,
)
from apps.platform_media.models import (
    Media,
    MediaFolderType,
    MediaType,
    MediaVisibility,
    StorageProviderType,
)
from apps.platform_media.storage import get_storage_provider
from apps.tenancy.models import Organization, Tenant


def test_classify_legacy_folder_type() -> None:
    assert classify_legacy_folder_type(tags=["branding", "logo"]) == MediaFolderType.BRANDING
    assert classify_legacy_folder_type(tags=["shop", "product"]) == MediaFolderType.PRODUCTS
    assert classify_legacy_folder_type(tags=["shop", "pet", "photo"]) == MediaFolderType.PETS
    assert classify_legacy_folder_type(tags=["grow", "ad"]) == MediaFolderType.BRANDING
    assert intended_folder_type(tags=["profile", "photo", "staff"]) == MediaFolderType.STAFF
    assert intended_folder_type(tags=["profile", "photo"]) == MediaFolderType.STAFF
    assert intended_folder_type(tags=["profile", "photo", "customer"]) == MediaFolderType.CUSTOMERS


def test_rewrite_folder_segment() -> None:
    source = "tenants/t1/businesses/b1/business/abc-logo.png"
    assert rewrite_folder_segment(source, "branding") == (
        "tenants/t1/businesses/b1/branding/abc-logo.png"
    )
    assert rewrite_folder_segment(
        "tenants/t1/businesses/b1/customers/ops-avatar.png",
        "staff",
    ) == "tenants/t1/businesses/b1/staff/ops-avatar.png"


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (24, 24), "green").save(buffer, format="PNG")
    return buffer.getvalue()


def _put_media(
    *,
    tenant: Tenant,
    business: Business,
    filename: str,
    tags: list[str],
    checksum: str,
    payload: bytes,
    folder_type: str = "business",
) -> Media:
    provider = get_storage_provider()
    path = f"tenants/{tenant.id}/businesses/{business.id}/{folder_type}/{filename}"
    stem = path.rsplit(".", 1)[0]
    display_path = f"{stem}.display.webp"
    thumb_path = f"{stem}.thumb.webp"
    provider.save(path=path, file_obj=BytesIO(payload), content_type="image/png")
    provider.save(path=display_path, file_obj=BytesIO(payload), content_type="image/webp")
    provider.save(path=thumb_path, file_obj=BytesIO(payload), content_type="image/webp")
    return Media.objects.create(
        tenant=tenant,
        business=business,
        media_type=MediaType.IMAGE,
        original_filename=filename,
        storage_filename=filename,
        display_name=filename,
        file_extension="png",
        mime_type="image/png",
        file_size=len(payload),
        storage_provider=StorageProviderType.LOCAL,
        storage_path=path,
        checksum=checksum,
        visibility=MediaVisibility.PUBLIC,
        tags=tags,
        metadata={"display_path": display_path, "thumbnail_path": thumb_path},
    )


@pytest.mark.django_db
def test_rekey_media_folders_moves_legacy_business_objects(settings, tmp_path) -> None:
    settings.PLATFORM_MEDIA_STORAGE_PROVIDER = "local"
    settings.PLATFORM_MEDIA_LOCAL_ROOT = tmp_path
    owner = User.objects.create_user(
        email="rekey-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="rekey-tenant", display_name="Rekey Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Rekey Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="rekey-shop",
        business_name="Rekey Shop Pvt Ltd",
        display_name="Rekey Shop",
    )
    payload = _png_bytes()
    logo = _put_media(
        tenant=tenant,
        business=business,
        filename="logo.png",
        tags=["branding", "logo"],
        checksum="logo-checksum",
        payload=payload,
    )
    product = _put_media(
        tenant=tenant,
        business=business,
        filename="kibble.png",
        tags=["shop", "product"],
        checksum="product-checksum",
        payload=payload,
    )

    call_command("rekey_media_folders")
    logo.refresh_from_db()
    product.refresh_from_db()
    root = tmp_path
    assert "/branding/" in logo.storage_path
    assert "/products/" in product.storage_path
    assert logo.folder.folder_type == MediaFolderType.BRANDING
    assert product.folder.folder_type == MediaFolderType.PRODUCTS
    assert (root / logo.storage_path).exists()
    assert (root / product.storage_path).exists()
    assert not (root / f"tenants/{tenant.id}/businesses/{business.id}/business/logo.png").exists()
    assert not (root / f"tenants/{tenant.id}/businesses/{business.id}/business/kibble.png").exists()


@pytest.mark.django_db
def test_rekey_media_folders_moves_ops_profile_photos_to_staff(settings, tmp_path) -> None:
    settings.PLATFORM_MEDIA_STORAGE_PROVIDER = "local"
    settings.PLATFORM_MEDIA_LOCAL_ROOT = tmp_path
    owner = User.objects.create_user(
        email="rekey-profile@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="rekey-profile", display_name="Profile Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Profile Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="profile-shop",
        business_name="Profile Shop Pvt Ltd",
        display_name="Profile Shop",
    )
    payload = _png_bytes()
    ops_photo = _put_media(
        tenant=tenant,
        business=business,
        filename="ops.png",
        tags=["profile", "photo"],
        checksum="ops-photo",
        payload=payload,
        folder_type="customers",
    )
    customer_photo = _put_media(
        tenant=tenant,
        business=business,
        filename="customer.png",
        tags=["profile", "photo", "customer"],
        checksum="customer-photo",
        payload=payload,
        folder_type="customers",
    )

    call_command("rekey_media_folders")
    ops_photo.refresh_from_db()
    customer_photo.refresh_from_db()
    assert "/staff/" in ops_photo.storage_path
    assert ops_photo.folder.folder_type == MediaFolderType.STAFF
    assert "/customers/" in customer_photo.storage_path
    assert (tmp_path / ops_photo.storage_path).exists()
    assert (tmp_path / customer_photo.storage_path).exists()
    assert not (
        tmp_path / f"tenants/{tenant.id}/businesses/{business.id}/customers/ops.png"
    ).exists()
