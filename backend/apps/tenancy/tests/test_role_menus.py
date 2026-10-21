from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.authentication.tests.otp_helpers import authenticate_api_client
from apps.tenancy.services.role_menus import (
    DEFAULT_HIDDEN_MENUS,
    MENU_CATALOG,
    STAFF_DEFAULT_HIDDEN_MENUS,
    default_enabled_for_role,
)


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    user = User.objects.create_user(
        email="role-menu-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


@pytest.fixture
def staff() -> User:
    user = User.objects.create_user(
        email="role-menu-staff@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="staff")
    return user


def bootstrap_tenant(api_client: APIClient, user: User, slug: str = "role-menu-tenant") -> str:
    access = authenticate_api_client(api_client, user)
    response = api_client.post(
        reverse("tenant-list-create"),
        {
            "slug": slug,
            "display_name": "Role Menu Tenant",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )
    tenant_id = response.json()["data"]["id"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    return tenant_id


@pytest.mark.django_db
def test_default_role_menus_hide_deferred_features(api_client: APIClient, owner: User) -> None:
    bootstrap_tenant(api_client, owner)

    response = api_client.get(reverse("tenant-role-menus"))
    assert response.status_code == 200
    payload = response.json()["data"]
    enabled = payload["enabled"]
    owner_menus = set(enabled["business_owner"])
    staff_menus = set(enabled["staff"])

    for key in DEFAULT_HIDDEN_MENUS:
        assert key in owner_menus
        assert key not in staff_menus
    for key in STAFF_DEFAULT_HIDDEN_MENUS:
        assert key not in staff_menus

    assert "pos" in owner_menus
    assert "customers" in owner_menus
    assert "settings" in owner_menus
    assert "home" in owner_menus
    assert payload["enabled_menus"] == default_enabled_for_role("business_owner")
    assert payload["can_manage"] is True
    assert set(payload["defaults"]["business_owner"]) == {item["key"] for item in MENU_CATALOG}


@pytest.mark.django_db
def test_owner_can_enable_hidden_menu_for_staff(
    api_client: APIClient, owner: User, staff: User
) -> None:
    tenant_id = bootstrap_tenant(api_client, owner)
    staff_defaults = default_enabled_for_role("staff")

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": [*staff_defaults, "books", "services"]}},
        format="json",
    )
    assert response.status_code == 200
    staff_menus = set(response.json()["data"]["enabled"]["staff"])
    assert "books" in staff_menus
    assert "services" in staff_menus

    api_client.force_authenticate(user=staff)
    api_client.credentials(HTTP_X_TENANT_ID=tenant_id)
    staff_view = api_client.get(reverse("tenant-role-menus"))
    assert staff_view.status_code == 200
    resolved = staff_view.json()["data"]["enabled_menus"]
    assert staff_view.json()["data"]["can_manage"] is False
    assert "books" in resolved
    assert "services" in resolved


@pytest.mark.django_db
def test_staff_cannot_update_role_menus(api_client: APIClient, owner: User, staff: User) -> None:
    tenant_id = bootstrap_tenant(api_client, owner)
    api_client.force_authenticate(user=staff)
    api_client.credentials(HTTP_X_TENANT_ID=tenant_id)

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": ["home", "pos"]}},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_owner_cannot_disable_always_on_menus(api_client: APIClient, owner: User) -> None:
    bootstrap_tenant(api_client, owner)

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"business_owner": ["pos", "customers"]}},
        format="json",
    )
    assert response.status_code == 200
    owner_menus = set(response.json()["data"]["enabled"]["business_owner"])
    assert "home" in owner_menus
    assert "alerts" in owner_menus
    assert "profile" in owner_menus
    assert "settings" in owner_menus


@pytest.mark.django_db
def test_legacy_owner_default_upgrades_to_full_catalog(api_client: APIClient, owner: User) -> None:
    tenant_id = bootstrap_tenant(api_client, owner)
    old_owner = [item["key"] for item in MENU_CATALOG if item["key"] not in DEFAULT_HIDDEN_MENUS]
    from apps.tenancy.models import TenantSettings

    settings = TenantSettings.objects.get(tenant_id=tenant_id)
    settings.role_menus = {"business_owner": old_owner}
    settings.save(update_fields=["role_menus", "updated_at"])

    response = api_client.get(reverse("tenant-role-menus"))
    assert response.status_code == 200
    owner_menus = set(response.json()["data"]["enabled"]["business_owner"])
    for key in DEFAULT_HIDDEN_MENUS:
        assert key in owner_menus
    assert owner_menus == set(default_enabled_for_role("business_owner"))


