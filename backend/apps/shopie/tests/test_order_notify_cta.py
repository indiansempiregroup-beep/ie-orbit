from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.customers.models import Customer
from apps.shopie.models import FulfillmentMode, OrderStatus, ShopOrder, ShopReturn, ShopShipment
from apps.shopie.services.order_notify import notify_online_order, notify_online_return, notify_shipment_milestone


@pytest.mark.django_db
def test_notify_online_order_includes_customer_and_staff_ctas(shop_business, customer: Customer, settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    settings.OPS_WEB_BASE_URL = "https://ops.ie-orbit.com"
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        order_number="SO-CTA-1",
        status=OrderStatus.PENDING,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("10.00"),
    )
    with (
        patch("apps.notifications.services.customer_direct.CustomerDirectNotifier.notify_customer") as customer_mock,
        patch("apps.notifications.services.staff_direct.StaffDirectNotifier.notify_managers") as staff_mock,
    ):
        customer_mock.return_value = {}
        staff_mock.return_value = {}
        notify_online_order(order=order, status=OrderStatus.PENDING)

    customer_kwargs = customer_mock.call_args.kwargs
    staff_kwargs = staff_mock.call_args.kwargs
    assert customer_kwargs["cta_url"] == f"https://ie-orbit.com/open/order/{order.id}"
    assert staff_kwargs["cta_url"] == f"https://ops.ie-orbit.com/shop/orders/{order.id}"


@pytest.mark.django_db
def test_notify_shipment_prefers_tracking_url(shop_business, customer: Customer, settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        order_number="SO-CTA-2",
        status=OrderStatus.CONFIRMED,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        currency="INR",
        total=Decimal("10.00"),
    )
    shipment = ShopShipment.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order=order,
        tracking_url="https://carrier.example/track/1",
        tracking_number="AWB1",
        carrier_label="Courier",
        status="in_transit",
    )
    with patch("apps.notifications.services.customer_direct.CustomerDirectNotifier.notify_customer") as customer_mock:
        customer_mock.return_value = {}
        notify_shipment_milestone(order=order, shipment=shipment, status="in_transit")

    kwargs = customer_mock.call_args.kwargs
    assert kwargs["cta_label"] == "Track shipment"
    assert kwargs["cta_url"] == "https://carrier.example/track/1"


@pytest.mark.django_db
def test_notify_online_return_includes_open_cta(shop_business, customer: Customer, settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        order_number="SO-CTA-3",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("10.00"),
    )
    shop_return = ShopReturn.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order=order,
        customer=customer,
        return_number="RT-CTA-1",
        refund_total=Decimal("10.00"),
        currency="INR",
        line_items=[],
    )
    with patch("apps.notifications.services.customer_direct.CustomerDirectNotifier.notify_customer") as customer_mock:
        customer_mock.return_value = {}
        notify_online_return(shop_return=shop_return, completed=False)

    kwargs = customer_mock.call_args.kwargs
    assert f"/open/return/{shop_return.id}" in kwargs["cta_url"]
    assert str(order.id) in kwargs["cta_url"]
