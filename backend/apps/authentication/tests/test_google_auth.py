from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.constants import DEFAULT_CUSTOMER_ROLE_CODE, DEFAULT_OWNER_ROLE_CODE
from apps.authentication.models import SocialAccount, User, UserStatus
from apps.authentication.services.google import GoogleIdentity
from apps.authentication.services.roles import RoleService
from apps.tenancy.models import Tenant


def _own_tenant(user: User, slug: str = "ada-salon") -> Tenant:
    return Tenant.objects.create(
        slug=slug,
        display_name="Ada Salon",
        legal_name="Ada Salon",
        owner=user,
    )

GOOGLE_IDENTITY = GoogleIdentity(
    subject="google-sub-123",
    email="ada@gmail.com",
    email_verified=True,
    given_name="Ada",
    family_name="Lovelace",
    picture="https://example.com/ada.jpg",
)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
def test_google_customer_signup_creates_verified_user(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "customer", "remember_me": True},
        format="json",
    )

    assert response.status_code == 200, response.content
    payload = response.json()["data"]
    assert payload["access"]
    assert payload["refresh"]
    assert payload["user"]["email"] == "ada@gmail.com"
    assert payload["user"]["email_verified_at"]
    assert DEFAULT_CUSTOMER_ROLE_CODE in payload["user"]["roles"]

    user = User.objects.get(email="ada@gmail.com")
    assert user.status == UserStatus.ACTIVE
    assert not user.has_usable_password()
    assert SocialAccount.objects.filter(
        user=user, provider="google", subject="google-sub-123"
    ).exists()


@pytest.mark.django_db
def test_google_customer_login_links_existing_password_user(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    user = User.objects.create_user(
        email="ada@gmail.com",
        password="ValidPass123",
        first_name="Ada",
        status=UserStatus.PENDING_VERIFICATION,
    )
    RoleService().assign_role(user=user, role_code=DEFAULT_CUSTOMER_ROLE_CODE)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "customer"},
        format="json",
    )

    assert response.status_code == 200, response.content
    user.refresh_from_db()
    assert user.email_verified_at is not None
    assert user.status == UserStatus.ACTIVE
    assert SocialAccount.objects.filter(user=user, subject="google-sub-123").exists()


@pytest.mark.django_db
def test_google_ops_login_rejects_unknown_account(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "ops"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "GOOGLE_ACCOUNT_NOT_REGISTERED"
    assert not User.objects.filter(email="ada@gmail.com").exists()


@pytest.mark.django_db
def test_google_ops_login_succeeds_for_existing_owner(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    user = User.objects.create_user(
        email="ada@gmail.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code=DEFAULT_OWNER_ROLE_CODE)
    _own_tenant(user)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "ops"},
        format="json",
    )

    assert response.status_code == 200, response.content
    assert response.json()["data"]["user"]["id"] == str(user.id)


@pytest.mark.django_db
def test_google_ops_login_unlocks_locked_owner(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    user = User.objects.create_user(
        email="ada@gmail.com",
        password="ValidPass123",
        status=UserStatus.LOCKED,
        failed_login_count=5,
    )
    RoleService().assign_role(user=user, role_code=DEFAULT_OWNER_ROLE_CODE)
    _own_tenant(user)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "ops"},
        format="json",
    )

    assert response.status_code == 200, response.content
    user.refresh_from_db()
    assert user.status == UserStatus.ACTIVE
    assert user.failed_login_count == 0
    assert user.locked_until is None


@pytest.mark.django_db
def test_google_ops_login_rejects_user_without_workspace(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    user = User.objects.create_user(
        email="ada@gmail.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code=DEFAULT_OWNER_ROLE_CODE)
    monkeypatch.setattr(
        "apps.authentication.services.authentication.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-google"),
        {"id_token": "fake-google-token", "client": "ops"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "GOOGLE_ACCOUNT_NOT_REGISTERED"


@pytest.mark.django_db
def test_register_business_with_google_token(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    monkeypatch.setattr(
        "apps.authentication.services.workspace_provisioning.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-register-business"),
        {
            "email": "ada@gmail.com",
            "google_id_token": "fake-google-token",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "slug": "ada-google-salon",
            "business_name": "Ada Salon",
            "selected_product": "appointie",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        format="json",
    )

    assert response.status_code == 201, response.content
    payload = response.json()["data"]
    assert payload["access"]
    assert Tenant.objects.filter(slug="ada-google-salon").exists()
    user = User.objects.get(email="ada@gmail.com")
    assert not user.has_usable_password()
    assert user.email_verified_at is not None
    assert SocialAccount.objects.filter(user=user, subject="google-sub-123").exists()


@pytest.mark.django_db
def test_register_business_rejects_google_email_mismatch(
    api_client: APIClient, monkeypatch: pytest.MonkeyPatch, settings
) -> None:
    settings.GOOGLE_OAUTH_CLIENT_IDS = ("web-client.apps.googleusercontent.com",)
    monkeypatch.setattr(
        "apps.authentication.services.workspace_provisioning.verify_google_id_token",
        lambda token: GOOGLE_IDENTITY,
    )

    response = api_client.post(
        reverse("auth-register-business"),
        {
            "email": "other@example.com",
            "google_id_token": "fake-google-token",
            "slug": "mismatch-salon",
            "business_name": "Mismatch Salon",
            "selected_product": "appointie",
        },
        format="json",
    )

    assert response.status_code == 422
    assert not Tenant.objects.filter(slug="mismatch-salon").exists()