@pytest.mark.django_db
def test_owner_can_keep_deferred_menus_hidden(api_client: APIClient, owner: User) -> None:
    bootstrap_tenant(api_client, owner)
    old_owner = [item["key"] for item in MENU_CATALOG if item["key"] not in DEFAULT_HIDDEN_MENUS]

    saved = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"business_owner": old_owner}},
        format="json",
    )
    assert saved.status_code == 200
    owner_menus = set(saved.json()["data"]["enabled"]["business_owner"])
    for key in DEFAULT_HIDDEN_MENUS:
        assert key not in owner_menus

    response = api_client.get(reverse("tenant-role-menus"))
    assert response.status_code == 200
    owner_menus = set(response.json()["data"]["enabled"]["business_owner"])
    for key in DEFAULT_HIDDEN_MENUS:
        assert key not in owner_menus


@pytest.mark.django_db
def test_owner_of_another_tenant_cannot_update_role_menus(
    api_client: APIClient, owner: User
) -> None:
    bootstrap_tenant(api_client, owner)
    owner.refresh_from_db()
    owner.is_superuser = False
    owner.save(update_fields=["is_superuser", "updated_at"])
    owner.user_roles.filter(role__code__in={"platform_admin", "super_admin"}).delete()

    other = User.objects.create_user(
        email="role-menu-other-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=other, role_code="business_owner")
    other_client = APIClient()
    tenant_b = bootstrap_tenant(other_client, other, slug="role-menu-tenant-b")

    api_client.force_authenticate(user=owner)
    api_client.credentials(HTTP_X_TENANT_ID=tenant_b)
    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": ["home", "pos"]}},
        format="json",
    )
    assert response.status_code == 403

    staff_view = api_client.get(reverse("tenant-role-menus"))
    assert staff_view.status_code == 200
    resolved = set(staff_view.json()["data"]["enabled_menus"])
    assert resolved == set(default_enabled_for_role("staff"))


@pytest.mark.django_db
def test_enabling_books_grants_every_section(api_client: APIClient, owner: User) -> None:
    bootstrap_tenant(api_client, owner)
    staff_defaults = default_enabled_for_role("staff")

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": [*staff_defaults, "books"]}},
        format="json",
    )
    assert response.status_code == 200
    staff_menus = set(response.json()["data"]["enabled"]["staff"])
    assert "booksSale" in staff_menus
    assert "booksCash" in staff_menus
    assert "booksReports" in staff_menus
    catalog_parents = [item for item in response.json()["data"]["catalog"] if item.get("parent") == "books"]
    assert {item["key"] for item in catalog_parents} <= staff_menus


@pytest.mark.django_db
def test_owner_can_limit_books_sections_for_staff(api_client: APIClient, owner: User, staff: User) -> None:
    tenant_id = bootstrap_tenant(api_client, owner)
    staff_defaults = default_enabled_for_role("staff")

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": [*staff_defaults, "books", "booksSale", "booksParties"]}},
        format="json",
    )
    assert response.status_code == 200
    staff_menus = set(response.json()["data"]["enabled"]["staff"])
    assert staff_menus.issuperset({"books", "booksSale", "booksParties"})
    assert "booksCash" not in staff_menus
    assert "booksReports" not in staff_menus

    api_client.force_authenticate(user=staff)
    api_client.credentials(HTTP_X_TENANT_ID=tenant_id)
    resolved = set(api_client.get(reverse("tenant-role-menus")).json()["data"]["enabled_menus"])
    assert "booksSale" in resolved
    assert "booksCash" not in resolved


@pytest.mark.django_db
def test_books_off_drops_section_keys(api_client: APIClient, owner: User) -> None:
    bootstrap_tenant(api_client, owner)
    staff_defaults = [key for key in default_enabled_for_role("staff") if key != "books"]

    response = api_client.put(
        reverse("tenant-role-menus"),
        {"enabled": {"staff": [*staff_defaults, "booksSale", "booksCash"]}},
        format="json",
    )
    assert response.status_code == 200
    staff_menus = set(response.json()["data"]["enabled"]["staff"])
    assert "books" not in staff_menus
    assert "booksSale" not in staff_menus
    assert "booksCash" not in staff_menus
