from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services.bookings import BookingService
from apps.businesses.models import (
    Branch,
    BranchStatus,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    BusinessSettings,
)
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.customers.services.loyalty import LoyaltyService
from apps.services.models import Service, ServicePricing, ServiceStatus
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def loyalty_setup(db):
    owner = User.objects.create_user(
        email="loyalty-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="loyalty-tenant",
        display_name="Loyalty Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Loyalty Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="loyalty-biz",
        business_name="Loyalty Biz",
        display_name="Loyalty Biz",
        selected_product="appointie",
        currency="INR",
    )
    BusinessSettings.objects.create(
        tenant=tenant,
        business=business,
        loyalty_preferences={
            "enabled": True,
            "points_per_currency_unit": 10,
            "max_redeem_percent": 50,
            "min_redeem_points": 10,
        },
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "Orbit Appoint Pro", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=timezone.now() - timedelta(days=1),
        current_period_ends_at=timezone.now() + timedelta(days=30),
    )
    Branch.objects.create(
        tenant=tenant,
        business=business,
        branch_code="main",
        branch_name="Main",
        display_name="Main",
        is_primary=True,
        status=BranchStatus.ACTIVE,
    )
    service = Service.objects.create(
        tenant=tenant,
        business=business,
        service_code="haircut",
        name="Haircut",
        display_name="Haircut",
        status=ServiceStatus.ACTIVE,
        loyalty_points_earn=50,
    )
    ServicePricing.objects.create(
        tenant=tenant,
        service=service,
        currency="INR",
        base_price=Decimal("500.00"),
        is_default=True,
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="cust-1",
        first_name="Loyal",
        display_name="Loyal Customer",
        email="loyal@example.com",
    )
    staff = Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="stylist-1",
        first_name="Sam",
        display_name="Stylist",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    return {
        "tenant": tenant,
        "business": business,
        "service": service,
        "customer": customer,
        "staff": staff,
        "owner": owner,
    }


def _make_booking(setup, *, number: str, status: str = BookingStatus.CONFIRMED) -> Booking:
    start = timezone.now() + timedelta(hours=2)
    return Booking.objects.create(
        tenant=setup["tenant"],
        business=setup["business"],
        booking_number=number,
        customer_id=setup["customer"].id,
        staff_id=setup["staff"].id,
        service_id=setup["service"].id,
        appointment_date=start.date(),
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        status=status,
    )


@pytest.mark.django_db
def test_award_uses_service_points(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-LOYAL-1")
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
    )
    account = CustomerLoyaltyAccount.objects.get(customer=setup["customer"])
    assert account.points_balance == 50
    assert CustomerLoyaltyLedger.objects.filter(booking_id=booking.id, points_delta=50).exists()


@pytest.mark.django_db
def test_redeem_and_cancel_refund(loyalty_setup):
    setup = loyalty_setup
    loyalty = LoyaltyService()
    loyalty.ensure_account(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
    )
    CustomerLoyaltyAccount.objects.filter(customer=setup["customer"]).update(points_balance=800)
    booking = _make_booking(setup, number="BK-LOYAL-REDEEM", status=BookingStatus.PENDING)
    snapshot = loyalty.redeem_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
        booking_id=booking.id,
        service_id=setup["service"].id,
        points_to_redeem=500,
    )
    booking.metadata = {"loyalty": snapshot}
    booking.save(update_fields=["metadata", "updated_at"])

    account = CustomerLoyaltyAccount.objects.get(customer=setup["customer"])
    assert account.points_balance == 300
    assert snapshot["discount_amount"] == "50.00"

    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.CANCELLED,
        actor=setup["owner"],
        reason="Customer cancelled",
    )
    account.refresh_from_db()
    assert account.points_balance == 800


@pytest.mark.django_db
def test_redeem_respects_max_percent(loyalty_setup):
    setup = loyalty_setup
    with pytest.raises(ValidationError):
        LoyaltyService().quote_redemption(
            business=setup["business"],
            service_id=setup["service"].id,
            points_to_redeem=3000,
            points_balance=5000,
        )


@pytest.mark.django_db
def test_disabled_program_skips_award(loyalty_setup):
    setup = loyalty_setup
    settings = setup["business"].settings
    settings.loyalty_preferences = {
        "enabled": False,
        "points_per_currency_unit": 10,
        "max_redeem_percent": 50,
        "min_redeem_points": 10,
    }
    settings.save(update_fields=["loyalty_preferences", "updated_at"])
    booking = _make_booking(setup, number="BK-LOYAL-2")
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
    )
    assert not CustomerLoyaltyAccount.objects.filter(customer=setup["customer"]).exists()


@pytest.mark.django_db
def test_trial_entitles_reward_points(loyalty_setup):
    setup = loyalty_setup
    subscription = setup["business"].product_subscriptions.get(product_code="appointie")
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "Orbit Appoint Starter", "is_public": True},
    )
    subscription.plan = starter
    subscription.status = BusinessProductSubscriptionStatus.TRIALING
    subscription.trial_ends_at = timezone.now() + timedelta(days=10)
    subscription.save()
    assert LoyaltyService().has_plan_entitlement(business=setup["business"])


@pytest.mark.django_db
def test_shopie_starter_entitles_reward_points_without_appointie_pro(db):
    owner = User.objects.create_user(
        email="shopie-loyalty-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-loyalty-tenant",
        display_name="ShopIE Loyalty Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Loyalty Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-loyalty-biz",
        business_name="ShopIE Loyalty Biz",
        display_name="ShopIE Loyalty Biz",
        selected_product="shopie",
        currency="INR",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-starter",
        defaults={"name": "Orbit Mart Starter", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=timezone.now() - timedelta(days=1),
        current_period_ends_at=timezone.now() + timedelta(days=30),
    )
    assert LoyaltyService().has_plan_entitlement(business=business)
    LoyaltyService().entitlements.ensure_loyalty_program(business=business)

