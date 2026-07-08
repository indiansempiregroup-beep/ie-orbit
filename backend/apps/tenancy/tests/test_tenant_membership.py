from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.staff.models import Staff
from apps.staff.services.invitations import StaffInvitationService
from apps.tenancy.repositories import TenantRepository


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    user = User.objects.create_user(
        email="tenant-owner@example.com",
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
            "slug": "staff-tenant",
            "display_name": "Staff Tenant",
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
            "business_code": "staff-biz",
            "business_name": "Staff Biz",
            "display_name": "Staff Biz",
        },
        format="json",
    )
    business_id = business_response.json()["data"]["id"]
    return tenant_id, business_id


@pytest.mark.django_db
def test_staff_member_can_list_owned_tenant(api_client: APIClient, owner: User) -> None:
    tenant_id, business_id = bootstrap_workspace(api_client, owner)

    invite = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business_id}),
        {"email": "linked-staff@example.com", "platform_role_code": "staff"},
        format="json",
    )
    invitation_id = invite.json()["data"]["id"]
    invitation = StaffInvitation.objects.get(id=invitation_id)
    token = str(invitation.token)

    StaffInvitationService().accept_invitation(
        token=token,
        password="ValidPass123",
        first_name="Linked",
        last_name="Staff",
    )

    staff_user = User.objects.get(email="linked-staff@example.com")
    visible_tenants = TenantRepository().list_for_user(staff_user)
    assert visible_tenants.filter(id=tenant_id).exists()

    staff_access = authenticate(api_client, staff_user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_access}")
    tenant_list = api_client.get(reverse("tenant-list-create"), format="json")
    assert tenant_list.status_code == 200
    tenant_ids = {item["id"] for item in tenant_list.json()["data"]}
    assert tenant_id in tenant_ids

    assert Staff.objects.filter(user=staff_user, tenant_id=tenant_id, business_id=business_id).exists()
