from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import FulfillmentMode, OrderStatus, ProductStatus
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.coupons import CouponService
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_ctx() -> tuple[Tenant, Business, Customer]:
    owner = User.objects.create_user(
        email="shopie-coupon@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-coupon-tenant",
        display_name="ShopIE Coupon Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Coupon Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-coupon",
        business_name="ShopIE Coupon",
        display_name="ShopIE Coupon",
        selected_product="shopie",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="C-CPN-1",
        display_name="Coupon Customer",
        first_name="Coupon",
        last_name="Customer",
        email="coupon-customer@example.com",
    )
    return tenant, business, customer


def _product(tenant: Tenant, business: Business, *, price: str = "200.00"):
    return CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Treats",
            "price": price,
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "20",
        },
    )


@pytest.mark.django_db
def test_percent_coupon_applies_to_online_order(
    shop_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = shop_ctx
    coupons = CouponService()
    orders = OrderService()
    product = _product(tenant, business)

    coupon = coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "save10",
            "name": "Save 10%",
            "discount_type": "percent",
            "discount_value": "10",
        },
    )
    assert coupon.code == "SAVE10"

    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": str(product.id), "quantity": 1}],
        coupon_code="save10",
    )
    assert order.coupon_redemption.coupon_id == coupon.id
    assert Decimal(str(order.discount_total)) == Decimal("20.00")
    assert Decimal(str(order.total)) == Decimal("180.00")
    assert order.metadata["coupon"]["code"] == "SAVE10"
    coupon.refresh_from_db()
    assert coupon.redemption_count == 1


@pytest.mark.django_db
def test_coupon_rejects_pos_and_min_order(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    coupons = CouponService()
    orders = OrderService()
    product = _product(tenant, business, price="50.00")
    coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "BIG50",
            "name": "Fifty off",
            "discount_type": "amount",
            "discount_value": "50",
            "min_order_total": "100",
        },
    )

    with pytest.raises(ValidationError) as pos_exc:
        orders.create_order(
            tenant=tenant,
            business=business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.POS,
            lines=[{"product_id": str(product.id), "quantity": 1}],
            coupon_code="BIG50",
            confirm=True,
        )
    assert "online" in str(pos_exc.value).lower()

    with pytest.raises(ValidationError) as min_exc:
        orders.create_order(
            tenant=tenant,
            business=business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.PICKUP,
            lines=[{"product_id": str(product.id), "quantity": 1}],
            coupon_code="BIG50",
        )
    assert "at least" in str(min_exc.value).lower()


@pytest.mark.django_db
def test_percent_coupon_respects_max_cap_and_cancel_releases(
    shop_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = shop_ctx
    coupons = CouponService()
    orders = OrderService()
    product = _product(tenant, business, price="1000.00")
    coupon = coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "CAP20",
            "name": "20% capped",
            "discount_type": "percent",
            "discount_value": "20",
            "max_discount_amount": "50",
            "max_redemptions_per_customer": 1,
        },
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": str(product.id), "quantity": 1}],
        coupon_code="CAP20",
    )
    assert Decimal(str(order.discount_total)) == Decimal("50.00")

    with pytest.raises(ValidationError):
        orders.create_order(
            tenant=tenant,
            business=business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.PICKUP,
            lines=[{"product_id": str(product.id), "quantity": 1}],
            coupon_code="CAP20",
        )

    orders.cancel_customer_order(tenant=tenant, business=business, order=order)
    coupon.refresh_from_db()
    assert coupon.redemption_count == 0
    assert not coupon.redemptions.exists()

    reused = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": str(product.id), "quantity": 1}],
        coupon_code="CAP20",
    )
    assert reused.status == OrderStatus.PENDING
    coupon.refresh_from_db()
    assert coupon.redemption_count == 1


@pytest.mark.django_db
def test_list_for_cart_shows_applicable_and_locked_offers(
    shop_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = shop_ctx
    coupons = CouponService()
    product = _product(tenant, business, price="80.00")
    coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "SAVE10",
            "name": "Save 10%",
            "discount_type": "percent",
            "discount_value": "10",
        },
    )
    coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "BIG50",
            "name": "Fifty off",
            "discount_type": "amount",
            "discount_value": "50",
            "min_order_total": "200",
        },
    )
    coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "HIDDEN",
            "name": "Inactive",
            "discount_type": "amount",
            "discount_value": "5",
            "is_active": False,
        },
    )

    offers = coupons.list_for_cart(
        tenant=tenant,
        business=business,
        fulfillment_mode=FulfillmentMode.PICKUP,
        customer=customer,
        lines=[{"product_id": str(product.id), "quantity": 1}],
    )
    by_code = {row["code"]: row for row in offers}
    assert "HIDDEN" not in by_code
    assert by_code["SAVE10"]["applicable"] is True
    assert Decimal(str(by_code["SAVE10"]["discount_amount"])) == Decimal("8.00")
    assert by_code["BIG50"]["applicable"] is False
    assert Decimal(str(by_code["BIG50"]["remaining_to_unlock"])) == Decimal("120.00")
    assert offers[0]["code"] == "SAVE10"


@pytest.mark.django_db
def test_percent_coupon_uses_shelf_price_when_tax_inclusive(
    shop_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = shop_ctx
    coupons = CouponService()
    orders = OrderService()
    product = CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "GST Treats",
            "price": "118.00",
            "tax_rate": "18",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "20",
            "metadata": {"tax_inclusive": True},
        },
    )
    coupons.create_coupon(
        tenant=tenant,
        business=business,
        data={
            "code": "SAVE10",
            "name": "Save 10%",
            "discount_type": "percent",
            "discount_value": "10",
        },
    )
    preview = coupons.preview(
        tenant=tenant,
        business=business,
        code="SAVE10",
        fulfillment_mode=FulfillmentMode.PICKUP,
        customer=customer,
        lines=[{"product_id": str(product.id), "quantity": 1}],
    )
    assert Decimal(str(preview["discount_amount"])) == Decimal("11.80")

    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": str(product.id), "quantity": 1}],
        coupon_code="SAVE10",
    )
    assert Decimal(str(order.metadata["coupon"]["discount_amount"])) == Decimal("11.80")
    assert Decimal(str(order.total)) == Decimal("106.20")
