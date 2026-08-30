from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserRole, UserStatus
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus, WhiteLabelProfile
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin_user() -> User:
    user = User.objects.create_user(
        email="platform-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    from apps.authentication.models import Role

    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def white_label_context() -> dict[str, str]:
    owner = User.objects.create_user(
        email="wl-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="wl-tenant", display_name="WL Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="WL Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="salon-main",
        business_name="Salon Main",
        display_name="Empire Salon",
    )
    profile = WhiteLabelProfile.objects.create(
        tenant=tenant,
        business=business,
        flavor_key="wl-tenant-salon-main",
        app_slug="wl-tenant-salon-main",
        app_name="Empire Salon",
        primary_color="#123456",
        secondary_color="#654321",
    )
    return {
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "business_code": business.business_code,
        "flavor_key": profile.flavor_key,
        "business_id": str(business.id),
    }


@pytest.mark.django_db
def test_mobile_bootstrap_by_flavor_key(api_client: APIClient, white_label_context: dict[str, str]) -> None:
    response = api_client.get(
        reverse("mobile-bootstrap"),
        {"flavor_key": white_label_context["flavor_key"]},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["app_name"] == "Empire Salon"
    assert payload["business_code"] == white_label_context["business_code"]
    assert payload["tenant_id"] == white_label_context["tenant_id"]
    assert payload["features"]["mobile_booking"] is True


@pytest.mark.django_db
def test_mobile_bootstrap_prefers_media_api_logo_over_stale_upload_path(
    api_client: APIClient, white_label_context: dict[str, str]
) -> None:
    business = Business.objects.get(business_code=white_label_context["business_code"])
    business.logo = "/api/v1/media/01a0537b-892b-769a-a04a-8c9b58d43b4f/file"
    business.save(update_fields=["logo", "updated_at"])
    profile = WhiteLabelProfile.objects.get(flavor_key=white_label_context["flavor_key"])
    profile.logo = (
        "/media/uploads/tenants/019f3c4f-e33e-7964-82b3-850a4ea4b435/"
        "businesses/019f3c4f-f737-7cda-851f-5a67253d4b22/businesses/"
        "019f3c4f-f737-7cda-851f-5a67253d4b22/business/missing-phoenix.jpg"
    )
    profile.save(update_fields=["logo", "updated_at"])

    response = api_client.get(
        reverse("mobile-bootstrap"),
        {"flavor_key": white_label_context["flavor_key"]},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["branding"]["logo"] == business.logo
    assert payload["business"]["logo"] == business.logo


@pytest.mark.django_db
def test_mobile_bootstrap_by_tenant_business(api_client: APIClient, white_label_context: dict[str, str]) -> None:
    response = api_client.get(
        reverse("mobile-bootstrap"),
        {
            "tenant_slug": white_label_context["tenant_slug"],
            "business_code": white_label_context["business_code"],
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["flavor_key"] == white_label_context["flavor_key"]


@pytest.mark.django_db
def test_bootstrap_includes_soft_locked_products(
    api_client: APIClient, white_label_context: dict[str, str]
) -> None:
    business = Business.objects.get(business_code=white_label_context["business_code"])
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.SOFT_LOCKED,
    )
    response = api_client.get(
        reverse("mobile-bootstrap"),
        {"flavor_key": white_label_context["flavor_key"]},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "shopie" in payload["enabled_products"]
    assert payload["features"]["mobile_shop"] is True
    assert payload["tenant_id"] == white_label_context["tenant_id"]


@pytest.mark.django_db
def test_platform_white_label_requires_platform_admin(
    api_client: APIClient,
    white_label_context: dict[str, str],
) -> None:
    response = api_client.get(reverse("platform-white-label-list"))
    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_platform_white_label_list_for_platform_admin(
    api_client: APIClient,
    platform_admin_user: User,
    white_label_context: dict[str, str],
) -> None:
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.get(reverse("platform-white-label-list"))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert any(row["flavor_key"] == white_label_context["flavor_key"] for row in rows)


@pytest.mark.django_db
def test_bi_overview_endpoint(api_client: APIClient, white_label_context: dict[str, str]) -> None:
    owner = User.objects.get(email="wl-owner@example.com")
    api_client.force_authenticate(user=owner)
    response = api_client.get(
        reverse("bi-overview"),
        HTTP_X_TENANT_ID=str(Tenant.objects.get(slug=white_label_context["tenant_slug"]).id),
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "summary" in payload
    assert "revenue" in payload
