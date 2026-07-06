from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business, BusinessProfile, BusinessSettings


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="business-owner@example.com",
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


def create_tenant(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("tenant-list-create"),
        {
            "slug": "business-tenant",
            "display_name": "Business Tenant",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )
    return response.json()["data"]["id"]


@pytest.mark.django_db
def test_create_business_creates_profile_and_settings(
    api_client: APIClient,
    user: User,
) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "main",
            "business_name": "Main Salon Pvt Ltd",
            "display_name": "Main Salon",
            "industry_category": "salon",
            "city": "Mumbai",
            "country": "India",
            "tags": ["Salon", "Beauty"],
            "profile": {"mission": "Professional care."},
            "settings": {"time_slot_interval": 30},
        },
        format="json",
    )

    assert response.status_code == 201
    business_id = response.json()["data"]["id"]
    assert Business.objects.filter(id=business_id, tenant_id=tenant_id).exists()
    assert BusinessProfile.objects.filter(
        business_id=business_id, mission="Professional care."
    ).exists()
    assert BusinessSettings.objects.filter(business_id=business_id, time_slot_interval=30).exists()


@pytest.mark.django_db
def test_business_search_and_me(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "searchable",
            "business_name": "Searchable Clinic",
            "display_name": "Searchable Clinic",
            "industry_category": "clinic",
            "city": "Pune",
            "country": "India",
            "tags": ["health"],
        },
        format="json",
    )

    search_response = api_client.get(
        reverse("business-list-create"),
        {"category": "clinic", "city": "Pune", "tags": "health"},
    )
    me_response = api_client.get(reverse("business-me"))

    assert search_response.status_code == 200
    assert len(search_response.json()["data"]) == 1
    assert me_response.status_code == 200
    assert me_response.json()["data"]["business_code"] == "searchable"
