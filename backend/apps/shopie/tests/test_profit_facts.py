from __future__ import annotations

from decimal import Decimal

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ProfitFactKind,
    ShopSaleProfitFact,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.returns import ReturnService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def profit_ctx() -> tuple[Tenant, Business, Customer]:
    owner = User.objects.create_user(
        email="profit-facts@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="profit-facts-tenant",
        display_name="Profit Facts Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Profit Facts Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="profit-facts",
        business_name="Profit Facts Shop",
        display_name="Profit Facts Shop",
        selected_product="shopie",
        currency="INR",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="C-PF-1",
        display_name="Profit Customer",
        first_name="Profit",
        last_name="Customer",
        email="profit-customer@example.com",
    )
    return tenant, business, customer


@pytest.mark.django_db
def test_wac_blends_on_stock_receive(profit_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, _customer = profit_ctx
    catalog = CatalogService()
    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "WAC Tea",
            "price": "100.00",
            "purchase_price": "80.00",
            "stock_on_hand": "10",
        },
    )
    product.refresh_from_db()
    assert product.avg_cost == Decimal("80.00")
    assert product.purchase_price == Decimal("80.00")

    catalog.adjust_stock(
        tenant=tenant,
        business=business,
        product=product,
        quantity_delta=Decimal("10"),
        movement_type="receive",
        reason="Restock dearer",
        unit_cost=Decimal("85.00"),
    )
    product.refresh_from_db()
    assert product.purchase_price == Decimal("85.00")
    assert product.avg_cost == Decimal("82.50")
    assert product.stock_on_hand == Decimal("20.000")


@pytest.mark.django_db
def test_sale_cancel_and_return_update_profit_facts(
    profit_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = profit_ctx
    catalog = CatalogService()
    orders = OrderService()
    returns = ReturnService()

    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Profit Soap",
            "price": "100.00",
            "purchase_price": "80.00",
            "stock_on_hand": "20",
        },
    )

    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[{"product_id": product.id, "quantity": "2", "unit_price": "100.00"}],
        confirm=True,
    )
    assert order.status in {OrderStatus.CONFIRMED, OrderStatus.COMPLETED}
    line = order.lines.get()
    assert line.purchase_price_snapshot == Decimal("80.00")

    sale_facts = ShopSaleProfitFact.objects.filter(
        tenant=tenant, business=business, order=order, fact_kind=ProfitFactKind.SALE
    )
    assert sale_facts.count() == 1
    sale = sale_facts.get()
    assert sale.net_revenue == Decimal("200.00")
    assert sale.amount_paid == Decimal("200.00")
    assert sale.tax_collected == Decimal("0.00")
    assert sale.cogs == Decimal("160.00")
    assert sale.gross_profit == Decimal("40.00")
    assert sale.channel == "pos"

    # Partial return of 1 unit.
    shop_return = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(line.id), "quantity": "1"}],
        restock=True,
        complete=True,
    )
    assert shop_return.status == "completed"
    return_facts = ShopSaleProfitFact.objects.filter(
        tenant=tenant,
        business=business,
        order=order,
        fact_kind=ProfitFactKind.RETURN,
        source_id=shop_return.id,
    )
    assert return_facts.count() == 1
    ret = return_facts.get()
    assert ret.quantity == Decimal("-1.000")
    assert ret.cogs == Decimal("-80.00")
    assert ret.gross_profit == Decimal("-20.00")

    insights = catalog.product_profit_insights(
        tenant=tenant,
        business=business,
        date_from=order.created_at.date().isoformat(),
        date_to=order.created_at.date().isoformat(),
        channel="pos",
    )
    assert Decimal(insights["summary"]["gross_profit"]) == Decimal("20.00")
    assert Decimal(insights["summary"]["units_sold"]) == Decimal("1.000")
    assert Decimal(insights["summary"]["returns_profit"]) == Decimal("20.00")
    # Gross sold COGS (before return), matching the rupee-pie stock-cost slice.
    assert Decimal(insights["summary"]["sales_cogs"]) == Decimal("160.00")
    assert Decimal(insights["summary"]["sales_cogs_net"]) == Decimal("80.00")
    assert insights["summary"]["order_count"] == 1
    # RETURN stays on the original sale day so period history nets with SALE.
    assert ret.sold_at == sale.sold_at


