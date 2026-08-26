from __future__ import annotations

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import Role, User, UserRole, UserStatus
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin_user() -> User:
    user = User.objects.create_user(
        email="tenant-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.mark.django_db
def test_tenant_detail_returns_all_product_billings(
    api_client: APIClient,
    platform_admin_user: User,
) -> None:
    owner = User.objects.create_user(
        email="dual-product-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="dual-product",
        display_name="Dual Product Co",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Dual Product Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="dual-biz",
        business_name="Dual Biz",
        display_name="Dual Biz",
        selected_product="appointie",
    )
    appointie_plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "Orbit Appoint Pro", "is_public": True},
    )
    shopie_plan, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-starter",
        defaults={"name": "Orbit Mart Starter", "is_public": True},
    )
    now = timezone.now()
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=appointie_plan,
        current_period_starts_at=now,
        current_period_ends_at=now + timedelta(days=30),
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.TRIALING,
        plan=shopie_plan,
        trial_ends_at=now + timedelta(days=15),
    )

    api_client.force_authenticate(user=platform_admin_user)
    listing = api_client.get(reverse("platform-tenant-admin-list"))
    assert listing.status_code == 200
    tenant_row = next(item for item in listing.json()["data"]["tenants"] if item["id"] == str(tenant.id))
    assert {item["product_code"] for item in tenant_row["products"]} == {"appointie", "shopie"}
    assert {item["plan_code"] for item in tenant_row["products"]} == {"appointie-pro", "shopie-starter"}

    detail = api_client.get(reverse("platform-tenant-admin-detail", kwargs={"tenant_id": tenant.id}))
    assert detail.status_code == 200
    payload = detail.json()["data"]["businesses"][0]
    codes = [item["product_code"] for item in payload["billings"]]
    assert codes == ["appointie", "shopie"]
    assert payload["billing"]["product_code"] == "appointie"
    assert payload["billing"]["plan_code"] == "appointie-pro"
    shopie = next(item for item in payload["billings"] if item["product_code"] == "shopie")
    assert shopie["plan_code"] == "shopie-starter"
    assert shopie["billing_state"] == "trialing"
