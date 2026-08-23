from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import ShopBusinessSettings
from apps.shopie.services.referrals import CustomerReferralService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="shopie-referral@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-referral-tenant",
        display_name="ShopIE Referral Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Referral Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-ref",
        business_name="ShopIE Referral",
        display_name="ShopIE Referral",
        selected_product="shopie",
    )


def _enable_program(business: Business, *, points: int = 75, event: str = "signup") -> None:
    ShopBusinessSettings.objects.update_or_create(
        tenant=business.tenant,
        business=business,
        defaults={
            "metadata": {
                "grow": {
                    "referral": {
                        "enabled": True,
                        "points_per_referral": points,
                        "success_event": event,
                    }
                }
            }
        },
    )


def _customer(business: Business, *, code: str, email: str, name: str) -> Customer:
    return Customer.objects.create(
        tenant=business.tenant,
        business=business,
        customer_code=code,
        first_name=name,
        display_name=name,
        email=email,
    )


@pytest.mark.django_db
def test_mobile_referral_program_and_apply(shop_business: Business) -> None:
    _enable_program(shop_business)
    referrer = _customer(shop_business, code="ref-1", email="referrer@example.com", name="Referrer")
    referred_user = User.objects.create_user(
        email="friend@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        first_name="Friend",
    )

    with patch.object(CustomerReferralService, "is_program_active", return_value=True):
        code_row = CustomerReferralService().get_or_create_code(
            tenant=shop_business.tenant,
            business=shop_business,
            customer=referrer,
        )
        client = APIClient()
        public = client.get(
            "/api/v1/mobile/shop/referral",
            {
                "tenant_slug": shop_business.tenant.slug,
                "business_code": shop_business.business_code,
            },
        )
        assert public.status_code == 200
        body = public.json()["data"]
        assert body["enabled"] is True
        assert body["points_per_referral"] == 75
        assert body["code"] is None

        client.force_authenticate(user=referred_user)
        apply_res = client.post(
            "/api/v1/mobile/shop/referral/apply",
            {
                "tenant_slug": shop_business.tenant.slug,
                "business_code": shop_business.business_code,
                "referral_code": code_row.code,
            },
            format="json",
        )
        assert apply_res.status_code == 200
        applied = apply_res.json()["data"]
        assert applied["applied_status"] in {"pending", "qualified", "rewarded"}
        assert applied["applied_code"] == code_row.code
