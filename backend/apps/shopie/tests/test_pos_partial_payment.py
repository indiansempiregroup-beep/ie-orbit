from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.customers.models import Customer, CustomerAddress
from apps.customers.services.borrow import BorrowService
from apps.shopie.models import FulfillmentMode, OrderStatus, ShopBooksVoucher, ShopProduct
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def pos_partial_ctx():
    owner = User.objects.create_user(
        email="pos-partial-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="pos-partial-tenant",
        display_name="POS Partial Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="POS Partial Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="pos-partial-biz",
        business_name="POS Partial Biz",
        display_name="POS Partial Biz",
        selected_product="shopie",
        currency="INR",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="shopie-starter",
        defaults={"name": "Orbit Mart Starter", "is_public": True},
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
        customer_code="cust-partial-1",
        first_name="Partial",
        display_name="Partial Pay",
    )
    product = ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Bag",
        price=Decimal("200.00"),
        tax_rate=Decimal("0"),
        gst_rate=Decimal("0"),
        stock_on_hand=Decimal("20"),
    )
    return {
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "product": product,
    }


@pytest.mark.django_db
def test_pos_partial_cash_charges_borrow_for_balance(pos_partial_ctx):
    ctx = pos_partial_ctx
    order = OrderService().create_order(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=ctx["customer"],
        lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        amount_paid="50.00",
        confirm=True,
    )
    assert order.status == OrderStatus.CONFIRMED
    pos = order.metadata["pos"]
    assert pos["payment_status"] == "partially_paid"
    assert Decimal(str(pos["amount_paid"])) == Decimal("50.00")
    assert Decimal(str(pos["amount_due"])) == Decimal("150.00")

    balance = BorrowService().get_balance(
        tenant=ctx["tenant"], business=ctx["business"], customer=ctx["customer"]
    )
    assert Decimal(balance["balance_due"]) == Decimal("150.00")

    voucher = ShopBooksVoucher.objects.filter(linked_order=order).first()
    assert voucher is not None
    assert Decimal(str(voucher.amount_paid)) == Decimal("50.00")


@pytest.mark.django_db
def test_pos_partial_requires_customer(pos_partial_ctx):
    ctx = pos_partial_ctx
    with pytest.raises(ValidationError) as exc:
        OrderService().create_order(
            tenant=ctx["tenant"],
            business=ctx["business"],
            customer=None,
            lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
            fulfillment_mode=FulfillmentMode.POS,
            payment_method="upi",
            amount_paid="20.00",
            confirm=True,
        )
    assert "customer_id" in exc.value.message_dict


@pytest.mark.django_db
def test_pos_full_cash_still_marks_paid(pos_partial_ctx):
    ctx = pos_partial_ctx
    order = OrderService().create_order(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=None,
        lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
    )
    pos = order.metadata["pos"]
    assert pos["payment_status"] == "paid"
    assert Decimal(str(pos["amount_paid"])) == Decimal("200.00")
    assert Decimal(str(pos["amount_due"])) == Decimal("0.00")


@pytest.mark.django_db
def test_pos_uses_customer_default_address(pos_partial_ctx):
    ctx = pos_partial_ctx
    CustomerAddress.objects.create(
        tenant=ctx["tenant"],
        customer=ctx["customer"],
        line1="12 Shop Lane",
        line2="Near Temple",
        city="Nashik",
        state="Maharashtra",
        postal_code="422001",
        country="India",
        is_default=True,
    )
    CustomerAddress.objects.create(
        tenant=ctx["tenant"],
        customer=ctx["customer"],
        line1="99 Online Map Pin Road",
        city="Pune",
        state="Maharashtra",
        postal_code="411001",
        is_default=False,
    )
    order = OrderService().create_order(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=ctx["customer"],
        lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
        # Online-style payload should be ignored for POS.
        delivery_address="Should Not Use Checkout Address",
        delivery_city="Mumbai",
    )
    assert order.delivery_address == "12 Shop Lane"
    assert order.metadata.get("delivery_address_line2") == "Near Temple"
    assert order.metadata.get("delivery_city") == "Nashik"
    assert order.metadata.get("delivery_state") == "Maharashtra"
    assert order.metadata.get("delivery_postal_code") == "422001"
