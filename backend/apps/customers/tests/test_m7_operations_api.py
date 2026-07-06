from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        email="m7-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def tenant(owner: User) -> Tenant:
    return Tenant.objects.create(
        slug="m7-tenant",
        display_name="M7 Tenant",
        owner=owner,
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


@pytest.fixture
def organization(tenant: Tenant) -> Organization:
    return Organization.objects.create(
        tenant=tenant,
        name="M7 Organization",
        contact_email="ops@example.com",
    )


@pytest.fixture
def business(tenant: Tenant, organization: Organization) -> Business:
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="m7-business",
        business_name="M7 Business",
        display_name="M7 Business",
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


def authenticate(api_client: APIClient, user: User, tenant: Tenant) -> None:
    api_client.force_authenticate(user=user)
    api_client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)


@pytest.mark.django_db
def test_customer_crud_search_and_bulk_archive(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    create_response = api_client.post(
        reverse("customer-list-create"),
        {
            "business": str(business.id),
            "customer_code": "cust-001",
            "first_name": "Anaya",
            "last_name": "Sharma",
            "display_name": "Anaya Sharma",
            "email": "anaya@example.com",
            "phone_number": "+919999999999",
            "tags": ["vip"],
        },
        format="json",
    )

    assert create_response.status_code == 201
    customer_id = create_response.json()["data"]["id"]

    search_response = api_client.get(reverse("operations-search"), {"q": "Anaya"})
    assert search_response.status_code == 200
    assert search_response.json()["data"]["customers"][0]["id"] == customer_id

    patch_response = api_client.patch(
        reverse("customer-detail", kwargs={"pk": customer_id}),
        {"display_name": "Anaya S."},
        format="json",
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["display_name"] == "Anaya S."

    archive_response = api_client.post(
        reverse("customer-bulk-archive"),
        {"ids": [customer_id]},
        format="json",
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["data"]["archived"] == 1


@pytest.mark.django_db
def test_service_and_staff_assignment_flow(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    category_response = api_client.post(
        reverse("service-category-list-create"),
        {
            "business": str(business.id),
            "name": "Hair",
            "slug": "hair",
            "description": "Hair services",
        },
        format="json",
    )
    assert category_response.status_code == 201
    category_id = category_response.json()["data"]["id"]

    service_response = api_client.post(
        reverse("service-list-create"),
        {
            "business": str(business.id),
            "category": category_id,
            "service_code": "hair-cut",
            "name": "Hair Cut",
            "display_name": "Hair Cut",
            "tags": ["hair"],
            "default_duration": {"duration_minutes": 45},
            "default_price": {"currency": "INR", "base_price": "500.00"},
        },
        format="json",
    )
    assert service_response.status_code == 201
    service_id = service_response.json()["data"]["id"]

    staff_response = api_client.post(
        reverse("staff-list-create"),
        {
            "business": str(business.id),
            "staff_code": "stylist-001",
            "first_name": "Riya",
            "display_name": "Riya",
            "email": "riya@example.com",
            "designation": "Stylist",
            "department": "Salon",
            "tags": ["hair"],
        },
        format="json",
    )
    assert staff_response.status_code == 201
    staff_id = staff_response.json()["data"]["id"]

    skill_response = api_client.post(
        reverse("staff-skill-list-create"),
        {
            "staff": staff_id,
            "service": service_id,
            "skill_level": "expert",
            "years_experience": "5.00",
        },
        format="json",
    )
    assert skill_response.status_code == 201

    assignment_response = api_client.post(
        reverse("staff-assignment-list-create"),
        {
            "staff": staff_id,
            "service": service_id,
            "default_duration_override": 40,
            "default_price_override": "550.00",
            "priority": 1,
        },
        format="json",
    )
    assert assignment_response.status_code == 201

    search_response = api_client.get(reverse("operations-search"), {"q": "Hair"})
    assert search_response.status_code == 200
    assert search_response.json()["data"]["services"][0]["id"] == service_id
