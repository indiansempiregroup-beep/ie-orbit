from __future__ import annotations

import re

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import Permission, Role, User, UserStatus
from apps.authentication.permissions import HasPlatformPermission
from apps.authentication.services.roles import RoleService


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="iam-user@example.com",
        password="ValidPass123",
        first_name="IAM",
        last_name="User",
        status=UserStatus.PENDING_VERIFICATION,
    )


@pytest.mark.django_db
def test_login_refresh_logout_flow(api_client: APIClient, user: User) -> None:
    login_response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123", "remember_me": True},
        format="json",
    )

    assert login_response.status_code == 200
    login_payload = login_response.json()["data"]
    assert login_payload["token_type"] == "Bearer"
    assert login_payload["access"]
    assert login_payload["refresh"]

    refresh_response = api_client.post(
        reverse("auth-refresh"),
        {"refresh": login_payload["refresh"]},
        format="json",
    )

    assert refresh_response.status_code == 200
    refreshed_payload = refresh_response.json()["data"]
    assert refreshed_payload["access"]
    assert refreshed_payload["refresh"]

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_payload['access']}")
    logout_response = api_client.post(
        reverse("auth-logout"),
        {"refresh": refreshed_payload["refresh"]},
        format="json",
    )

    assert logout_response.status_code == 200
    assert logout_response.json()["data"]["logged_out"] is True


@pytest.mark.django_db
def test_password_reset_flow(api_client: APIClient, user: User) -> None:
    forgot_response = api_client.post(
        reverse("auth-forgot-password"),
        {"email": user.email},
        format="json",
    )

    assert forgot_response.status_code == 200
    assert mail.outbox
    message = mail.outbox[-1].body
    assert "/auth/reset-password?token=" in message
    token = message.rsplit(" ", maxsplit=1)[-1]

    reset_response = api_client.post(
        reverse("auth-reset-password"),
        {"token": token, "new_password": "BetterPass123"},
        format="json",
    )

    assert reset_response.status_code == 200
    user.refresh_from_db()
    assert user.check_password("BetterPass123")


@pytest.mark.django_db
def test_email_verification_flow(api_client: APIClient, user: User) -> None:
    login_response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = login_response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    resend_response = api_client.post(reverse("auth-resend-verification"), {}, format="json")

    assert resend_response.status_code == 200
    assert mail.outbox
    message = mail.outbox[-1].body
    assert "verification code" in mail.outbox[-1].subject.lower()
    assert "/auth/verify-email?token=" in message
    token_match = re.search(r"Verification code: (\d{6})", message)
    if token_match is None:
        token_match = re.search(r"/auth/verify-email\?token=(\d{6})", message)
    assert token_match is not None
    token = token_match.group(1)

    verify_response = api_client.post(reverse("auth-verify-email"), {"token": token}, format="json")

    assert verify_response.status_code == 200
    user.refresh_from_db()
    assert user.email_verified_at is not None
    assert user.status == UserStatus.ACTIVE


@pytest.mark.django_db
def test_me_profile_patch(api_client: APIClient, user: User) -> None:
    login_response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = login_response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    patch_response = api_client.patch(
        reverse("auth-me"),
        {"first_name": "Updated", "language": "en-IN"},
        format="json",
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["first_name"] == "Updated"
    assert patch_response.json()["data"]["language"] == "en-IN"


@pytest.mark.django_db
def test_resend_verification_by_email_without_auth(api_client: APIClient, user: User) -> None:
    response = api_client.post(
        reverse("auth-resend-verification"),
        {"email": user.email},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["sent"] is True
    assert mail.outbox
    assert re.search(r"Verification code: \d{6}", mail.outbox[-1].body)


@pytest.mark.django_db
def test_resend_verification_invalid_jwt_falls_back_to_email(api_client: APIClient, user: User) -> None:
    api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-valid-token")
    response = api_client.post(
        reverse("auth-resend-verification"),
        {"email": user.email},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["sent"] is True
    assert mail.outbox
    assert "IE Orbit" in mail.outbox[-1].subject


@pytest.mark.django_db
def test_role_permission_check(user: User) -> None:
    role = Role.objects.get(code="business_owner")
    permission = Permission.objects.get(code="iam:user:read")
    RoleService().assign_role(user=user, role_code=role.code)

    assert role.role_permissions.filter(permission=permission).exists()
    assert HasPlatformPermission().has_permission(
        type(
            "Request",
            (),
            {"user": user},
        )(),
        type("View", (), {"required_permission": "iam:user:read"})(),
    )
