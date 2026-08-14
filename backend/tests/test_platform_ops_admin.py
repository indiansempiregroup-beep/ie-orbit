from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import Role, User, UserRole, UserStatus
from apps.platform_admin.models import HelpArticle, SupportTicket, SupportTicketNote
from apps.tenancy.models import Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin_user() -> User:
    user = User.objects.create_user(
        email="ops-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


@pytest.fixture
def tenant_owner() -> User:
    return User.objects.create_user(
        email="ticket-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.mark.django_db
def test_ticket_thread_assign_and_resolve(
    api_client: APIClient,
    platform_admin_user: User,
    tenant_owner: User,
) -> None:
    tenant = Tenant.objects.create(slug="ops-ticket", display_name="Ops Ticket Co", owner=tenant_owner)
    ticket = SupportTicket.objects.create(tenant=tenant, subject="POS is down", requester=tenant_owner)
    SupportTicketNote.objects.create(ticket=ticket, author=tenant_owner, body="Cannot take payments", is_internal=False)

    api_client.force_authenticate(user=platform_admin_user)
    listing = api_client.get(reverse("platform-tickets"))
    assert listing.status_code == 200
    row = listing.json()["data"]["tickets"][0]
    assert row["tenant_name"] == "Ops Ticket Co"
    assert row["requester_email"] == tenant_owner.email

    detail = api_client.get(reverse("platform-ticket-detail", kwargs={"ticket_id": ticket.id}))
    assert detail.status_code == 200
    payload = detail.json()["data"]
    assert payload["tenant_id"] == str(tenant.id)
    assert len(payload["notes"]) == 1

    patched = api_client.patch(
        reverse("platform-ticket-detail", kwargs={"ticket_id": ticket.id}),
        {"assign_to_me": True, "status": "pending"},
        format="json",
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["assignee_email"] == platform_admin_user.email
    assert patched.json()["data"]["status"] == "pending"

    note = api_client.post(
        reverse("platform-ticket-notes", kwargs={"ticket_id": ticket.id}),
        {"body": "Restarted the terminal", "is_internal": True, "status": "resolved"},
        format="json",
    )
    assert note.status_code == 201
    ticket.refresh_from_db()
    assert ticket.status == "resolved"
    assert ticket.notes.count() == 2


@pytest.mark.django_db
def test_help_article_edit_and_unpublish(api_client: APIClient, platform_admin_user: User) -> None:
    api_client.force_authenticate(user=platform_admin_user)
    created = api_client.post(
        reverse("platform-help-admin"),
        {"title": "Opening hours", "body": "We open at 9", "category": "ops", "is_published": True},
        format="json",
    )
    assert created.status_code == 201
    article_id = created.json()["data"]["id"]

    listing = api_client.get(reverse("platform-help-admin"))
    article = listing.json()["data"]["articles"][0]
    assert article["body"] == "We open at 9"
    assert article["is_published"] is True

    updated = api_client.post(
        reverse("platform-help-admin"),
        {
            "id": article_id,
            "title": "Opening hours",
            "slug": created.json()["data"]["slug"],
            "body": "We open at 10",
            "category": "ops",
            "is_published": False,
        },
        format="json",
    )
    assert updated.status_code == 201
    saved = HelpArticle.objects.get(id=article_id)
    assert saved.body == "We open at 10"
    assert saved.is_published is False


@pytest.mark.django_db
def test_user_search_returns_owned_tenants(
    api_client: APIClient,
    platform_admin_user: User,
    tenant_owner: User,
) -> None:
    Tenant.objects.create(slug="search-co", display_name="Search Co", owner=tenant_owner)
    api_client.force_authenticate(user=platform_admin_user)
    response = api_client.get(reverse("platform-user-search"), {"email": "ticket-owner"})
    assert response.status_code == 200
    users = response.json()["data"]["users"]
    assert users[0]["email"] == tenant_owner.email
    assert users[0]["owned_tenants"][0]["slug"] == "search-co"


@pytest.mark.django_db
def test_audit_feed_filters_by_action(api_client: APIClient, platform_admin_user: User) -> None:
    api_client.force_authenticate(user=platform_admin_user)
    from apps.platform_admin.models import PlatformAuditEvent

    PlatformAuditEvent.objects.create(actor=platform_admin_user, action="platform.ticket.update", resource_type="ticket")
    PlatformAuditEvent.objects.create(actor=platform_admin_user, action="platform.user.disable", resource_type="user")
    response = api_client.get(reverse("platform-audit-feed"), {"action": "ticket"})
    assert response.status_code == 200
    actions = [row["action"] for row in response.json()["data"]["events"]]
    assert actions == ["platform.ticket.update"]
