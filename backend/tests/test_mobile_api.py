from __future__ import annotations

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.notifications.models import Notification
from apps.services.models import Service, ServicePricing
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def mobile_context() -> dict[str, str]:
    owner = User.objects.create_user(
        email="mobile-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="mobile-tenant",
        display_name="Mobile Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(
        tenant=tenant,
        name="Mobile Org",
    )
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="mobile-biz",
        business_name="Mobile Biz",
        display_name="Mobile Biz",
    )
    service = Service.objects.create(
        tenant=tenant,
        business=business,
        service_code="haircut",
        name="Haircut",
        display_name="Haircut",
    )
    ServicePricing.objects.create(
        tenant=tenant,
        service=service,
        currency="INR",
        base_price=999,
        is_default=True,
    )
    return {
        "tenant_slug": tenant.slug,
        "business_code": business.business_code,
        "service_id": str(service.id),
        "tenant_id": str(tenant.id),
    }


@pytest.mark.django_db
def test_mobile_discover_services(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    response = api_client.get(
        reverse("mobile-discover-services"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["tenant_slug"] == mobile_context["tenant_slug"]
    assert len(payload["services"]) == 1


@pytest.mark.django_db
def test_mobile_booking_request(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    start_at = timezone.now() + timedelta(days=1)
    response = api_client.post(
        reverse("mobile-booking-request"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
            "service_id": mobile_context["service_id"],
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
            "customer_name": "Mobile User",
            "phone_number": "+911234567890",
        },
        format="json",
    )
    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["status"] == "pending"
    assert Booking.objects.filter(id=payload["booking_id"], tenant_id=mobile_context["tenant_id"]).exists()


@pytest.mark.django_db
def test_mobile_list_bookings_for_authenticated_customer(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    customer_user = User.objects.create_user(
        email="mobile-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        first_name="Mobile",
        last_name="Customer",
        phone_number="+911234567890",
    )
    tenant = Tenant.objects.get(slug=mobile_context["tenant_slug"])
    business = Business.objects.require_tenant(tenant).get(business_code=mobile_context["business_code"])
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="cust-001",
        first_name="Mobile",
        last_name="Customer",
        display_name="Mobile Customer",
        email=customer_user.email,
        phone_number=customer_user.phone_number,
    )
    service = Service.objects.require_tenant(tenant).get(id=mobile_context["service_id"])
    start_at = timezone.now() + timedelta(days=2)
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="MOB-TEST-001",
        customer_id=customer.id,
        service_id=service.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status="pending",
    )

    api_client.force_authenticate(user=customer_user)
    response = api_client.get(
        reverse("mobile-booking-list"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
        },
    )
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["id"] == str(booking.id)
    assert rows[0]["service_name"] == "Haircut"


@pytest.mark.django_db
def test_mobile_list_bookings_requires_auth(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    response = api_client.get(
        reverse("mobile-booking-list"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
        },
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_mobile_booking_request_uses_authenticated_customer(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    customer_user = User.objects.create_user(
        email="linked-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        first_name="Linked",
        last_name="Customer",
        phone_number="+919999999999",
    )
    tenant = Tenant.objects.get(slug=mobile_context["tenant_slug"])
    business = Business.objects.require_tenant(tenant).get(business_code=mobile_context["business_code"])
    existing_customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="cust-linked",
        first_name="Linked",
        last_name="Customer",
        display_name="Linked Customer",
        email=customer_user.email,
        phone_number=customer_user.phone_number,
    )
    start_at = timezone.now() + timedelta(days=3)
    api_client.force_authenticate(user=customer_user)
    response = api_client.post(
        reverse("mobile-booking-request"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
            "service_id": mobile_context["service_id"],
            "start_at": start_at.isoformat(),
            "duration_minutes": 30,
        },
        format="json",
    )
    assert response.status_code == 201
    booking = Booking.objects.get(id=response.json()["data"]["booking_id"])
    assert booking.customer_id == existing_customer.id


@pytest.mark.django_db
def test_mobile_list_notifications_for_authenticated_user(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    customer_user = User.objects.create_user(
        email="notify-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.get(slug=mobile_context["tenant_slug"])
    business = Business.objects.require_tenant(tenant).get(business_code=mobile_context["business_code"])
    Notification.objects.create(
        tenant=tenant,
        business=business,
        user=customer_user,
        subject="Booking confirmed",
        body="Your haircut is confirmed.",
        channel="email",
        status="sent",
        metadata={"audience": "customer", "event_type": "BookingConfirmed"},
    )
    api_client.force_authenticate(user=customer_user)
    response = api_client.get(
        reverse("mobile-notification-list"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
        },
    )
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["subject"] == "Booking confirmed"


@pytest.mark.django_db
def test_mobile_list_staff(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    from apps.staff.models import EmploymentStatus, Staff

    tenant = Tenant.objects.get(slug=mobile_context["tenant_slug"])
    business = Business.objects.require_tenant(tenant).get(business_code=mobile_context["business_code"])
    Staff.objects.create(
        tenant=tenant,
        business=business,
        staff_code="stylist-1",
        first_name="Jamie",
        last_name="Rivera",
        display_name="Jamie Rivera",
        designation="Senior Stylist",
        employment_status=EmploymentStatus.ACTIVE,
    )
    response = api_client.get(
        reverse("mobile-staff-list"),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
        },
    )
    assert response.status_code == 200
    assert len(response.json()["data"]) == 1


@pytest.mark.django_db
def test_mobile_cancel_booking(api_client: APIClient, mobile_context: dict[str, str]) -> None:
    customer_user = User.objects.create_user(
        email="cancel-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        phone_number="+911111111111",
    )
    tenant = Tenant.objects.get(slug=mobile_context["tenant_slug"])
    business = Business.objects.require_tenant(tenant).get(business_code=mobile_context["business_code"])
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="cust-cancel",
        first_name="Cancel",
        last_name="Customer",
        display_name="Cancel Customer",
        email=customer_user.email,
        phone_number=customer_user.phone_number,
    )
    service = Service.objects.require_tenant(tenant).get(id=mobile_context["service_id"])
    start_at = timezone.now() + timedelta(days=4)
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="MOB-CANCEL-001",
        customer_id=customer.id,
        service_id=service.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status="pending",
    )
    api_client.force_authenticate(user=customer_user)
    response = api_client.post(
        reverse("mobile-booking-cancel", kwargs={"booking_id": booking.id}),
        {
            "tenant_slug": mobile_context["tenant_slug"],
            "business_code": mobile_context["business_code"],
            "reason": "Changed plans",
        },
        format="json",
    )
    assert response.status_code == 200
    booking.refresh_from_db()
    assert booking.status == "cancelled"


@pytest.mark.django_db
def test_mobile_customer_profile_accepts_high_precision_map_coords(
    api_client: APIClient,
    mobile_context: dict[str, str],
) -> None:
    customer_user = User.objects.create_user(
        email="map-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        first_name="Map",
        last_name="Customer",
        phone_number="+912222222222",
    )
    api_client.force_authenticate(user=customer_user)
    response = api_client.patch(
        reverse("mobile-customer-profile"),
        {
            "full_address": "Kalyani Nagar, Pune",
            "latitude": 19.0760123456789,
            "longitude": 72.8777123456789,
        },
        format="json",
        QUERY_STRING=(
            f"tenant_slug={mobile_context['tenant_slug']}"
            f"&business_code={mobile_context['business_code']}"
        ),
    )
    assert response.status_code == 200, response.content
    address = response.json()["data"]["address"]
    assert address["full_address"] == "Kalyani Nagar, Pune"
    assert address["latitude"] == pytest.approx(19.076012)
    assert address["longitude"] == pytest.approx(72.877712)
