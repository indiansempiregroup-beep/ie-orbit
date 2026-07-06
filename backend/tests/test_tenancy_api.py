from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.tenancy.models import Branding, Organization, Subscription, TenantSettings


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="tenant-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


def authenticate(api_client: APIClient, user: User) -> str:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


@pytest.mark.django_db
def test_create_tenant_creates_foundation_records(api_client: APIClient, user: User) -> None:
    authenticate(api_client, user)

    response = api_client.post(
        reverse("tenant-list-create"),
        {
            "slug": "demo-salon",
            "display_name": "Demo Salon",
            "legal_name": "Demo Salon Pvt Ltd",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )

    assert response.status_code == 201
    tenant_id = response.json()["data"]["id"]
    assert Organization.objects.filter(tenant_id=tenant_id, name="Demo Salon").exists()
    assert Branding.objects.filter(tenant_id=tenant_id, app_name="Demo Salon").exists()
    assert Subscription.objects.filter(tenant_id=tenant_id).exists()
    assert TenantSettings.objects.filter(
        tenant_id=tenant_id,
        timezone="Asia/Kolkata",
        currency="INR",
        language="en-IN",
    ).exists()


@pytest.mark.django_db
def test_tenant_header_resolves_current_settings(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    create_response = api_client.post(
        reverse("tenant-list-create"),
        {"slug": "header-tenant", "display_name": "Header Tenant"},
        format="json",
    )
    tenant_id = create_response.json()["data"]["id"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=tenant_id,
    )

    response = api_client.get(reverse("tenant-settings"))

    assert response.status_code == 200
    assert response.json()["data"]["timezone"] == "UTC"
    assert response.json()["data"]["branding"]["app_name"] == "Header Tenant"


@pytest.mark.django_db
def test_authenticated_owner_fallback_resolves_tenant(api_client: APIClient, user: User) -> None:
    authenticate(api_client, user)
    api_client.post(
        reverse("tenant-list-create"),
        {"slug": "owner-fallback", "display_name": "Owner Fallback"},
        format="json",
    )

    response = api_client.get(reverse("organization-me"))

    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Owner Fallback"