@pytest.mark.django_db
def test_cancel_writes_reverse_profit_facts(
    profit_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = profit_ctx
    catalog = CatalogService()
    orders = OrderService()
    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Cancel Item",
            "price": "50.00",
            "purchase_price": "30.00",
            "stock_on_hand": "5",
        },
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        lines=[{"product_id": product.id, "quantity": "1", "unit_price": "50.00"}],
        confirm=True,
    )
    assert ShopSaleProfitFact.objects.filter(order=order, fact_kind=ProfitFactKind.SALE).count() == 1

    orders.transition(
        tenant=tenant,
        business=business,
        order=order,
        status=OrderStatus.CANCELLED,
        notify=False,
    )
    cancel_facts = ShopSaleProfitFact.objects.filter(order=order, fact_kind=ProfitFactKind.CANCEL)
    assert cancel_facts.count() == 1
    assert cancel_facts.get().gross_profit == Decimal("-20.00")

    insights = catalog.product_profit_insights(
        tenant=tenant,
        business=business,
        date_from=order.created_at.date().isoformat(),
        date_to=order.created_at.date().isoformat(),
    )
    assert Decimal(insights["summary"]["gross_profit"]) == Decimal("0.00")
    assert Decimal(insights["summary"]["cancels_profit"]) == Decimal("20.00")
    assert insights["summary"]["order_count"] == 0


@pytest.mark.django_db
def test_loss_maker_count_is_not_capped_at_list_size(
    profit_ctx: tuple[Tenant, Business, Customer],
) -> None:
    """Counter must count every below-cost product, not only the top-10 list."""
    tenant, business, customer = profit_ctx
    catalog = CatalogService()
    orders = OrderService()
    products = []
    for index in range(12):
        products.append(
            catalog.create_product(
                tenant=tenant,
                business=business,
                data={
                    "name": f"Loss Item {index}",
                    "price": "10.00",
                    "purchase_price": "20.00",
                    "stock_on_hand": "5",
                },
            )
        )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[
            {"product_id": product.id, "quantity": "1", "unit_price": "10.00"}
            for product in products
        ],
        confirm=True,
    )
    day = order.created_at.date().isoformat()
    insights = catalog.product_profit_insights(
        tenant=tenant,
        business=business,
        date_from=day,
        date_to=day,
        channel="pos",
        include_catalog=False,
    )
    assert insights["summary"]["loss_maker_count"] == 12
    assert len(insights["loss_makers"]) == 10


@pytest.mark.django_db
def test_sale_uses_avg_cost_snapshot_after_price_change(
    profit_ctx: tuple[Tenant, Business, Customer],
) -> None:
    tenant, business, customer = profit_ctx
    catalog = CatalogService()
    orders = OrderService()
    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Blend Snack",
            "price": "100.00",
            "purchase_price": "80.00",
            "stock_on_hand": "10",
        },
    )
    catalog.adjust_stock(
        tenant=tenant,
        business=business,
        product=product,
        quantity_delta=Decimal("10"),
        unit_cost=Decimal("85.00"),
        reason="Dearer lot",
    )
    product.refresh_from_db()
    assert product.avg_cost == Decimal("82.50")

    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[{"product_id": product.id, "quantity": "1", "unit_price": "100.00"}],
        confirm=True,
    )
    line = order.lines.get()
    assert line.purchase_price_snapshot == Decimal("82.50")
    fact = ShopSaleProfitFact.objects.get(order=order, fact_kind=ProfitFactKind.SALE)
    assert fact.unit_purchase_cost == Decimal("82.50")
    assert fact.cogs == Decimal("82.50")
    assert fact.gross_profit == Decimal("17.50")


@pytest.mark.django_db
def test_inclusive_gst_uses_shelf_profit_and_tracks_tax(
    profit_ctx: tuple[Tenant, Business, Customer],
) -> None:
    """Sell 100 incl. 18% GST, cost 80 → profit 20; GST collected 15.25."""
    tenant, business, customer = profit_ctx
    catalog = CatalogService()
    orders = OrderService()
    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Inclusive Soap",
            "price": "100.00",
            "purchase_price": "80.00",
            "tax_rate": "18",
            "stock_on_hand": "10",
            "metadata": {"tax_inclusive": True},
        },
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[
            {
                "product_id": product.id,
                "quantity": "1",
                "unit_price": "100.00",
                "tax_rate": "18",
                "tax_inclusive": True,
            }
        ],
        confirm=True,
    )
    line = order.lines.get()
    assert line.line_total == Decimal("100.00")
    assert line.line_tax == Decimal("15.25")
    assert line.line_subtotal == Decimal("84.75")

    sale = ShopSaleProfitFact.objects.get(order=order, fact_kind=ProfitFactKind.SALE)
    assert sale.net_revenue == Decimal("100.00")
    assert sale.amount_paid == Decimal("100.00")
    assert sale.tax_collected == Decimal("15.25")
    assert sale.cogs == Decimal("80.00")
    assert sale.gross_profit == Decimal("20.00")

    insights = catalog.product_profit_insights(
        tenant=tenant,
        business=business,
        date_from=order.created_at.date().isoformat(),
        date_to=order.created_at.date().isoformat(),
        channel="pos",
    )
    assert Decimal(insights["summary"]["gross_profit"]) == Decimal("20.00")
    assert Decimal(insights["summary"]["sales_revenue"]) == Decimal("100.00")
    assert Decimal(insights["summary"]["gst_collected"]) == Decimal("15.25")
    assert Decimal(insights["summary"]["gst_to_remit"]) == Decimal("15.25")
