from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProfile, BusinessSettings


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
def test_patch_me_creates_business_when_missing(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    response = api_client.patch(
        reverse("business-me"),
        {
            "business_name": "Studio One",
            "display_name": "Studio One",
            "business_type": "service-business",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["business_name"] == "Studio One"
    assert Business.objects.filter(tenant_id=tenant_id, business_name="Studio One").exists()


@pytest.mark.django_db
def test_business_product_selection(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "product-salon",
            "business_name": "Product Salon",
            "display_name": "Product Salon",
            "selected_product": "invoiceie",
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["selected_product"] == "invoiceie"
    assert len(payload["product_subscriptions"]) == 1
    assert payload["product_subscriptions"][0]["product_code"] == "invoiceie"
    business_id = payload["id"]
    assert BusinessProductSubscription.objects.filter(
        business_id=business_id,
        product_code="invoiceie",
    ).exists()


@pytest.mark.django_db
def test_subscribe_product_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    create_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "subscribe-salon",
            "business_name": "Subscribe Salon",
            "display_name": "Subscribe Salon",
            "selected_product": "appointie",
        },
        format="json",
    )
    business_id = create_response.json()["data"]["id"]

    response = api_client.post(
        reverse("business-subscribe-product", kwargs={"pk": business_id}),
        {"product_code": "crmie", "set_active": True},
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["selected_product"] == "crmie"
    subscribed_codes = {item["product_code"] for item in payload["product_subscriptions"]}
    assert subscribed_codes == {"appointie", "crmie"}


@pytest.mark.django_db
def test_cannot_activate_unsubscribed_product(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    create_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "locked-salon",
            "business_name": "Locked Salon",
            "display_name": "Locked Salon",
            "selected_product": "appointie",
        },
        format="json",
    )
    business_id = create_response.json()["data"]["id"]

    response = api_client.patch(
        reverse("business-detail", kwargs={"pk": business_id}),
        {"selected_product": "invoiceie"},
        format="json",
    )

    assert response.status_code in {400, 422}


@pytest.mark.django_db
def test_unsubscribe_product_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    create_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "unsub-salon",
            "business_name": "Unsub Salon",
            "display_name": "Unsub Salon",
            "selected_product": "appointie",
        },
        format="json",
    )
    business_id = create_response.json()["data"]["id"]

    subscribe_response = api_client.post(
        reverse("business-subscribe-product", kwargs={"pk": business_id}),
        {"product_code": "crmie", "plan_code": "crmie-starter", "set_active": False},
        format="json",
    )
    assert subscribe_response.status_code == 200

    response = api_client.delete(
        reverse("business-unsubscribe-product", kwargs={"pk": business_id, "product_code": "crmie"}),
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    active_codes = {
        item["product_code"]
        for item in payload["product_subscriptions"]
        if item["status"] in {"trialing", "active"}
    }
    assert active_codes == {"appointie"}
    assert payload["selected_product"] == "appointie"


@pytest.mark.django_db
def test_change_product_plan_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    create_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "plan-salon",
            "business_name": "Plan Salon",
            "display_name": "Plan Salon",
            "selected_product": "appointie",
        },
        format="json",
    )
    business_id = create_response.json()["data"]["id"]

    response = api_client.patch(
        reverse("business-change-product-plan", kwargs={"pk": business_id, "product_code": "appointie"}),
        {"plan_code": "appointie-pro"},
        format="json",
    )

    assert response.status_code == 200
    subscription = next(
        item
        for item in response.json()["data"]["product_subscriptions"]
        if item["product_code"] == "appointie"
    )
    assert subscription["plan_code"] == "appointie-pro"


@pytest.mark.django_db
def test_list_product_plans(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    response = api_client.get(reverse("product-plan-list"), {"product_code": "appointie"})

    assert response.status_code == 200
    plans = response.json()["data"]
    assert len(plans) >= 2
    assert plans[0]["code"].startswith("appointie-")


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
