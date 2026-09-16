from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import Role, User, UserRole, UserStatus
from apps.businesses.models import Business
from apps.businesses.services.customer_app_build import (
    _firebase_access_token,
    _firebase_http_error_message,
    customer_app_action_error,
)
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin_user() -> User:
    user = User.objects.create_user(
        email="firebase-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def tenant_business() -> Business:
    owner = User.objects.create_user(
        email="firebase-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="firebase-tenant",
        display_name="Firebase Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Firebase Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="spa-main",
        business_name="Spa Main",
        display_name="Sunita Spa",
    )


def test_firebase_http_error_message_permission_denied() -> None:
    message = _firebase_http_error_message(
        403,
        '{"error":{"code":403,"message":"The caller does not have permission",'
        '"status":"PERMISSION_DENIED"}}',
    )
    assert "denied" in message.lower()
    assert "ie-orbit" in message
    assert "configFileContents" not in message


def test_firebase_http_error_message_clips_raw_json() -> None:
    message = _firebase_http_error_message(500, '{"error":{"message":"%s"}}' % ("x" * 800))
    assert len(message) < 400
    assert "Firebase API returned 500" in message


def test_customer_app_action_error_maps_missing_credentials() -> None:
    status, code, message = customer_app_action_error(
        RuntimeError("Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on the VPS.")
    )
    assert status == 503
    assert code == "firebase_not_configured"
    assert "FIREBASE_SERVICE_ACCOUNT_JSON" in message


def test_firebase_access_token_permission_denied(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    path = tmp_path / "firebase-management.json"
    path.write_text("{}", encoding="utf-8")
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", str(path))
    original_open = open

    def guarded(file, *args, **kwargs):
        if str(file) == str(path):
            raise PermissionError(13, "Permission denied", str(path))
        return original_open(file, *args, **kwargs)

    monkeypatch.setattr("builtins.open", guarded)
    with pytest.raises(RuntimeError, match="not readable"):
        _firebase_access_token()


@pytest.mark.django_db
def test_provision_firebase_without_credentials_returns_error(
    api_client: APIClient,
    platform_admin_user: User,
    tenant_business: Business,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.post(
        reverse("platform-customer-app-firebase", kwargs={"business_id": tenant_business.id}),
        data={},
        format="json",
    )
    assert response.status_code == 503
    payload = response.json()["error"]
    assert payload["code"] == "firebase_not_configured"
    assert "Firebase is not configured" in payload["message"]


@pytest.mark.django_db
def test_provision_firebase_invalid_credentials_json_returns_error(
    api_client: APIClient,
    platform_admin_user: User,
    tenant_business: Business,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_JSON", "{not-json")
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.post(
        reverse("platform-customer-app-firebase", kwargs={"business_id": tenant_business.id}),
        data={},
        format="json",
    )
    assert response.status_code == 503
    payload = response.json()["error"]
    assert payload["code"] == "firebase_not_configured"
    assert "not valid JSON" in payload["message"]
