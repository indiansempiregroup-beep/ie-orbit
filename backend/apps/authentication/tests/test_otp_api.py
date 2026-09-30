from __future__ import annotations

import pytest
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.emails.otp_email import build_login_otp_email
from apps.authentication.models import User, UserStatus
from apps.authentication.services.auth_otp import should_include_otp_debug_code
from apps.authentication.tests.otp_helpers import (
    ensure_ops_otp_login_eligible,
    otp_login_ops,
)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
def test_password_login_disabled(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="disabled-pw@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    user.is_superuser = True
    user.save(update_fields=["is_superuser", "updated_at"])

    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    assert response.status_code == 401


def test_login_otp_email_is_branded() -> None:
    content = build_login_otp_email(
        email="owner@example.com",
        code="123456",
        expiry_minutes=10,
    )
    assert content.subject == "123456 is your IE Orbit sign-in code"
    assert "Your sign-in code is 123456" in content.plain_text
    assert "Your sign-in code" in content.html
    assert "Sign-in code" in content.html
    assert "123456" in content.html
    assert "Keep this code private" in content.html
    assert "Expires in 10 minutes" in content.html


@pytest.mark.django_db
def test_otp_email_login_ops(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="otp-ops@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    user.is_superuser = True
    user.save(update_fields=["is_superuser", "updated_at"])

    payload = otp_login_ops(api_client, user)
    assert payload["access"]
    assert payload["user"]["email"] == user.email


@pytest.mark.django_db
def test_otp_send_login_rejects_unregistered_email(api_client: APIClient) -> None:
    mail.outbox.clear()
    response = api_client.post(
        reverse("auth-otp-send"),
        {
            "client": "ops",
            "channel": "email",
            "identifier": "missing@example.com",
            "purpose": "login",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "No account found" in str(response.json())
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_otp_send_customer_login_rejects_user_without_shop_customer(api_client: APIClient) -> None:
    from apps.businesses.models import Business
    from apps.customers.models import Customer
    from apps.tenancy.models import Organization, Tenant

    user = User.objects.create_user(
        email="global-user@example.com",
        password=None,
        status=UserStatus.ACTIVE,
        phone_number="9766855617",
    )
    tenant = Tenant.objects.create(slug="otp-shop", display_name="OTP Shop")
    organization = Organization.objects.create(tenant=tenant, name="OTP Shop Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="main",
        business_name="OTP Shop",
        display_name="OTP Shop",
    )
    # Same phone as the User, but a different customer email must not unlock email login.
    Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="other-phone-match",
        first_name="Other",
        last_name="Customer",
        display_name="Other Customer",
        email="other-customer@example.com",
        phone_number="9766855617",
    )
    mail.outbox.clear()
    response = api_client.post(
        reverse("auth-otp-send"),
        {
            "client": "customer",
            "channel": "email",
            "identifier": user.email,
            "purpose": "login",
            "tenant_slug": tenant.slug,
            "business_code": business.business_code,
        },
        format="json",
    )
    assert response.status_code == 400
    assert "No account found for this shop" in str(response.json())
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_otp_verify_customer_signup_creates_shop_customer(api_client: APIClient) -> None:
    from apps.businesses.models import Business
    from apps.customers.models import Customer
    from apps.tenancy.models import Organization, Tenant

    tenant = Tenant.objects.create(slug="signup-shop", display_name="Signup Shop")
    organization = Organization.objects.create(tenant=tenant, name="Signup Shop Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="main",
        business_name="Signup Shop",
        display_name="Signup Shop",
    )
    email = "new-shopper@example.com"
    mail.outbox.clear()
    send_response = api_client.post(
        reverse("auth-otp-send"),
        {
            "client": "customer",
            "channel": "email",
            "identifier": email,
            "purpose": "signup",
            "tenant_slug": tenant.slug,
            "business_code": business.business_code,
        },
        format="json",
    )
    assert send_response.status_code == 200
    code = send_response.json()["data"].get("debug_code")
    assert code
    verify_response = api_client.post(
        reverse("auth-otp-verify"),
        {
            "client": "customer",
            "channel": "email",
            "identifier": email,
            "code": code,
            "remember_me": True,
            "create_if_missing": True,
            "first_name": "New",
            "last_name": "Shopper",
            "tenant_slug": tenant.slug,
            "business_code": business.business_code,
        },
        format="json",
    )
    assert verify_response.status_code == 200, verify_response.content
    assert Customer.objects.filter(
        tenant=tenant, business=business, email__iexact=email
    ).exists()


@pytest.mark.django_db
def test_otp_send_signup_allows_unregistered_email(api_client: APIClient) -> None:
    mail.outbox.clear()
    response = api_client.post(
        reverse("auth-otp-send"),
        {
            "client": "ops",
            "channel": "email",
            "identifier": "new-owner@example.com",
            "purpose": "signup",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["sent"] is True
    assert len(mail.outbox) == 1


def test_otp_debug_code_follows_debug_or_allowlist() -> None:
    with override_settings(DEBUG=True, IAM_SETTINGS={"OTP_DEBUG_EMAILS": ()}):
        assert should_include_otp_debug_code("anyone@example.com") is True
    with override_settings(
        DEBUG=False,
        IAM_SETTINGS={"OTP_DEBUG_EMAILS": ("qa-owner@example.com", "QA-Admin@example.com")},
    ):
        assert should_include_otp_debug_code("qa-owner@example.com") is True
        assert should_include_otp_debug_code("QA-ADMIN@example.com") is True
        assert should_include_otp_debug_code("other@example.com") is False


@pytest.mark.django_db
def test_otp_send_returns_debug_code_for_allowlisted_email_when_debug_is_off(
    api_client: APIClient, settings
) -> None:
    user = User.objects.create_user(
        email="qa-owner@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    ensure_ops_otp_login_eligible(user)
    mail.outbox.clear()
    settings.DEBUG = False
    settings.IAM_SETTINGS = {
        **settings.IAM_SETTINGS,
        "OTP_DEBUG_EMAILS": ("qa-owner@example.com",),
    }

    allowed = api_client.post(
        reverse("auth-otp-send"),
        {"client": "ops", "channel": "email", "identifier": user.email},
        format="json",
    )
    assert allowed.status_code == 200
    assert allowed.json()["data"].get("debug_code")

    outsider = User.objects.create_user(
        email="not-qa@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    ensure_ops_otp_login_eligible(outsider)
    denied = api_client.post(
        reverse("auth-otp-send"),
        {"client": "ops", "channel": "email", "identifier": outsider.email},
        format="json",
    )
    assert denied.status_code == 200
    assert "debug_code" not in denied.json()["data"]


@pytest.mark.django_db
def test_forgot_password_gone(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("auth-forgot-password"),
        {"email": "any@example.com"},
        format="json",
    )
    assert response.status_code == 410
