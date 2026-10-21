from __future__ import annotations

import uuid
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
        payment={"payment_method": "cash"},
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
def test_completed_booking_earn_reversed_on_refund_for_booking(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-LOYAL-REV", status=BookingStatus.CONFIRMED)
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
        payment={"payment_method": "cash"},
    )
    account = CustomerLoyaltyAccount.objects.get(customer=setup["customer"])
    assert account.points_balance == 50
    LoyaltyService().refund_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
        booking_id=booking.id,
        points_redeemed=0,
    )
    account.refresh_from_db()
    assert account.points_balance == 0
    assert CustomerLoyaltyLedger.objects.filter(
        booking_id=booking.id, metadata__type="earn_reversal"
    ).exists()
    booking.refresh_from_db()
    snap = (booking.metadata or {}).get("loyalty") or {}
    assert int(snap.get("points_reversed") or snap.get("points_revoked") or 0) == 50
    assert snap.get("earn_reversed") is True
    report = LoyaltyService().business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        customer_id=str(setup["customer"].id),
    )
    types = {str(row.get("entry_type") or "") for row in report["ledger"]}
    assert "earn" in types
    assert "earn_reversal" in types
    reversal = next(row for row in report["ledger"] if row.get("entry_type") == "earn_reversal")
    assert reversal["direction"] == "reversed"
    assert reversal["points_delta"] == -50
    assert "Reversed" in (reversal.get("reason") or "")
    given_only = LoyaltyService().business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        customer_id=str(setup["customer"].id),
        direction="given",
    )
    assert all(row.get("entry_type") != "earn_reversal" for row in given_only["ledger"])
    reversed_only = LoyaltyService().business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        customer_id=str(setup["customer"].id),
        direction="reversed",
    )
    assert reversed_only["ledger_total"] >= 1
    assert all(row.get("entry_type") == "earn_reversal" for row in reversed_only["ledger"])


@pytest.mark.django_db
def test_complete_stamps_booking_points_earned(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-LOYAL-STAMP")
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
        payment={"payment_method": "cash"},
    )
    booking.refresh_from_db()
    snap = (booking.metadata or {}).get("loyalty") or {}
    assert int(snap.get("points_earned") or 0) == 50
    from apps.bookings.api.serializers import BookingSerializer

    payload = BookingSerializer(booking).data
    assert int((payload.get("loyalty") or {}).get("points_earned") or 0) == 50
    assert int((payload.get("loyalty") or {}).get("points_reversed") or 0) == 0


@pytest.mark.django_db
def test_no_show_refunds_redeemed_points(loyalty_setup):
    setup = loyalty_setup
    loyalty = LoyaltyService()
    loyalty.ensure_account(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
    )
    CustomerLoyaltyAccount.objects.filter(customer=setup["customer"]).update(points_balance=800)
    booking = _make_booking(setup, number="BK-LOYAL-NOSHOW", status=BookingStatus.CONFIRMED)
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

    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.NO_SHOW,
        actor=setup["owner"],
        reason="Did not arrive",
    )
    account = CustomerLoyaltyAccount.objects.get(customer=setup["customer"])
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
        payment={"payment_method": "cash"},
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
    starter, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-starter",
        defaults={"name": "Orbit Mart Starter", "is_public": True},
    )
    pro, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-pro",
        defaults={"name": "Orbit Mart Pro", "is_public": True},
    )
    subscription = BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=starter,
        current_period_starts_at=timezone.now() - timedelta(days=1),
        current_period_ends_at=timezone.now() + timedelta(days=30),
    )
    assert not LoyaltyService().has_plan_entitlement(business=business)

    subscription.plan = pro
    subscription.save(update_fields=["plan"])
    assert LoyaltyService().has_plan_entitlement(business=business)
    LoyaltyService().entitlements.ensure_loyalty_program(business=business)


@pytest.mark.django_db
def test_loyalty_report_filters_by_staff(loyalty_setup) -> None:
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-LOYAL-STAFF")
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
        payment={"payment_method": "cash"},
    )
    other = Staff.objects.create(
        tenant=setup["tenant"],
        business=setup["business"],
        staff_code="stylist-other",
        first_name="Other",
        display_name="Other Stylist",
        employment_status=EmploymentStatus.ACTIVE,
        is_bookable=True,
    )
    loyalty = LoyaltyService()
    today = timezone.localdate().isoformat()
    all_staff = loyalty.business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        date_from=today,
        date_to=today,
    )
    assigned = loyalty.business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        date_from=today,
        date_to=today,
        staff_id=setup["staff"].id,
    )
    other_only = loyalty.business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        date_from=today,
        date_to=today,
        staff_id=other.id,
    )
    assert all_staff["summary"]["points_earned"] == 50
    assert assigned["summary"]["points_earned"] == 50
    assert other_only["summary"]["points_earned"] == 0
    assert assigned["ledger_total"] >= 1
    assert other_only["ledger_total"] == 0


@pytest.mark.django_db
def test_mobile_booking_exposes_loyalty_to_customer(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-LOYAL-MOBILE")
    BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
        payment={"payment_method": "cash"},
    )
    booking.refresh_from_db()
    from apps.api.mobile_views import _serialize_mobile_booking

    payload = _serialize_mobile_booking(booking=booking, tenant=setup["tenant"])
    loyalty = payload.get("loyalty") or {}
    assert int(loyalty.get("points_earned") or 0) == 50
    assert int(loyalty.get("points_reversed") or 0) == 0
    assert int(loyalty.get("remaining_earned") or 0) == 50

    LoyaltyService().refund_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
        booking_id=booking.id,
        points_redeemed=0,
    )
    booking.refresh_from_db()
    reversed_payload = _serialize_mobile_booking(booking=booking, tenant=setup["tenant"])
    reversed_loyalty = reversed_payload.get("loyalty") or {}
    assert int(reversed_loyalty.get("points_earned") or 0) == 50
    assert int(reversed_loyalty.get("points_reversed") or 0) == 50
    assert int(reversed_loyalty.get("remaining_earned") or 0) == 0


@pytest.mark.django_db
def test_loyalty_report_can_split_booking_and_shop_rows(loyalty_setup):
    setup = loyalty_setup
    account = CustomerLoyaltyAccount.objects.create(
        tenant=setup["tenant"],
        business=setup["business"],
        customer=setup["customer"],
        points_balance=15,
    )
    CustomerLoyaltyLedger.objects.create(
        tenant=setup["tenant"],
        account=account,
        business=setup["business"],
        customer=setup["customer"],
        points_delta=10,
        reason="Booking complete",
        booking_id=uuid.uuid4(),
    )
    CustomerLoyaltyLedger.objects.create(
        tenant=setup["tenant"],
        account=account,
        business=setup["business"],
        customer=setup["customer"],
        points_delta=5,
        reason="Shop sale",
        order_id=uuid.uuid4(),
    )
    loyalty = LoyaltyService()
    shop = loyalty.business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        record_kind="shop",
    )
    booking = loyalty.business_ledger_report(
        tenant=setup["tenant"],
        business=setup["business"],
        record_kind="booking",
    )
    assert shop["ledger_total"] == 1
    assert all(not row.get("booking_id") for row in shop["ledger"])
    assert booking["ledger_total"] == 1
    assert all(row.get("booking_id") for row in booking["ledger"])

