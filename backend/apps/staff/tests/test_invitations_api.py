from __future__ import annotations

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.staff.models import InvitationStatus, StaffInvitation


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    user = User.objects.create_user(
        email="invite-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


def authenticate(api_client: APIClient, user: User) -> str:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


def bootstrap_workspace(api_client: APIClient, user: User) -> tuple[str, str]:
    access = authenticate(api_client, user)
    tenant_response = api_client.post(
        reverse("tenant-list-create"),
        {
            "slug": "invite-tenant",
            "display_name": "Invite Tenant",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )
    tenant_id = tenant_response.json()["data"]["id"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "invite-biz",
            "business_name": "Invite Biz",
            "display_name": "Invite Biz",
        },
        format="json",
    )
    business_id = business_response.json()["data"]["id"]
    return tenant_id, business_id


@pytest.mark.django_db
def test_staff_invitation_and_accept_flow(api_client: APIClient, owner: User) -> None:
    tenant_id, business_id = bootstrap_workspace(api_client, owner)

    invite_response = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business_id}),
        {"email": "new-staff@example.com", "platform_role_code": "staff"},
        format="json",
    )
    assert invite_response.status_code == 201
    invitation_id = invite_response.json()["data"]["id"]
    assert mail.outbox

    invitation = StaffInvitation.objects.get(id=invitation_id)
    api_client.credentials()

    accept_response = api_client.post(
        reverse("auth-accept-invitation"),
        {
            "token": str(invitation.token),
            "password": "WelcomePass123",
            "first_name": "New",
            "last_name": "Staff",
        },
        format="json",
    )
    assert accept_response.status_code == 200
    assert accept_response.json()["data"]["created_user"] is True

    invitation.refresh_from_db()
    assert invitation.status == InvitationStatus.ACCEPTED
    assert invitation.staff_id is not None


@pytest.mark.django_db
def test_iam_member_list(api_client: APIClient, owner: User) -> None:
    bootstrap_workspace(api_client, owner)
    response = api_client.get(reverse("iam-member-list"))
    assert response.status_code == 200
    members = response.json()["data"]
    assert any(member["email"] == owner.email for member in members)


@pytest.mark.django_db
def test_iam_role_assign_rejects_external_user(api_client: APIClient, owner: User) -> None:
    bootstrap_workspace(api_client, owner)
    outsider = User.objects.create_user(
        email="outsider@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    response = api_client.post(
        reverse("iam-member-role-assign", kwargs={"user_id": outsider.id}),
        {"role_code": "staff"},
        format="json",
    )
    assert response.status_code == 404
