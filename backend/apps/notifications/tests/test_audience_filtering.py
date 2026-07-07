from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.notifications.constants import AUDIENCE_ADMIN, AUDIENCE_CUSTOMER
from apps.notifications.models import Notification
from apps.notifications.repositories.notifications import NotificationRepository
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def tenant_owner() -> User:
    return User.objects.create_user(
        email="owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def customer_user() -> User:
    return User.objects.create_user(
        email="customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def tenant(tenant_owner: User) -> Tenant:
    return Tenant.objects.create(
        slug="audience-tenant",
        display_name="Audience Tenant",
        owner=tenant_owner,
    )


@pytest.fixture
def business(tenant: Tenant) -> Business:
    organization = Organization.objects.create(tenant=tenant, name="Audience Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="audience-biz",
        business_name="Audience Biz",
        display_name="Audience Biz",
    )


def _create_notification(
    *,
    tenant: Tenant,
    business: Business,
    user: User,
    audience: str,
    subject: str,
) -> Notification:
    return Notification.objects.create(
        tenant=tenant,
        business=business,
        user=user,
        subject=subject,
        body=subject,
        channel="in_app",
        status="sent",
        metadata={"audience": audience, "event_type": "BookingCreated"},
    )


@pytest.mark.django_db
def test_web_portal_lists_only_admin_notifications(
    api_client: APIClient,
    tenant_owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    _create_notification(
        tenant=tenant,
        business=business,
        user=tenant_owner,
        audience=AUDIENCE_CUSTOMER,
        subject="Your booking request received",
    )
    admin_notification = _create_notification(
        tenant=tenant,
        business=business,
        user=tenant_owner,
        audience=AUDIENCE_ADMIN,
        subject="New booking request",
    )

    api_client.force_authenticate(user=tenant_owner)
    api_client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)

    response = api_client.get(reverse("notification-list"))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["id"] == str(admin_notification.id)


@pytest.mark.django_db
def test_mobile_lists_only_customer_notifications(
    api_client: APIClient,
    customer_user: User,
    tenant: Tenant,
    business: Business,
) -> None:
    _create_notification(
        tenant=tenant,
        business=business,
        user=customer_user,
        audience=AUDIENCE_ADMIN,
        subject="New booking request",
    )
    customer_notification = _create_notification(
        tenant=tenant,
        business=business,
        user=customer_user,
        audience=AUDIENCE_CUSTOMER,
        subject="Your booking request received",
    )

    api_client.force_authenticate(user=customer_user)
    response = api_client.get(
        reverse("mobile-notification-list"),
        {"tenant_slug": tenant.slug, "business_code": business.business_code},
    )
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["id"] == str(customer_notification.id)


@pytest.mark.django_db
def test_repository_audience_filter_splits_shared_user(
    tenant_owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    repository = NotificationRepository()
    _create_notification(
        tenant=tenant,
        business=business,
        user=tenant_owner,
        audience=AUDIENCE_CUSTOMER,
        subject="Customer copy",
    )
    _create_notification(
        tenant=tenant,
        business=business,
        user=tenant_owner,
        audience=AUDIENCE_ADMIN,
        subject="Admin copy",
    )

    customer_rows = repository.list_for_request(
        tenant=tenant,
        user=tenant_owner,
        audience=AUDIENCE_CUSTOMER,
        business=business,
    )
    admin_rows = repository.list_for_request(
        tenant=tenant,
        user=tenant_owner,
        audience=AUDIENCE_ADMIN,
        business=business,
    )

    assert customer_rows.count() == 1
    assert admin_rows.count() == 1
    assert customer_rows.first().subject == "Customer copy"
    assert admin_rows.first().subject == "Admin copy"
