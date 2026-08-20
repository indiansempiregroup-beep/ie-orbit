from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import Role, User, UserRole, UserStatus
from apps.platform_admin.models import (
    PlatformAffiliate,
    PlatformAffiliateCode,
    PlatformAffiliateLedgerEntry,
    PlatformAffiliateLedgerKind,
    PlatformAffiliateStatus,
    PlatformReferral,
)
from apps.tenancy.models import Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin_user() -> User:
    user = User.objects.create_user(
        email="affiliate-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


def _affiliate(**overrides: object) -> PlatformAffiliate:
    payload = {
        "name": "Rupali",
        "email": "rupali@example.com",
        "status": PlatformAffiliateStatus.ACTIVE,
        "payout_method": "upi",
        "upi_vpa": "rupali@upi",
        "default_commission_paise": 0,
    }
    payload.update(overrides)
    return PlatformAffiliate.objects.create(**payload)


@pytest.mark.django_db
def test_signup_opens_payment_account_without_earning(api_client: APIClient) -> None:
    affiliate = _affiliate(default_commission_paise=100000)
    PlatformAffiliateCode.objects.create(affiliate=affiliate, code="RUPALISBUSINESSCODE", is_active=True)

    response = api_client.post(
        reverse("auth-register-business"),
        {
            "email": "newbiz@example.com",
            "password": "ValidPass123",
            "first_name": "New",
            "last_name": "Biz",
            "slug": "new-biz",
            "business_name": "New Biz",
            "selected_product": "appointie",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "affiliate_code": "RUPALISBUSINESSCODE",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    tenant_id = response.json()["data"]["tenant"]["id"]
    referral = PlatformReferral.objects.get(referred_tenant_id=tenant_id)
    assert referral.metadata.get("payment_account_opened") is True
    assert (
        PlatformAffiliateLedgerEntry.objects.filter(
            referral=referral, kind=PlatformAffiliateLedgerKind.EARNING
        ).exists()
        is False
    )


@pytest.mark.django_db
def test_affiliate_ledger_earning_payment_and_insights(
    api_client: APIClient,
    platform_admin_user: User,
) -> None:
    affiliate = _affiliate()
    PlatformAffiliateCode.objects.create(affiliate=affiliate, code="RUPALI1", is_active=True)
    owner = User.objects.create_user(
        email="referred-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="referred-co", display_name="Referred Co", owner=owner)
    referral = PlatformReferral.objects.create(
        affiliate=affiliate,
        referred_tenant=tenant,
        starts_at=timezone.now(),
        months=12,
        metadata={"code": "RUPALI1", "payment_account_opened": True},
    )

    api_client.force_authenticate(user=platform_admin_user)
    earning = api_client.post(
        reverse("platform-affiliate-ledger"),
        {
            "affiliate_id": str(affiliate.id),
            "referral_id": str(referral.id),
            "kind": "earning",
            "amount_paise": 250000,
            "period_yyyy_mm": "2026-08",
            "notes": "August commission",
            "reason": "Add August earning",
        },
        format="json",
    )
    assert earning.status_code == 201, earning.content

    payment = api_client.post(
        reverse("platform-affiliate-ledger"),
        {
            "affiliate_id": str(affiliate.id),
            "referral_id": str(referral.id),
            "kind": "payment",
            "amount_paise": 100000,
            "payment_ref": "UTR123",
            "notes": "Paid on UPI",
            "reason": "Record affiliate payment",
        },
        format="json",
    )
    assert payment.status_code == 201, payment.content
    assert payment.json()["data"]["metadata"]["upi_vpa"] == "rupali@upi"

    listing = api_client.get(reverse("platform-affiliates"))
    assert listing.status_code == 200
    payload = listing.json()["data"]
    assert payload["insights"]["earned_paise"] == 250000
    assert payload["insights"]["paid_paise"] == 100000
    assert payload["insights"]["outstanding_paise"] == 150000
    row = next(item for item in payload["affiliates"] if item["id"] == str(affiliate.id))
    assert row["referral_count"] == 1
    assert row["outstanding_paise"] == 150000

    detail = api_client.get(reverse("platform-affiliate-detail", kwargs={"affiliate_id": affiliate.id}))
    assert detail.status_code == 200
    body = detail.json()["data"]
    assert body["insights"]["outstanding_paise"] == 150000
    assert len(body["referrals"]) == 1
    assert len(body["history"]) == 2
    assert body["referrals"][0]["referred_tenant_name"] == "Referred Co"


def _referred_business(*, slug: str, name: str, affiliate: PlatformAffiliate):
    from apps.businesses.models import Business
    from apps.tenancy.models import Organization

    owner = User.objects.create_user(
        email=f"{slug}@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug=slug, display_name=name, owner=owner)
    organization = Organization.objects.create(tenant=tenant, name=f"{name} Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code=slug,
        business_name=name,
        display_name=name,
    )
    referral = PlatformReferral.objects.create(
        affiliate=affiliate,
        referred_tenant=tenant,
        starts_at=timezone.now(),
        months=12,
        metadata={"payment_account_opened": True},
    )
    return tenant, business, referral


@pytest.mark.django_db
def test_first_installment_adds_flat_commission() -> None:
    from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
    from apps.billing.services.checkout import CheckoutService
    from apps.platform_admin.models import PlatformAffiliateCommissionTrigger, PlatformAffiliateCommissionType

    affiliate = _affiliate(
        default_commission_paise=50000,
        commission_trigger=PlatformAffiliateCommissionTrigger.FIRST_PAYMENT,
        commission_type=PlatformAffiliateCommissionType.FLAT,
    )
    tenant, business, referral = _referred_business(slug="sp-biz", name="SP", affiliate=affiliate)
    session = BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_sp_first",
        amount_paise=99900,
        currency="INR",
        status=CheckoutSessionStatus.CREATED,
    )

    paid = CheckoutService().mark_session_paid(order_id="order_sp_first", payment_id="pay_1")
    assert paid is not None
    earning = PlatformAffiliateLedgerEntry.objects.get(
        referral=referral, kind=PlatformAffiliateLedgerKind.EARNING
    )
    assert earning.amount_paise == 50000
    assert earning.metadata.get("source") == "first_payment"
    assert earning.metadata.get("checkout_session_id") == str(session.id)

    BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_sp_second",
        amount_paise=99900,
        currency="INR",
        status=CheckoutSessionStatus.CREATED,
    )
    CheckoutService().mark_session_paid(order_id="order_sp_second", payment_id="pay_2")
    assert (
        PlatformAffiliateLedgerEntry.objects.filter(
            referral=referral, kind=PlatformAffiliateLedgerKind.EARNING
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_first_installment_percent_commission_and_idempotent_retry() -> None:
    from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
    from apps.billing.services.checkout import CheckoutService
    from apps.platform_admin.models import PlatformAffiliateCommissionTrigger, PlatformAffiliateCommissionType

    affiliate = _affiliate(
        default_commission_paise=0,
        commission_trigger=PlatformAffiliateCommissionTrigger.FIRST_PAYMENT,
        commission_type=PlatformAffiliateCommissionType.PERCENT,
        commission_percent=10,
    )
    tenant, business, referral = _referred_business(slug="sp-percent", name="SP Percent", affiliate=affiliate)
    BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_sp_pct",
        amount_paise=100000,
        currency="INR",
        status=CheckoutSessionStatus.CREATED,
    )
    CheckoutService().mark_session_paid(order_id="order_sp_pct", payment_id="pay_pct")
    CheckoutService().mark_session_paid(order_id="order_sp_pct", payment_id="pay_pct")
    earnings = list(
        PlatformAffiliateLedgerEntry.objects.filter(
            referral=referral, kind=PlatformAffiliateLedgerKind.EARNING
        )
    )
    assert len(earnings) == 1
    assert earnings[0].amount_paise == 10000

