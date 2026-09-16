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
