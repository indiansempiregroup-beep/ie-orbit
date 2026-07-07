from __future__ import annotations

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking, BookingEvent, BookingStatus
from apps.bookings.services.events import BookingEventPublisher
from apps.businesses.models import Business
from apps.notifications.constants import AUDIENCE_ADMIN, AUDIENCE_CUSTOMER
from apps.notifications.models import Notification
from apps.notifications.services.template_seed import ensure_notification_templates
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        email="m9-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def tenant(owner: User) -> Tenant:
    return Tenant.objects.create(
        slug="m9-tenant",
        display_name="M9 Tenant",
        owner=owner,
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


@pytest.fixture
def organization(tenant: Tenant) -> Organization:
    return Organization.objects.create(
        tenant=tenant,
        name="M9 Organization",
        contact_email="ops@example.com",
    )


@pytest.fixture
def business(tenant: Tenant, organization: Organization) -> Business:
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="m9-business",
        business_name="M9 Business",
        display_name="M9 Business",
        timezone="Asia/Kolkata",
        currency="INR",
        language="en",
    )


def authenticate(api_client: APIClient, user: User, tenant: Tenant) -> None:
    api_client.force_authenticate(user=user)
    api_client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)


@pytest.mark.django_db
def test_booking_event_creates_notification_and_read_endpoint(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    ensure_notification_templates(tenant=tenant, business=business)
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-TEST-001",
        customer_id=owner.id,
        service_id=owner.id,
        appointment_date=timezone.now().date(),
        start_at=timezone.now(),
        end_at=timezone.now() + timezone.timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.PENDING,
    )
    BookingEventPublisher().publish(
        booking=booking,
        event_type="BookingCreated",
        payload={"booking_id": str(booking.id)},
    )

    customer_notification = Notification.objects.get(
        tenant=tenant,
        booking=booking,
        metadata__audience=AUDIENCE_CUSTOMER,
    )
    assert customer_notification.status == "sent"

    response = api_client.get(reverse("notification-list"))
    assert response.status_code == 200
    assert response.json()["data"] == []

    read_response = api_client.patch(
        reverse("notification-mark-read", kwargs={"pk": customer_notification.id})
    )
    assert read_response.status_code == 404


@pytest.mark.django_db
def test_dashboard_and_analytics_endpoints_return_data(
    api_client: APIClient,
    owner: User,
    tenant: Tenant,
    business: Business,
) -> None:
    authenticate(api_client, owner, tenant)
    Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-TEST-002",
        customer_id=owner.id,
        service_id=owner.id,
        appointment_date=timezone.now().date(),
        start_at=timezone.now(),
        end_at=timezone.now() + timezone.timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.COMPLETED,
    )
    Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="BK-TEST-003",
        customer_id=owner.id,
        service_id=owner.id,
        appointment_date=timezone.now().date(),
        start_at=timezone.now() + timezone.timedelta(days=1),
        end_at=timezone.now() + timezone.timedelta(days=1, minutes=30),
        duration_minutes=30,
        status=BookingStatus.CANCELLED,
    )

    summary_response = api_client.get(reverse("dashboard-summary"))
    assert summary_response.status_code == 200
    assert summary_response.json()["data"]["today_count"] >= 1

    analytics_response = api_client.get(reverse("analytics-list"))
    assert analytics_response.status_code == 200
    assert analytics_response.json()["data"]["bookings"] >= 1
