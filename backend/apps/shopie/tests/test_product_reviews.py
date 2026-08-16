from __future__ import annotations

from decimal import Decimal

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import OrderStatus, ShopOrder, ShopOrderLine, ShopProduct
from apps.shopie.services.html_sanitize import sanitize_product_html
from apps.shopie.services.product_reviews import ProductReviewService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_workspace() -> tuple[Tenant, Business, Customer, ShopProduct]:
    owner = User.objects.create_user(
        email="review-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="review-tenant", display_name="Review Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Review Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="review-biz",
        business_name="Review Biz",
        display_name="Review Biz",
        selected_product="shopie",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="rev-cust-1",
        first_name="Ria",
        last_name="Shah",
        display_name="Ria Shah",
    )
    product = ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Pet Food",
        price=Decimal("199"),
        stock_on_hand=Decimal("10"),
    )
    return tenant, business, customer, product


def test_sanitize_product_html_strips_scripts() -> None:
    cleaned = sanitize_product_html(
        '<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>'
        '<a href="https://example.com">ok</a>'
    )
    assert "<script>" not in cleaned
    assert "javascript:" not in cleaned
    assert '<a href="https://example.com">ok</a>' in cleaned
    assert "Safe" in cleaned


@pytest.mark.django_db
def test_review_marks_verified_purchase(shop_workspace) -> None:
    tenant, business, customer, product = shop_workspace
    order = ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-1",
        status=OrderStatus.COMPLETED,
        total=Decimal("199"),
    )
    ShopOrderLine.objects.create(
        tenant=tenant,
        business=business,
        order=order,
        product=product,
        product_name=product.name,
        quantity=Decimal("1"),
        unit_price=product.price,
        line_total=product.price,
    )
    service = ProductReviewService()
    review = service.create_review(
        tenant=tenant,
        business=business,
        product=product,
        customer=customer,
        rating=5,
        title="Great pack",
        comment="Dogs loved it.",
    )
    assert review.verified_purchase is True
    assert review.title == "Great pack"
    updated = service.update_review(
        tenant=tenant,
        product=product,
        customer=customer,
        rating=4,
        title="Pretty good",
        comment="Would buy again.",
    )
    assert updated.rating == 4
    assert updated.title == "Pretty good"
    breakdown = service.rating_breakdown(tenant=tenant, business=business, product=product)
    assert breakdown["4"] == 1
    assert breakdown["5"] == 0
