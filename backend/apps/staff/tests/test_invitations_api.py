from __future__ import annotations

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.authentication.tests.otp_helpers import otp_login_ops
from apps.staff.models import InvitationStatus, Staff, StaffInvitation


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    user = User.objects.create_user(
        email="invite-owner@example.com",
        password=None,
        status=UserStatus.ACTIVE,
    )
    user.is_superuser = True
    user.save(update_fields=["is_superuser", "updated_at"])
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


def authenticate(api_client: APIClient, user: User) -> str:
    payload = otp_login_ops(api_client, user)
    access = payload["access"]
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
def test_invite_accept_links_existing_directory_staff(api_client: APIClient, owner: User) -> None:
    _tenant_id, business_id = bootstrap_workspace(api_client, owner)
    email = "precreated@example.com"
    create_response = api_client.post(
        reverse("staff-list-create"),
        {
            "business": business_id,
            "staff_code": "staff-pre",
            "first_name": "Pre",
            "last_name": "Created",
            "display_name": "Pre Created",
            "email": email,
            "is_bookable": True,
        },
        format="json",
    )
    assert create_response.status_code == 201
    staff_id = create_response.json()["data"]["id"]

    invite_response = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business_id}),
        {"email": email, "platform_role_code": "staff"},
        format="json",
    )
    assert invite_response.status_code == 201
    invitation = StaffInvitation.objects.get(id=invite_response.json()["data"]["id"])
    api_client.credentials()

    accept_response = api_client.post(
        reverse("auth-accept-invitation"),
        {"token": str(invitation.token), "first_name": "Pre", "last_name": "Created"},
        format="json",
    )
    assert accept_response.status_code == 200
    assert accept_response.json()["data"]["staff_id"] == staff_id
    assert Staff.objects.filter(business_id=business_id, email__iexact=email).count() == 1
    staff = Staff.objects.get(id=staff_id)
    assert staff.user_id is not None


@pytest.mark.django_db
def test_staff_create_rejects_duplicate_email(api_client: APIClient, owner: User) -> None:
    _tenant_id, business_id = bootstrap_workspace(api_client, owner)
    payload = {
        "business": business_id,
        "staff_code": "staff-one",
        "first_name": "One",
        "display_name": "One",
        "email": "dup@example.com",
        "is_bookable": True,
    }
    first = api_client.post(reverse("staff-list-create"), payload, format="json")
    assert first.status_code == 201
    second = api_client.post(
        reverse("staff-list-create"),
        {**payload, "staff_code": "staff-two", "display_name": "Two"},
        format="json",
    )
    assert second.status_code == 400
    assert "email" in str(second.json()).lower()


@pytest.mark.django_db
def test_staff_invitation_resend_pending(api_client: APIClient, owner: User) -> None:
    _tenant_id, business_id = bootstrap_workspace(api_client, owner)

    first = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business_id}),
        {"email": "resend-staff@example.com", "platform_role_code": "staff"},
        format="json",
    )
    assert first.status_code == 201
    first_data = first.json()["data"]
    first_token = StaffInvitation.objects.get(id=first_data["id"]).token
    assert len(mail.outbox) == 1

    second = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business_id}),
        {"email": "resend-staff@example.com", "platform_role_code": "manager"},
        format="json",
    )
    assert second.status_code == 201
    second_data = second.json()["data"]
    assert second_data["id"] == first_data["id"]
    assert second_data["platform_role_code"] == "manager"
    assert len(mail.outbox) == 2

    invitation = StaffInvitation.objects.get(id=first_data["id"])
    assert invitation.status == InvitationStatus.PENDING
    assert invitation.token != first_token
    assert (
        StaffInvitation.objects.filter(
            business_id=business_id,
            email="resend-staff@example.com",
            status=InvitationStatus.PENDING,
        ).count()
        == 1
    )


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
