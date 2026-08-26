from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import (
    Branch,
    BranchStatus,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.entitlements import EntitlementService
from apps.businesses.services.subscription_lifecycle import SubscriptionLifecycleService
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def business() -> Business:
    owner = User.objects.create_user(
        email="lifecycle-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="lifecycle-tenant",
        display_name="Lifecycle Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Lifecycle Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="lifecycle-biz",
        business_name="Lifecycle Biz",
        display_name="Lifecycle Biz",
        selected_product="appointie",
        timezone="Asia/Kolkata",
    )


def _active_pro(business: Business, *, days_left: int = 2) -> BusinessProductSubscription:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "Orbit Appoint Pro", "is_public": True},
    )
    now = timezone.now()
    return BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=now - timedelta(days=28),
        current_period_ends_at=now + timedelta(days=days_left),
    )


@pytest.mark.django_db
def test_downgrade_during_paid_period_is_scheduled(business: Business) -> None:
    subscription = _active_pro(business, days_left=2)
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "Orbit Appoint Starter", "is_public": True},
    )
    Branch.objects.create(
        tenant=business.tenant,
        business=business,
        branch_code="main",
        branch_name="Main",
        display_name="Main",
        is_primary=True,
        address_line1="1 Road",
        city="Pune",
        country="India",
        latitude="18.52",
        longitude="73.85",
        status=BranchStatus.ACTIVE,
    )
    actor = business.tenant.owner
    result = BusinessService().change_product_plan(
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        actor=actor,
    )
    result.refresh_from_db()
    subscription.refresh_from_db()
    assert result.pending_plan_id == starter.id
    assert subscription.plan.code == "appointie-pro"
    assert subscription.current_period_ends_at == result.current_period_ends_at
    entitlements = EntitlementService().resolve(business=business)
    assert entitlements.plan_code == "appointie-pro"
    assert entitlements.effective_max_staff == 5


@pytest.mark.django_db
def test_period_end_applies_pending_plan(business: Business) -> None:
    subscription = _active_pro(business, days_left=0)
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "Orbit Appoint Starter", "is_public": True},
    )
    Branch.objects.create(
        tenant=business.tenant,
        business=business,
        branch_code="main",
        branch_name="Main",
        display_name="Main",
        is_primary=True,
        address_line1="1 Road",
        city="Pune",
        country="India",
        latitude="18.52",
        longitude="73.85",
        status=BranchStatus.ACTIVE,
    )
    subscription.pending_plan = starter
    subscription.pending_plan_scheduled_at = timezone.now() - timedelta(days=1)
    subscription.current_period_ends_at = timezone.now() - timedelta(minutes=1)
    subscription.save()

    stats = SubscriptionLifecycleService().apply_due_period_ends()
    subscription.refresh_from_db()
    assert stats["applied"] == 1
    assert subscription.plan_id == starter.id
    assert subscription.pending_plan_id is None
    assert subscription.status == BusinessProductSubscriptionStatus.ACTIVE
    assert subscription.current_period_ends_at > timezone.now()


@pytest.mark.django_db
def test_period_end_without_pending_soft_locks(business: Business) -> None:
    subscription = _active_pro(business, days_left=0)
    subscription.current_period_ends_at = timezone.now() - timedelta(minutes=1)
    subscription.save(update_fields=["current_period_ends_at", "updated_at"])

    stats = SubscriptionLifecycleService().apply_due_period_ends()
    subscription.refresh_from_db()
    assert stats["soft_locked"] == 1
    assert subscription.status == BusinessProductSubscriptionStatus.SOFT_LOCKED


@pytest.mark.django_db
def test_renewal_reminder_dedupes_same_day(business: Business) -> None:
    _active_pro(business, days_left=3)
    service = SubscriptionLifecycleService()
    first = service.send_renewal_reminders()
    second = service.send_renewal_reminders()
    assert first["sent"] == 1
    assert second["sent"] == 0
    assert second["skipped"] >= 1


@pytest.mark.django_db
def test_upgrade_applies_immediately(business: Business) -> None:
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "Orbit Appoint Starter", "is_public": True},
    )
    now = timezone.now()
    BusinessProductSubscription.objects.create(
        tenant=business.tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=starter,
        current_period_starts_at=now - timedelta(days=10),
        current_period_ends_at=now + timedelta(days=20),
    )
    result = BusinessService().change_product_plan(
        business=business,
        product_code="appointie",
        plan_code="appointie-pro",
        actor=business.tenant.owner,
    )
    result.refresh_from_db()
    assert result.plan.code == "appointie-pro"
    assert result.pending_plan_id is None
    assert result.current_period_ends_at > now + timedelta(days=25)


@pytest.mark.django_db
def test_cancel_pending_plan_change(business: Business) -> None:
    subscription = _active_pro(business, days_left=5)
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "Orbit Appoint Starter", "is_public": True},
    )
    Branch.objects.create(
        tenant=business.tenant,
        business=business,
        branch_code="main",
        branch_name="Main",
        display_name="Main",
        is_primary=True,
        address_line1="1 Road",
        city="Pune",
        country="India",
        latitude="18.52",
        longitude="73.85",
        status=BranchStatus.ACTIVE,
    )
    BusinessService().change_product_plan(
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        actor=business.tenant.owner,
    )
    subscription.refresh_from_db()
    assert subscription.pending_plan_id == starter.id
    BusinessService().cancel_pending_plan_change(
        business=business,
        product_code="appointie",
        actor=business.tenant.owner,
    )
    subscription.refresh_from_db()
    assert subscription.pending_plan_id is None


@pytest.mark.django_db
def test_schedule_downgrade_blocked_when_usage_exceeds(business: Business) -> None:
    _active_pro(business, days_left=5)
    for index in range(2):
        Branch.objects.create(
            tenant=business.tenant,
            business=business,
            branch_code=f"office-{index}",
            branch_name=f"Office {index}",
            display_name=f"Office {index}",
            is_primary=index == 0,
            address_line1="1 Road",
            city="Pune",
            country="India",
            latitude="18.52",
            longitude="73.85",
            status=BranchStatus.ACTIVE,
        )
    with pytest.raises(ValidationError):
        BusinessService().change_product_plan(
            business=business,
            product_code="appointie",
            plan_code="appointie-starter",
            actor=business.tenant.owner,
        )
