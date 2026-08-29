from __future__ import annotations

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.shopie.models import ShopProduct
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        email="bulk-catalog-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def shop_workspace(owner: User) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.create(
        slug="bulk-catalog-tenant",
        display_name="Bulk Catalog Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Bulk Catalog Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="bulk-catalog-biz",
        business_name="Bulk Catalog Biz",
        display_name="Bulk Catalog Biz",
        selected_product="shopie",
    )
    return tenant, business


def authenticate(api_client: APIClient, owner: User, tenant: Tenant) -> None:
    response = api_client.post(
        reverse("auth-login"),
        {"email": owner.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=str(tenant.id),
    )


@pytest.mark.django_db
def test_bulk_create_and_patch_products(
    api_client: APIClient,
    owner: User,
    shop_workspace: tuple[Tenant, Business],
) -> None:
    tenant, business = shop_workspace
    authenticate(api_client, owner, tenant)
    url = reverse("shop-product-bulk")

    created = api_client.post(
        url,
        {
            "business_id": str(business.id),
            "items": [
                {
                    "name": "Rice 5kg",
                    "price": "200.00",
                    "gst_rate": "5",
                    "category": "food_grocery",
                    "barcodes": [{"code": "BULK-API-1", "barcode_type": "internal", "is_primary": True}],
                },
                {
                    "name": "Duplicate rice",
                    "price": "180.00",
                    "barcodes": [{"code": "BULK-API-1", "barcode_type": "internal"}],
                },
                {"name": "Atta 10kg", "price": "400.00", "stock_on_hand": "8"},
            ],
        },
        format="json",
    )
    assert created.status_code == 200, created.content
    payload = created.json()["data"]
    assert [row["name"] for row in payload["created"]] == ["Rice 5kg", "Atta 10kg"]
    assert len(payload["errors"]) == 1
    assert payload["errors"][0]["index"] == 1

    ids = [row["id"] for row in payload["created"]]
    patched = api_client.patch(
        url,
        {
            "business_id": str(business.id),
            "ids": ids,
            "updates": {"status": "inactive", "price": {"percent": "10"}},
        },
        format="json",
    )
    assert patched.status_code == 200, patched.content
    updated = patched.json()["data"]["updated"]
    assert len(updated) == 2
    by_name = {row["name"]: row for row in updated}
    assert by_name["Rice 5kg"]["status"] == "inactive"
    assert Decimal(by_name["Rice 5kg"]["price"]) == Decimal("220.00")
    assert Decimal(by_name["Atta 10kg"]["price"]) == Decimal("440.00")
    assert ShopProduct.objects.filter(business=business).count() == 2
