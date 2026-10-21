from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.tests.otp_helpers import authenticate_api_client
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.customers.models import Customer
from apps.shopie.models import QuotationStatus, ShopProduct, ShopQuotation
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def quote_workspace():
    owner = User.objects.create_user(
        email="quote-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="quote-tenant", display_name="Quote Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Quote Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="quote-biz",
        business_name="Quote Biz",
        display_name="Quote Biz",
        selected_product="shopie",
        currency="INR",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-pro",
        defaults={"name": "Orbit Mart Pro", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=timezone.now() - timedelta(days=1),
        current_period_ends_at=timezone.now() + timedelta(days=30),
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="quote-cust-1",
        first_name="Maya",
        last_name="Shah",
        display_name="Maya Shah",
    )
    product = ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Teak Frame",
        sku="TEAK-1",
        price=Decimal("100.00"),
        tax_rate=Decimal("18"),
        gst_rate=Decimal("18"),
        stock_on_hand=Decimal("20"),
    )
    return {
        "owner": owner,
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "product": product,
    }


def _create_quote(workspace, **kwargs) -> ShopQuotation:
    return OrderService().create_quotation(
        tenant=workspace["tenant"],
        business=workspace["business"],
        customer=workspace["customer"],
        lines=[{"product_id": workspace["product"].id, "quantity": "2"}],
        **kwargs,
    )


@pytest.mark.django_db
def test_update_quotation_changes_lines_status_and_notes(quote_workspace):
    quote = _create_quote(quote_workspace, notes="First draft")
    assert quote.status == QuotationStatus.DRAFT
    assert quote.total == Decimal("236.00")

    updated = OrderService().update_quotation(
        tenant=quote_workspace["tenant"],
        business=quote_workspace["business"],
        quotation=quote,
        notes="Revised",
        status=QuotationStatus.SENT,
        valid_until=date(2026, 12, 31),
        lines=[
            {
                "product_id": quote_workspace["product"].id,
                "quantity": "1",
                "unit_price": "150.00",
                "tax_rate": "18",
            }
        ],
    )
    assert updated.notes == "Revised"
    assert updated.status == QuotationStatus.SENT
    assert updated.valid_until == date(2026, 12, 31)
    assert updated.subtotal == Decimal("150.00")
    assert updated.tax_total == Decimal("27.00")
    assert updated.total == Decimal("177.00")
    assert updated.line_items[0]["name"] == "Teak Frame"


@pytest.mark.django_db
def test_update_quotation_rejects_converted(quote_workspace):
    quote = _create_quote(quote_workspace)
    quote.status = QuotationStatus.CONVERTED
    quote.save(update_fields=["status", "updated_at", "version"])
    with pytest.raises(ValidationError):
        OrderService().update_quotation(
            tenant=quote_workspace["tenant"],
            business=quote_workspace["business"],
            quotation=quote,
            notes="Nope",
        )


def authenticate(api_client: APIClient, owner: User, tenant: Tenant) -> None:
    access = authenticate_api_client(api_client, owner)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=str(tenant.id),
    )


@pytest.mark.django_db
def test_quotation_get_and_patch_api(api_client: APIClient, quote_workspace):
    authenticate(api_client, quote_workspace["owner"], quote_workspace["tenant"])
    quote = _create_quote(quote_workspace)
    url = reverse("shop-quotation-detail", kwargs={"quotation_id": quote.id})

    fetched = api_client.get(url)
    assert fetched.status_code == 200
    body = fetched.json()["data"]
    assert body["quotation_number"] == quote.quotation_number
    assert body["customer_name"] == "Maya Shah"
    assert len(body["line_items"]) == 1

    patched = api_client.patch(
        url,
        {
            "status": "accepted",
            "notes": "Customer confirmed",
            "valid_until": "2026-11-30",
            "lines": [
                {
                    "product_id": str(quote_workspace["product"].id),
                    "quantity": "3",
                    "unit_price": "100.00",
                    "tax_rate": "18",
                }
            ],
        },
        format="json",
    )
    assert patched.status_code == 200, patched.content
    data = patched.json()["data"]
    assert data["status"] == "accepted"
    assert data["notes"] == "Customer confirmed"
    assert data["valid_until"] == "2026-11-30"
    assert data["total"] == "354.00"

    quote.status = QuotationStatus.CONVERTED
    quote.save(update_fields=["status", "updated_at", "version"])
    blocked = api_client.patch(url, {"notes": "too late"}, format="json")
    assert blocked.status_code == 422
