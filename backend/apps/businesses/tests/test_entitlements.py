from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.constants import DEFAULT_TRIAL_DAYS
from apps.businesses.models import (
    Branch,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.businesses.services.entitlements import EntitlementService
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def business() -> Business:
    owner = User.objects.create_user(
        email="entitlements-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="entitlements-tenant",
        display_name="Entitlements Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Entitlements Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="entitlements-biz",
        business_name="Entitlements Biz",
        display_name="Entitlements Biz",
        selected_product="appointie",
    )


@pytest.mark.django_db
def test_default_trial_days_is_fifteen() -> None:
    assert DEFAULT_TRIAL_DAYS == 15


@pytest.mark.django_db
def test_trial_uses_pro_limits(business: Business) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "AppointIE Starter", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.TRIALING,
        plan=plan,
        trial_ends_at=timezone.now() + timedelta(days=10),
    )
    entitlements = EntitlementService().resolve(business=business)
    assert entitlements.effective_max_staff == 5
    assert entitlements.effective_max_branches == 5
    assert "forecast" in entitlements.bi_features
    assert "reward_points" in entitlements.features


@pytest.mark.django_db
def test_soft_lock_blocks_mutations(business: Business) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "AppointIE Starter", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.TRIALING,
        plan=plan,
        trial_ends_at=timezone.now() - timedelta(hours=1),
    )
    service = EntitlementService()
    with pytest.raises(PermissionDenied):
        service.ensure_not_soft_locked(business=business)
    subscription = service.get_subscription(business=business)
    assert subscription is not None
    assert subscription.status == BusinessProductSubscriptionStatus.SOFT_LOCKED


@pytest.mark.django_db
def test_staff_limit_counts_bookable_only(business: Business) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "AppointIE Starter", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
    )
    Staff.objects.create(
        tenant=business.tenant,
        business=business,
        staff_code="owner",
        first_name="Owner",
        display_name="Owner",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=False,
    )
    Staff.objects.create(
        tenant=business.tenant,
        business=business,
        staff_code="stylist",
        first_name="Sam",
        display_name="Sam",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    service = EntitlementService()
    assert service.count_bookable_staff(business=business) == 1
    with pytest.raises(ValidationError):
        service.ensure_can_add_staff(business=business, is_bookable=True)


@pytest.mark.django_db
def test_addon_increases_effective_limits(business: Business) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "AppointIE Pro", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        extra_staff=2,
        extra_offices=3,
    )
    entitlements = EntitlementService().resolve(business=business)
    assert entitlements.effective_max_staff == 7
    assert entitlements.effective_max_branches == 8
    assert entitlements.total_amount_paise == 199900 + (2 * 19900) + (3 * 29900)


@pytest.mark.django_db
def test_downgrade_blocked_when_over_limit(business: Business) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "AppointIE Pro", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
    )
    for index in range(3):
        Staff.objects.create(
            tenant=business.tenant,
            business=business,
            staff_code=f"s{index}",
            first_name=f"S{index}",
            display_name=f"S{index}",
            employment_status=EmploymentStatus.ACTIVE,
            is_bookable=True,
        )
        Branch.objects.create(
            tenant=business.tenant,
            business=business,
            branch_code=f"b{index}",
            branch_name=f"Office {index}",
            display_name=f"Office {index}",
            address_line1="Street",
            city="Pune",
            country="IN",
            latitude="18.520400",
            longitude="73.856700",
            is_primary=index == 0,
        )
    with pytest.raises(ValidationError):
        EntitlementService().ensure_can_downgrade(
            business=business,
            target_plan_code="appointie-starter",
        )
