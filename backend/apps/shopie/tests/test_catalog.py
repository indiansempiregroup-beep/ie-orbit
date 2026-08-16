from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.shopie.models import BarcodeType, ProductStatus
from apps.shopie.services.catalog import CatalogService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="shopie-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-tenant",
        display_name="ShopIE Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-biz",
        business_name="ShopIE Biz",
        display_name="ShopIE Biz",
        selected_product="shopie",
    )


@pytest.mark.django_db
def test_create_product_with_multiple_barcodes(shop_business: Business) -> None:
    service = CatalogService()
    product = service.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Test Pack",
            "price": "199.00",
            "stock_on_hand": "5",
            "status": ProductStatus.ACTIVE,
        },
        barcodes=[
            {"code": "8901234567890", "barcode_type": BarcodeType.MANUFACTURER, "is_primary": True},
            {"code": "SHOP-001", "barcode_type": BarcodeType.INTERNAL},
        ],
    )
    assert product.name == "Test Pack"
    assert product.stock_on_hand == Decimal("5")
    assert product.barcodes.count() == 2
    found = service.lookup_by_barcode(
        tenant=shop_business.tenant, business=shop_business, code="SHOP-001"
    )
    assert found is not None
    assert found.id == product.id


@pytest.mark.django_db
def test_create_product_sanitizes_details_html(shop_business: Business) -> None:
    service = CatalogService()
    product = service.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Rich Pack",
            "price": "99.00",
            "details_html": '<p>Safe</p><script>alert(1)</script><a href="https://example.com">link</a>',
        },
    )
    assert "<script>" not in product.details_html
    assert "Safe" in product.details_html
    assert "https://example.com" in product.details_html


@pytest.mark.django_db
def test_duplicate_barcode_rejected(shop_business: Business) -> None:
    service = CatalogService()
    service.create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={"name": "A", "price": "10"},
        barcodes=[{"code": "DUP-1", "barcode_type": BarcodeType.INTERNAL}],
    )
    with pytest.raises(ValidationError):
        service.create_product(
            tenant=shop_business.tenant,
            business=shop_business,
            data={"name": "B", "price": "10"},
            barcodes=[{"code": "DUP-1", "barcode_type": BarcodeType.INTERNAL}],
        )
