from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.razorpay_client import RazorpayClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    user = User.objects.create_user(
        email="billing-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


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
            "slug": "billing-tenant",
            "display_name": "Billing Tenant",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )
    return response.json()["data"]["id"]


@pytest.mark.django_db
def test_billing_status_mock_mode(api_client: APIClient, user: User) -> None:
    authenticate(api_client, user)
    response = api_client.get(reverse("billing-status"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["provider"] == "razorpay"
    assert payload["configured"] is False
    assert payload["mock_mode"] is True


@pytest.mark.django_db
def test_billing_checkout_creates_mock_order(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "billing-biz",
            "business_name": "Billing Biz",
            "display_name": "Billing Biz",
        },
        format="json",
    )
    business_id = business_response.json()["data"]["id"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=tenant_id,
        HTTP_X_BUSINESS_ID=business_id,
    )

    response = api_client.post(
        reverse("billing-checkout"),
        {"product_code": "appointie", "plan_code": "appointie-starter", "business_id": business_id},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["mock_mode"] is True
    assert payload["order_id"].startswith("order_mock_")
    assert payload["amount"] == 99900


@pytest.mark.django_db
def test_razorpay_mock_order_client() -> None:
    client = RazorpayClient()
    order = client.create_order(amount_paise=100, currency="INR", receipt="test-receipt")
    assert order["id"].startswith("order_mock_")
    assert client.verify_payment_signature(
        order_id=order["id"],
        payment_id="pay_mock",
        signature="ignored",
    )


@pytest.mark.django_db
def test_checkout_service_status() -> None:
    status_payload = CheckoutService().get_status()
    assert status_payload["provider"] == "razorpay"
