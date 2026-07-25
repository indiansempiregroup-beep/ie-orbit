from __future__ import annotations

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking, BookingReview, BookingStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.notifications.models import NotificationTemplate
from apps.notifications.services.template_seed import ensure_notification_templates
from apps.services.models import Service
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def review_context(api_client: APIClient) -> dict:
    owner = User.objects.create_user(
        email="review-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="review-tenant",
        display_name="Review Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Review Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="review-biz",
        business_name="Review Biz",
        display_name="Review Biz",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="cust-asha",
        first_name="Asha",
        last_name="Patel",
        display_name="Asha Patel",
        email="asha@example.com",
    )
    service = Service.objects.create(
        tenant=tenant,
        business=business,
        service_code="haircut",
        name="Haircut",
        display_name="Haircut",
    )
    start_at = timezone.now() - timedelta(hours=2)
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number="REV-001",
        customer_id=customer.id,
        service_id=service.id,
        appointment_date=start_at.date(),
        start_at=start_at,
        end_at=start_at + timedelta(minutes=30),
        duration_minutes=30,
        status=BookingStatus.COMPLETED,
    )
    login = api_client.post(
        reverse("auth-login"),
        {"email": owner.email, "password": "ValidPass123"},
        format="json",
    )
    access = login.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=str(tenant.id))
    return {
        "owner": owner,
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "service": service,
        "booking": booking,
        "api_client": api_client,
    }


@pytest.mark.django_db
def test_ops_can_list_booking_reviews(review_context: dict) -> None:
    booking = review_context["booking"]
    BookingReview.objects.create(
        tenant=review_context["tenant"],
        business=review_context["business"],
        booking=booking,
        customer_id=review_context["customer"].id,
        rating=5,
        comment="Great cut!",
    )
    response = review_context["api_client"].get(reverse("booking-review-list"))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["rating"] == 5
    assert rows[0]["customer_name"] == "Asha Patel"
    assert rows[0]["service_name"] == "Haircut"
    assert rows[0]["comment"] == "Great cut!"


@pytest.mark.django_db
def test_booking_detail_includes_review(review_context: dict) -> None:
    booking = review_context["booking"]
    BookingReview.objects.create(
        tenant=review_context["tenant"],
        business=review_context["business"],
        booking=booking,
        customer_id=review_context["customer"].id,
        rating=4,
        comment="Nice",
    )
    response = review_context["api_client"].get(
        reverse("booking-detail", kwargs={"booking_id": booking.id})
    )
    assert response.status_code == 200
    review = response.json()["data"]["review"]
    assert review["rating"] == 4
    assert review["comment"] == "Nice"


@pytest.mark.django_db
def test_mobile_booking_serializer_includes_review(review_context: dict) -> None:
    from apps.api.mobile_views import _serialize_mobile_booking

    booking = review_context["booking"]
    BookingReview.objects.create(
        tenant=review_context["tenant"],
        business=review_context["business"],
        booking=booking,
        customer_id=review_context["customer"].id,
        rating=5,
        comment="Loved it",
    )
    payload = _serialize_mobile_booking(booking=booking, tenant=review_context["tenant"])
    assert payload["review"] is not None
    assert payload["review"]["rating"] == 5
    assert payload["review"]["comment"] == "Loved it"


@pytest.mark.django_db
def test_review_admin_template_is_seeded(review_context: dict) -> None:
    ensure_notification_templates(
        tenant=review_context["tenant"],
        business=review_context["business"],
    )
    assert NotificationTemplate.objects.filter(
        tenant=review_context["tenant"],
        business=review_context["business"],
        code="booking_reviewed_admin",
    ).exists()
