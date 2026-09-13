from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.authentication.tests.otp_helpers import authenticate_api_client
from apps.businesses.models import Business
from apps.platform_admin.models import PlatformAuthSettings
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin(api_client: APIClient) -> User:
    user = User.objects.create_user(
        email="platform-auth-admin@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    user.is_superuser = True
    user.save(update_fields=["is_superuser", "updated_at"])
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate_api_client(api_client, user)
    return user


@pytest.fixture
def sender_business() -> Business:
    owner = User.objects.create_user(
        email="wa-sender-owner@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="wa-sender-tenant", display_name="WA Sender", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="WA Sender Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="wa-sender-biz",
        business_name="WA Sender Biz",
        display_name="WA Sender Biz",
        selected_product="appointie",
    )


@pytest.mark.django_db
def test_platform_auth_settings_crud(
    api_client: APIClient,
    platform_admin: User,
    sender_business: Business,
) -> None:
    get_empty = api_client.get(reverse("platform-auth-settings"))
    assert get_empty.status_code == 200
    assert get_empty.json()["data"]["business_id"] is None
    catalog = get_empty.json()["data"]["catalog"]["mapped"]
    assert any(row["event_type"] == "BookingConfirmed" for row in catalog)
    assert any(row["event_type"] == "AuthOtp" for row in catalog)

    put_response = api_client.put(
        reverse("platform-auth-settings"),
        {
            "tenant_slug": sender_business.tenant.slug,
            "business_code": sender_business.business_code,
            "reason": "qa configure ops whatsapp sender",
        },
        format="json",
    )
    assert put_response.status_code == 200, put_response.content
    body = put_response.json()["data"]
    assert body["business_id"] == str(sender_business.id)
    assert body["tenant_slug"] == sender_business.tenant.slug

    row = PlatformAuthSettings.objects.get(key="default")
    assert row.ops_otp_whatsapp_business_id == sender_business.id

    from apps.authentication.services.auth_otp import AuthOtpService

    assert AuthOtpService()._resolve_ops_whatsapp_sender_business() == sender_business
