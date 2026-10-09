from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.api.mobile_helpers import ensure_customer_for_user
from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.staff.models import Staff
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    user = User.objects.create_user(
        email="identity-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


@pytest.fixture
def tenant(owner: User) -> Tenant:
    return Tenant.objects.create(
        slug="identity-tenant",
        display_name="Identity Tenant",
        owner=owner,
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


@pytest.fixture
def organization(tenant: Tenant) -> Organization:
    return Organization.objects.create(
        tenant=tenant,
        name="Identity Organization",
        contact_email="ops@example.com",
    )


@pytest.fixture
def business(tenant: Tenant, organization: Organization) -> Business:
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="identity-biz",
        business_name="Identity Biz",
        display_name="Identity Biz",
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


@pytest.fixture
def other_business(tenant: Tenant, organization: Organization) -> Business:
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="identity-biz-2",
        business_name="Identity Biz 2",
        display_name="Identity Biz 2",
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


def authenticate(api_client: APIClient, user: User, tenant: Tenant) -> None:
    api_client.force_authenticate(user=user)
    api_client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)


def _create_staff_row(*, tenant: Tenant, business: Business, email: str, phone: str, user: User | None = None) -> Staff:
    return Staff.objects.create(
        tenant=tenant,
        business=business,
        user=user,
        staff_code=f"st-{email.split('@')[0][:20]}",
        first_name="Staff",
        display_name="Staff",
        email=email,
        phone_number=phone,
    )


def _create_customer_row(*, tenant: Tenant, business: Business, email: str, phone: str) -> Customer:
    return Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code=f"cu-{email.split('@')[0][:20]}",
        first_name="Customer",
        display_name="Customer",
        email=email,
        phone_number=phone,
    )


@pytest.mark.django_db
def test_create_customer_rejects_staff_email(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    _create_staff_row(tenant=tenant, business=business, email="shared@example.com", phone="9876543210")

    response = api_client.post(
        reverse("customer-list-create"),
        {
            "business": str(business.id),
            "customer_code": "cust-shared",
            "first_name": "Cust",
            "display_name": "Cust",
            "email": "shared@example.com",
            "phone_number": "9123456789",
        },
        format="json",
    )
    assert response.status_code == 422
    assert "staff" in str(response.json()).lower()


@pytest.mark.django_db
def test_create_staff_rejects_customer_phone(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    _create_customer_row(tenant=tenant, business=business, email="cust@example.com", phone="9876543210")

    response = api_client.post(
        reverse("staff-list-create"),
        {
            "business": str(business.id),
            "staff_code": "staff-shared",
            "first_name": "Staff",
            "display_name": "Staff",
            "email": "staff-new@example.com",
            "phone_number": "9876543210",
            "is_bookable": True,
        },
        format="json",
    )
    assert response.status_code == 422
    assert "customer" in str(response.json()).lower()


@pytest.mark.django_db
def test_invite_staff_rejects_existing_customer_email(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    _create_customer_row(tenant=tenant, business=business, email="invite-me@example.com", phone="9988776655")

    response = api_client.post(
        reverse("business-invitation-list-create", kwargs={"pk": business.id}),
        {"email": "invite-me@example.com", "platform_role_code": "staff"},
        format="json",
    )
    assert response.status_code == 422
    assert "customer" in str(response.json()).lower()


@pytest.mark.django_db
def test_ensure_customer_for_user_rejects_linked_staff(
    tenant: Tenant,
    business: Business,
) -> None:
    staff_user = User.objects.create_user(
        email="linked-staff@example.com",
        password=None,
        status=UserStatus.ACTIVE,
        phone_number="9000011122",
    )
    _create_staff_row(
        tenant=tenant,
        business=business,
        email="linked-staff@example.com",
        phone="9000011122",
        user=staff_user,
    )

    with pytest.raises(ValidationError) as exc:
        ensure_customer_for_user(tenant=tenant, business=business, user=staff_user)
    assert "staff" in str(exc.value).lower()


@pytest.mark.django_db
def test_update_customer_rejects_staff_email(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    _create_staff_row(tenant=tenant, business=business, email="staff-only@example.com", phone="9111222333")
    customer = _create_customer_row(
        tenant=tenant,
        business=business,
        email="other-customer@example.com",
        phone="9222333444",
    )

    response = api_client.patch(
        reverse("customer-detail", kwargs={"pk": customer.id}),
        {"email": "staff-only@example.com"},
        format="json",
    )
    assert response.status_code == 422
    assert "staff" in str(response.json()).lower()


@pytest.mark.django_db
def test_same_email_allowed_across_businesses(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
    other_business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    _create_staff_row(tenant=tenant, business=business, email="cross@example.com", phone="9333444555")

    response = api_client.post(
        reverse("customer-list-create"),
        {
            "business": str(other_business.id),
            "customer_code": "cust-cross",
            "first_name": "Cross",
            "display_name": "Cross",
            "email": "cross@example.com",
            "phone_number": "9444555666",
        },
        format="json",
    )
    assert response.status_code == 201
