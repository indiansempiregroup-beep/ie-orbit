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
    BusinessSettings,
)
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.customers.services.loyalty import LoyaltyService
from apps.shopie.models import (
    CashAccountType,
    FulfillmentMode,
    OrderStatus,
    ShopBooksVoucher,
    ShopCashAccount,
    ShopProduct,
    VoucherStatus,
)
from apps.shopie.services.books import BooksService
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def shop_loyalty_ctx():
    owner = User.objects.create_user(
        email="shop-loyal-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shop-loyal-tenant",
        display_name="Shop Loyal Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Shop Loyal Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shop-loyal-biz",
        business_name="Shop Loyal Biz",
        display_name="Shop Loyal Biz",
        selected_product="shopie",
        currency="INR",
    )
    BusinessSettings.objects.create(
        tenant=tenant,
        business=business,
        loyalty_preferences={
            "enabled": True,
            "points_per_currency_unit": 10,
            "max_redeem_percent": 50,
            "min_redeem_points": 10,
            "earn_points_per_100": 10,
        },
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
        customer_code="cust-shop-1",
        first_name="Loyal",
        display_name="Loyal Shopper",
        email="loyal-shop@example.com",
    )
    product = ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Widget",
        price=Decimal("200.00"),
        tax_rate=Decimal("0"),
        gst_rate=Decimal("0"),
        stock_on_hand=Decimal("20"),
    )
    cash = ShopCashAccount.objects.create(
        tenant=tenant,
        business=business,
        name="Cash Drawer",
        account_type=CashAccountType.CASH,
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
    )
    return {
        "tenant": tenant,
        "business": business,
        "customer": customer,
        "product": product,
        "cash": cash,
        "owner": owner,
    }


def _seed_balance(ctx, points: int) -> None:
    loyalty = LoyaltyService()
    loyalty.ensure_account(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=ctx["customer"],
    )
    CustomerLoyaltyAccount.objects.filter(customer=ctx["customer"]).update(points_balance=points)


@pytest.mark.django_db
def test_online_order_redeem_earn_and_cancel_refunds(shop_loyalty_ctx):
    ctx = shop_loyalty_ctx
    _seed_balance(ctx, 200)
    orders = OrderService()
    order = orders.create_order(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=ctx["customer"],
        lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
        payment_method="cash",
        points_to_redeem=100,
        confirm=False,
    )
    assert Decimal(str(order.discount_total)) == Decimal("10.00")
    account = CustomerLoyaltyAccount.objects.get(customer=ctx["customer"])
    # 200 start - 100 redeem + earn on paid (190 * 10 / 100 = 19)
    assert account.points_balance == 200 - 100 + 19
    assert CustomerLoyaltyLedger.objects.filter(order_id=order.id, metadata__type="redeem").exists()
    assert CustomerLoyaltyLedger.objects.filter(order_id=order.id, metadata__type="earn").exists()

    orders.cancel_customer_order(
        tenant=ctx["tenant"], business=ctx["business"], order=order
    )
    account.refresh_from_db()
    assert account.points_balance == 200


@pytest.mark.django_db
def test_pos_paid_order_does_not_double_earn_on_books_voucher(shop_loyalty_ctx):
    ctx = shop_loyalty_ctx
    _seed_balance(ctx, 200)
    orders = OrderService()
    order = orders.create_order(
        tenant=ctx["tenant"],
        business=ctx["business"],
        customer=ctx["customer"],
        lines=[{"product_id": str(ctx["product"].id), "quantity": 1}],
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="cash",
        confirm=True,
        points_to_redeem=100,
    )
    assert order.status == OrderStatus.CONFIRMED
    assert Decimal(str(order.discount_total)) == Decimal("10.00")
    earns = list(
        CustomerLoyaltyLedger.objects.filter(customer=ctx["customer"], metadata__type="earn")
    )
    assert len(earns) == 1
    assert earns[0].order_id == order.id
    assert earns[0].voucher_id is None
    assert CustomerLoyaltyLedger.objects.filter(order_id=order.id, metadata__type="redeem").exists()
    voucher = ShopBooksVoucher.objects.filter(linked_order=order).first()
    assert voucher is not None
    assert not CustomerLoyaltyLedger.objects.filter(voucher_id=voucher.id).exists()
    account = CustomerLoyaltyAccount.objects.get(customer=ctx["customer"])
    assert account.points_balance == 200 - 100 + 19


def _sale_line(ctx) -> dict:
    return {"product_id": ctx["product"].id, "qty": "1", "rate": "200", "gst_rate": "0"}


@pytest.mark.django_db
def test_manual_books_sale_earn_redeem_and_void(shop_loyalty_ctx):
    ctx = shop_loyalty_ctx
    _seed_balance(ctx, 200)
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=ctx["tenant"],
        business=ctx["business"],
        data={
            "customer": ctx["customer"],
            "lines": [_sale_line(ctx)],
            "amount_paid": "190",
            "cash_account_id": ctx["cash"].id,
            "points_to_redeem": 100,
        },
    )
    assert Decimal(str(voucher.discount_total)) == Decimal("10.00")
    assert Decimal(str(voucher.total)) == Decimal("190.00")
    account = CustomerLoyaltyAccount.objects.get(customer=ctx["customer"])
    # 200 - 100 redeem + earn 19 on 190
    assert account.points_balance == 200 - 100 + 19
    redeemed = CustomerLoyaltyLedger.objects.filter(
        voucher_id=voucher.id, metadata__type="redeem"
    )
    earned = CustomerLoyaltyLedger.objects.filter(
        voucher_id=voucher.id, metadata__type="earn"
    )
    assert redeemed.exists()
    assert earned.exists()

    books.void_voucher(tenant=ctx["tenant"], business=ctx["business"], voucher=voucher)
    account.refresh_from_db()
    assert account.points_balance == 200
    voided = ShopBooksVoucher.objects.get(id=voucher.id)
    assert voided.status == VoucherStatus.VOID


@pytest.mark.django_db
def test_walk_in_books_sale_skips_loyalty(shop_loyalty_ctx):
    ctx = shop_loyalty_ctx
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=ctx["tenant"],
        business=ctx["business"],
        data={
            "lines": [_sale_line(ctx)],
            "amount_paid": "200",
            "cash_account_id": ctx["cash"].id,
        },
    )
    assert voucher.customer_id is None
    assert not CustomerLoyaltyLedger.objects.filter(voucher_id=voucher.id).exists()


@pytest.mark.django_db
def test_walk_in_cannot_redeem(shop_loyalty_ctx):
    ctx = shop_loyalty_ctx
    with pytest.raises(ValidationError):
        BooksService().create_sale_voucher(
            tenant=ctx["tenant"],
            business=ctx["business"],
            data={
                "lines": [_sale_line(ctx)],
                "points_to_redeem": 10,
            },
        )
