from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    BarcodeType,
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    ShopDeliveryZone,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.delivery import DeliveryService
from apps.shopie.services.merchant_payments import MerchantPaymentService
from apps.shopie.services.orders import OrderService
from apps.tenancy.models import Tenant


def _product(tenant: Tenant, business: Business):
    return CatalogService().create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "COD Test Item",
            "price": "150.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
        },
        barcodes=[{"code": "COD-ITEM-1", "barcode_type": BarcodeType.EAN13}],
    )


@pytest.mark.django_db
def test_cod_disabled_rejects_cash_online_order(
    shop_business: Business,
    customer: Customer,
) -> None:
    tenant = shop_business.tenant
    product = _product(tenant, shop_business)
    payments = MerchantPaymentService()
    payments.update_cod_enabled(business=shop_business, cod_enabled=False)
    orders = OrderService()

    with pytest.raises(ValidationError, match="Cash on delivery"):
        orders.create_order(
            tenant=tenant,
            business=shop_business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.PICKUP,
            payment_method="cash",
            lines=[{"product_id": str(product.id), "quantity": 1}],
            confirm=True,
        )


@pytest.mark.django_db
def test_payment_settings_exposes_cod_enabled(shop_business: Business) -> None:
    service = MerchantPaymentService()
    service.update_cod_enabled(business=shop_business, cod_enabled=False)
    payload = service.public_settings(business=shop_business)
    assert payload["cod_enabled"] is False

    service.update_cod_enabled(business=shop_business, cod_enabled=True)
    payload = service.public_settings(business=shop_business)
    assert payload["cod_enabled"] is True


@pytest.mark.django_db
def test_delivery_settings_exposes_cod_allowed_for_instant(
    shop_business: Business,
) -> None:
    tenant = shop_business.tenant
    service = DeliveryService()
    settings = service.update_settings(
        tenant=tenant,
        business=shop_business,
        enabled=False,
        incoming={"provider": "mock"},
        cod_allowed_for_instant_delivery=False,
    )
    payload = service.public_settings(settings)
    assert payload["cod_allowed_for_instant_delivery"] is False

    settings = service.update_settings(
        tenant=tenant,
        business=shop_business,
        enabled=False,
        incoming={"provider": "mock"},
        cod_allowed_for_instant_delivery=True,
    )
    payload = service.public_settings(settings)
    assert payload["cod_allowed_for_instant_delivery"] is True


@pytest.mark.django_db
def test_cod_disabled_for_instant_rejects_cash_instant_order(
    shop_business: Business,
    customer: Customer,
) -> None:
    tenant = shop_business.tenant
    product = _product(tenant, shop_business)
    shop_business.address_line1 = "1 Shop Road"
    shop_business.city = "Mumbai"
    shop_business.postal_code = "400001"
    shop_business.latitude = Decimal("19.076000")
    shop_business.longitude = Decimal("72.877700")
    shop_business.save(
        update_fields=[
            "address_line1",
            "city",
            "postal_code",
            "latitude",
            "longitude",
            "updated_at",
        ]
    )
    ShopDeliveryZone.objects.get_or_create(
        tenant=tenant,
        business=shop_business,
        name="COD instant zone",
        defaults={"instant_delivery_enabled": True},
    )
    DeliveryService().update_settings(
        tenant=tenant,
        business=shop_business,
        enabled=True,
        incoming={"provider": "mock", "charge_bearer": "customer"},
        cod_allowed_for_instant_delivery=False,
    )
    orders = OrderService()

    with pytest.raises(ValidationError, match="instant delivery"):
        orders.create_order(
            tenant=tenant,
            business=shop_business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.DELIVERY,
            delivery_method="instant",
            delivery_address="2 Customer Road",
            delivery_city="Mumbai",
            delivery_postal_code="400002",
            delivery_latitude=Decimal("19.086000"),
            delivery_longitude=Decimal("72.887700"),
            payment_method="cash",
            lines=[{"product_id": str(product.id), "quantity": 1}],
            confirm=True,
        )

    # Standard delivery can still use COD when the global COD toggle is on.
    order = orders.create_order(
        tenant=tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        delivery_method="standard",
        delivery_address="2 Customer Road",
        delivery_city="Mumbai",
        delivery_postal_code="400002",
        payment_method="cash",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    assert (order.metadata.get("pos") or {}).get("payment_method") == "cash"


@pytest.mark.django_db
def test_completed_delivery_cash_order_auto_marks_paid(
    shop_business: Business,
    customer: Customer,
) -> None:
    tenant = shop_business.tenant
    product = _product(tenant, shop_business)
    orders = OrderService()
    order = orders.create_order(
        tenant=tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        payment_method="cash",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    pos = order.metadata.get("pos") or {}
    assert pos.get("payment_status") == "due"

    order = orders.transition(
        tenant=tenant,
        business=shop_business,
        order=order,
        status=OrderStatus.COMPLETED,
    )
    pos = order.metadata.get("pos") or {}
    assert pos.get("payment_status") == "paid"
    assert pos.get("amount_paid") == str(order.total)
