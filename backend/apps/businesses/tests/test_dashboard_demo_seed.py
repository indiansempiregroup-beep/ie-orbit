from __future__ import annotations

import pytest

from apps.bookings.models import Booking, BookingReview, BookingStatus
from apps.businesses.models import Branch, BusinessProductSubscription
from apps.businesses.services.dashboard_demo_seed import seed_dashboard_demo
from apps.customers.models import Customer, CustomerLoyaltyAccount
from apps.notifications.models import Notification
from apps.staff.models import Staff


@pytest.mark.django_db
def test_seed_dashboard_demo_is_idempotent_and_rich() -> None:
    first = seed_dashboard_demo()
    second = seed_dashboard_demo()

    assert first["flavor_key"] == "demo-MAIN"
    assert first["customers"] == 12
    assert first["branches"] == 2
    assert first["bookings_total"] == 32
    assert first["notifications"] == 6
    assert second["bookings_created"] == 0

    business_code = first["business_code"]
    tenant_slug = first["tenant_slug"]
    assert Branch.objects.filter(business__business_code=business_code, business__tenant__slug=tenant_slug).count() == 2
    assert Customer.objects.filter(business__business_code=business_code, business__tenant__slug=tenant_slug).count() == 12
    assert Booking.objects.filter(business__business_code=business_code, business__tenant__slug=tenant_slug).count() == 32
    assert BookingReview.objects.filter(business__business_code=business_code, business__tenant__slug=tenant_slug).count() >= 7
    assert Notification.objects.filter(business__business_code=business_code, business__tenant__slug=tenant_slug).count() == 6
    assert CustomerLoyaltyAccount.objects.filter(
        business__business_code=business_code,
        business__tenant__slug=tenant_slug,
        points_balance__gt=0,
    ).exists()
    assert Staff.objects.filter(
        business__business_code=business_code,
        business__tenant__slug=tenant_slug,
        staff_code="demo-manager",
    ).exists()
    assert Booking.objects.filter(
        business__business_code=business_code,
        business__tenant__slug=tenant_slug,
        status=BookingStatus.COMPLETED,
    ).count() >= 10
    subscription = BusinessProductSubscription.objects.get(
        business__business_code=business_code,
        business__tenant__slug=tenant_slug,
        product_code="appointie",
    )
    assert subscription.plan is not None
    assert subscription.plan.code == "appointie-pro"
    assert subscription.status == "trialing"
