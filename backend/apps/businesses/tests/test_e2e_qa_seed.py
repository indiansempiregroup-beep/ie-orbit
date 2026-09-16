from __future__ import annotations

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.authentication.models import User
from apps.businesses.models import BusinessProductSubscription
from apps.businesses.services.e2e_qa_seed import seed_e2e_qa_tenant
from apps.customers.models import Customer
from apps.staff.models import Staff
from apps.tenancy.models import Tenant


@override_settings(DEBUG=False, ALLOWED_HOSTS=["api.ie-orbit.com"])
def test_seed_e2e_qa_command_refuses_production() -> None:
    with pytest.raises(CommandError, match="Refusing to seed outside UAT"):
        call_command("seed_e2e_qa_tenant", owner_email="qa-owner@example.com")


@pytest.mark.django_db
def test_seed_e2e_qa_tenant_is_idempotent() -> None:
    first = seed_e2e_qa_tenant(
        owner_email="qa-owner@example.com",
        staff_email="qa-staff@example.com",
        admin_email="qa-admin@example.com",
        customer_email="qa-customer@example.com",
    )
    second = seed_e2e_qa_tenant(
        owner_email="qa-owner@example.com",
        staff_email="qa-staff@example.com",
        admin_email="qa-admin@example.com",
        customer_email="qa-customer@example.com",
    )

    assert first.tenant_id == second.tenant_id
    assert Tenant.objects.filter(slug="e2e-qa").count() == 1
    owner = User.objects.get(email="qa-owner@example.com")
    assert owner.user_roles.filter(role__code="business_owner").exists()
    admin = User.objects.get(email="qa-admin@example.com")
    assert admin.user_roles.filter(role__code="platform_admin").exists()
    assert not admin.user_roles.filter(role__code="business_owner").exists()
    assert Staff.objects.filter(email="qa-staff@example.com").count() == 1
    assert Customer.objects.filter(email="qa-customer@example.com").count() == 1
    assert BusinessProductSubscription.objects.filter(
        business_id=first.business_id, product_code="appointie"
    ).exists()
    assert BusinessProductSubscription.objects.filter(
        business_id=first.business_id, product_code="shopie"
    ).exists()
