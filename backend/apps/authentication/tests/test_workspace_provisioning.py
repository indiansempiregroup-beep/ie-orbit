from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.platform_admin.models import (
    PlatformAffiliate,
    PlatformAffiliateCode,
    PlatformAffiliateStatus,
    PlatformReferral,
)
from apps.tenancy.models import Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def _payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "email": "owner@example.com",
        "password": "ValidPass123",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "slug": "ada-salon",
        "business_name": "Ada Salon",
        "selected_product": "appointie",
        "timezone": "Asia/Kolkata",
        "currency": "INR",
    }
    body.update(overrides)
    return body


@pytest.mark.django_db
def test_register_business_provisions_workspace_and_session(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("auth-register-business"),
        _payload(),
        format="json",
    )

    assert response.status_code == 201, response.content
    payload = response.json()["data"]
    assert payload["access"]
    assert payload["refresh"]
    assert payload["tenant"]["slug"] == "ada-salon"
    assert payload["business"]["business_name"] == "Ada Salon"
    assert "business_owner" in payload["user"]["roles"]
    assert Tenant.objects.filter(slug="ada-salon").exists()
    assert User.objects.filter(email="owner@example.com").exists()


@pytest.mark.django_db
def test_register_business_rejects_unknown_affiliate_code_before_create(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("auth-register-business"),
        _payload(affiliate_code="NOPE"),
        format="json",
    )

    assert response.status_code in {400, 422}
    assert User.objects.filter(email="owner@example.com").exists() is False
    assert Tenant.objects.filter(slug="ada-salon").exists() is False


@pytest.mark.django_db
def test_register_business_attributes_affiliate_code(api_client: APIClient) -> None:
    affiliate = PlatformAffiliate.objects.create(
        name="Growth Partner",
        email="partner@example.com",
        status=PlatformAffiliateStatus.ACTIVE,
    )
    PlatformAffiliateCode.objects.create(affiliate=affiliate, code="PARTNER1", is_active=True)

    response = api_client.post(
        reverse("auth-register-business"),
        _payload(affiliate_code="partner-1"),
        format="json",
    )

    assert response.status_code == 201, response.content
    tenant_id = response.json()["data"]["tenant"]["id"]
    referral = PlatformReferral.objects.get(referred_tenant_id=tenant_id)
    assert referral.affiliate_id == affiliate.id
    assert referral.metadata.get("code") == "PARTNER1"
    assert referral.metadata.get("payment_account_opened") is True


@pytest.mark.django_db
def test_register_business_subscribes_to_selected_plan(api_client: APIClient) -> None:
    from apps.businesses.models import BusinessProductSubscription
    from apps.businesses.services.plan_catalog import list_plan_definitions

    plans = list_plan_definitions("appointie")
    assert plans
    selected = next((plan for plan in plans if not plan.get("is_default")), plans[-1])
    plan_code = str(selected["code"])

    response = api_client.post(
        reverse("auth-register-business"),
        _payload(selected_product="appointie", plan_code=plan_code),
        format="json",
    )

    assert response.status_code == 201, response.content
    business_id = response.json()["data"]["business"]["id"]
    subscription = BusinessProductSubscription.objects.get(business_id=business_id, product_code="appointie")
    assert subscription.plan is not None
    assert subscription.plan.code == plan_code


@pytest.mark.django_db
def test_register_business_subscribes_to_multiple_products(api_client: APIClient) -> None:
    from apps.businesses.models import BusinessProductSubscription
    from apps.businesses.services.plan_catalog import list_plan_definitions

    appointie_plans = list_plan_definitions("appointie")
    shopie_plans = list_plan_definitions("shopie")
    assert appointie_plans and shopie_plans
    appointie_plan = str(appointie_plans[0]["code"])
    shopie_plan = str(shopie_plans[0]["code"])

    response = api_client.post(
        reverse("auth-register-business"),
        _payload(
            selected_products=["appointie", "shopie"],
            plan_codes={"appointie": appointie_plan, "shopie": shopie_plan},
        ),
        format="json",
    )

    assert response.status_code == 201, response.content
    payload = response.json()["data"]
    assert payload["business"]["selected_product"] == "appointie"
    codes = set(
        BusinessProductSubscription.objects.filter(business_id=payload["business"]["id"]).values_list(
            "product_code", flat=True
        )
    )
    assert codes == {"appointie", "shopie"}


@pytest.mark.django_db
def test_register_business_rejects_unknown_plan_code(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("auth-register-business"),
        _payload(selected_product="appointie", plan_code="shopie-pro"),
        format="json",
    )

    assert response.status_code in {400, 422}
    assert User.objects.filter(email="owner@example.com").exists() is False
    assert Tenant.objects.filter(slug="ada-salon").exists() is False
