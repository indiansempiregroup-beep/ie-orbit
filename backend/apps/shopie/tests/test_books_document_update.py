from __future__ import annotations

from datetime import timedelta
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
from apps.shopie.models import BooksDocumentStatus, BooksDocumentType, ShopProduct, ShopSupplier
from apps.shopie.services.documents import DocumentsService
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def doc_workspace():
    owner = User.objects.create_user(
        email="docs-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="docs-tenant", display_name="Docs Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Docs Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="docs-biz",
        business_name="Docs Biz",
        display_name="Docs Biz",
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
        customer_code="docs-cust-1",
        first_name="Asha",
        last_name="Patil",
        display_name="Asha Patil",
    )
    supplier = ShopSupplier.objects.create(
        tenant=tenant,
        business=business,
        name="Metro Supplies",
    )
    product = ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Steel Bolt",
        sku="BOLT-1",
        price=Decimal("50.00"),
        tax_rate=Decimal("18"),
        gst_rate=Decimal("18"),
        stock_on_hand=Decimal("40"),
    )
    return {
        "owner": owner,
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "supplier": supplier,
        "product": product,
    }


def _line(workspace, qty="2"):
    return [
        {
            "product_id": workspace["product"].id,
            "quantity": qty,
            "unit_price": "50.00",
            "tax_rate": "18",
        }
    ]


def authenticate(api_client: APIClient, owner: User, tenant: Tenant) -> None:
    access = authenticate_api_client(api_client, owner)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=str(tenant.id),
    )


@pytest.mark.django_db
def test_sale_order_update_changes_lines_and_notes(doc_workspace):
    docs = DocumentsService()
    document = docs.create_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        doc_type=BooksDocumentType.SALE_ORDER,
        customer=doc_workspace["customer"],
        lines=_line(doc_workspace),
        notes="First",
    )
    updated = docs.update_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        document=document,
        notes="Revised order",
        status=BooksDocumentStatus.DRAFT,
        lines=_line(doc_workspace, "4"),
    )
    assert updated.notes == "Revised order"
    assert updated.status == BooksDocumentStatus.DRAFT
    assert updated.total == Decimal("236.00")
    assert updated.line_items[0]["quantity"] == "4"


@pytest.mark.django_db
def test_converted_document_cannot_be_updated(doc_workspace):
    docs = DocumentsService()
    document = docs.create_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        doc_type=BooksDocumentType.SALE_ORDER,
        customer=doc_workspace["customer"],
        lines=_line(doc_workspace),
    )
    docs.convert_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        document=document,
    )
    document.refresh_from_db()
    with pytest.raises(ValidationError):
        docs.update_document(
            tenant=doc_workspace["tenant"],
            business=doc_workspace["business"],
            document=document,
            notes="too late",
        )


@pytest.mark.django_db
def test_dispatched_challan_locks_lines(doc_workspace):
    docs = DocumentsService()
    document = docs.create_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        doc_type=BooksDocumentType.DELIVERY_CHALLAN,
        customer=doc_workspace["customer"],
        lines=_line(doc_workspace, "1"),
    )
    docs.convert_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        document=document,
        action="dispatch",
    )
    document.refresh_from_db()
    assert document.status == BooksDocumentStatus.DISPATCHED
    with pytest.raises(ValidationError):
        docs.update_document(
            tenant=doc_workspace["tenant"],
            business=doc_workspace["business"],
            document=document,
            lines=_line(doc_workspace, "3"),
        )
    noted = docs.update_document(
        tenant=doc_workspace["tenant"],
        business=doc_workspace["business"],
        document=document,
        notes="Left with driver",
    )
    assert noted.notes == "Left with driver"
    assert noted.status == BooksDocumentStatus.DISPATCHED


@pytest.mark.django_db
def test_document_get_and_patch_api(api_client: APIClient, doc_workspace):
    authenticate(api_client, doc_workspace["owner"], doc_workspace["tenant"])
    created = api_client.post(
        reverse("shop-books-document-list-create"),
        {
            "business_id": str(doc_workspace["business"].id),
            "doc_type": "purchase_order",
            "supplier_id": str(doc_workspace["supplier"].id),
            "notes": "Need bolts",
            "lines": [
                {
                    "product_id": str(doc_workspace["product"].id),
                    "quantity": "2",
                    "unit_price": "50.00",
                    "tax_rate": "18",
                }
            ],
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    document_id = created.json()["data"]["id"]
    url = reverse("shop-books-document-detail", kwargs={"document_id": document_id})

    fetched = api_client.get(url)
    assert fetched.status_code == 200
    body = fetched.json()["data"]
    assert body["supplier_name"] == "Metro Supplies"
    assert body["doc_type"] == "purchase_order"

    patched = api_client.patch(
        url,
        {
            "notes": "Need more bolts",
            "status": "confirmed",
            "lines": [
                {
                    "product_id": str(doc_workspace["product"].id),
                    "quantity": "5",
                    "unit_price": "50.00",
                    "tax_rate": "18",
                }
            ],
        },
        format="json",
    )
    assert patched.status_code == 200, patched.content
    data = patched.json()["data"]
    assert data["notes"] == "Need more bolts"
    assert data["total"] == "295.00"

    converted = api_client.post(
        reverse("shop-books-document-convert", kwargs={"document_id": document_id}),
        {},
        format="json",
    )
    assert converted.status_code == 200, converted.content
    assert "voucher_number" in converted.json()["data"]

    blocked = api_client.patch(url, {"notes": "too late"}, format="json")
    assert blocked.status_code == 422
