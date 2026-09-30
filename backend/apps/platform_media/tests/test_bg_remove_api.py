from __future__ import annotations

from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


def _png_bytes(size=(80, 60)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (90, 40, 40)).save(buffer, format="PNG")
    return buffer.getvalue()


def _make_client(*, plan_code: str) -> tuple[APIClient, Business]:
    owner = User.objects.create_user(
        email=f"bg-remove-{plan_code}@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug=f"bg-remove-{plan_code}",
        display_name="BG Remove Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="BG Remove Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code=f"bg-{plan_code}"[:32],
        business_name="BG Remove Biz",
        display_name="BG Remove Biz",
        selected_product="shopie",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code=plan_code,
        defaults={"name": plan_code, "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_ends_at=timezone.now() + timedelta(days=30),
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return client, business


@pytest.mark.django_db
def test_remove_background_forbidden_on_starter() -> None:
    client, business = _make_client(plan_code="shopie-starter")
    upload = SimpleUploadedFile("pack.png", _png_bytes(), content_type="image/png")
    response = client.post(
        "/api/v1/media/upload",
        {
            "file": upload,
            "business": str(business.id),
            "folder_type": "products",
            "visibility": "public",
            "prepare_product_canvas": "true",
            "remove_background": "true",
        },
        format="multipart",
        HTTP_X_TENANT_ID=str(business.tenant_id),
        HTTP_X_BUSINESS_ID=str(business.id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
@patch("apps.platform_media.utils.images.remove_image_background_pil")
def test_remove_background_allowed_on_pro(mock_rembg) -> None:
    client, business = _make_client(plan_code="shopie-pro")

    def _cutout(image: Image.Image) -> Image.Image:
        return Image.new("RGBA", image.size, (12, 34, 56, 255))

    mock_rembg.side_effect = _cutout

    upload = SimpleUploadedFile("pack.png", _png_bytes(), content_type="image/png")
    response = client.post(
        "/api/v1/media/upload",
        {
            "file": upload,
            "business": str(business.id),
            "folder_type": "products",
            "visibility": "public",
            "prepare_product_canvas": "true",
            "remove_background": "true",
        },
        format="multipart",
        HTTP_X_TENANT_ID=str(business.tenant_id),
        HTTP_X_BUSINESS_ID=str(business.id),
    )
    assert response.status_code in {200, 201}, response.content
    mock_rembg.assert_called_once()
