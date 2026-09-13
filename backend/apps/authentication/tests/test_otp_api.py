from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.emails.otp_email import build_login_otp_email
from apps.authentication.models import User, UserStatus
from apps.authentication.tests.otp_helpers import otp_login_ops


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
def test_forgot_password_gone(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("auth-forgot-password"),
        {"email": "any@example.com"},
        format="json",
    )
    assert response.status_code == 410
