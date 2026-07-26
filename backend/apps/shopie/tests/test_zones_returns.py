from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    BarcodeType,
    FulfillmentMode,
    OrderStatus,
    ProductStatus,
    VerticalPack,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.returns import ReturnService
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_ctx() -> tuple[Tenant, Business, Customer]:
    owner = User.objects.create_user(
        email="shopie-ext@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-ext-tenant",
        display_name="ShopIE Ext Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="ShopIE Ext Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-ext",
        business_name="ShopIE Ext",
        display_name="ShopIE Ext",
        selected_product="shopie",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="C-EXT-1",
        display_name="Ext Customer",
        first_name="Ext",
        last_name="Customer",
        email="ext-customer@example.com",
    )
    return tenant, business, customer


@pytest.mark.django_db
def test_delivery_zone_match_and_order_gate(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    zones = DeliveryZoneService()
    orders = OrderService()
    catalog = CatalogService()

    zones.create_zone(
        tenant=tenant,
        business=business,
        data={
            "name": "Nashik",
            "cities": ["Nashik"],
            "postal_prefixes": ["422"],
            "same_day": True,
            "fee": "40.00",
        },
    )
    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Pet Food",
            "price": "100.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "10",
        },
        barcodes=[{"code": "RFID-1", "barcode_type": BarcodeType.RFID_EPC}],
    )

    with pytest.raises(ValidationError):
        orders.create_order(
            tenant=tenant,
            business=business,
            customer=customer,
            fulfillment_mode=FulfillmentMode.DELIVERY,
            delivery_city="Pune",
            delivery_postal_code="411001",
            lines=[{"product_id": str(product.id), "quantity": 1}],
            confirm=True,
        )

    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.DELIVERY,
        delivery_city="Nashik",
        delivery_postal_code="422001",
        delivery_address="Gangapur Road",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    assert order.status == OrderStatus.CONFIRMED
    assert order.metadata.get("delivery_zone_name") == "Nashik"


@pytest.mark.django_db
def test_return_restock_and_credit(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    catalog = CatalogService()
    orders = OrderService()
    returns = ReturnService()

    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Shampoo",
            "price": "50.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
        },
        barcodes=[{"code": "890111", "barcode_type": BarcodeType.MANUFACTURER}],
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[{"product_id": str(product.id), "quantity": 2}],
        confirm=True,
    )
    product.refresh_from_db()
    stock_after_sale = product.stock_on_hand

    shop_return = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        reason="Damaged box",
        restock=True,
        complete=True,
    )
    product.refresh_from_db()
    assert shop_return.credit_invoice_id is not None
    assert shop_return.refund_total == Decimal("50.00")
    assert product.stock_on_hand == stock_after_sale + Decimal("1")


@pytest.mark.django_db
def test_return_cannot_exceed_remaining_qty(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    catalog = CatalogService()
    orders = OrderService()
    returns = ReturnService()

    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Soap",
            "price": "20.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "10",
        },
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        lines=[{"product_id": str(product.id), "quantity": 2}],
        confirm=True,
    )
    line_id = str(order.lines.first().id)
    returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": line_id, "quantity": 1}],
        complete=True,
    )
    with pytest.raises(ValidationError):
        returns.create_return(
            tenant=tenant,
            business=business,
            order=order,
            lines=[{"order_line_id": line_id, "quantity": 2}],
            complete=True,
        )


@pytest.mark.django_db
def test_borrow_return_reduces_due_and_balance(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    catalog = CatalogService()
    orders = OrderService()
    returns = ReturnService()
    from apps.customers.services.borrow import BorrowService

    product = catalog.create_product(
        tenant=tenant,
        business=business,
        data={
            "name": "Oil",
            "price": "100.00",
            "tax_rate": "0",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "8",
        },
    )
    order = orders.create_order(
        tenant=tenant,
        business=business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.POS,
        payment_method="borrow",
        lines=[{"product_id": str(product.id), "quantity": 2}],
        confirm=True,
    )
    product.refresh_from_db()
    stock_after_sale = product.stock_on_hand
    balance_before = BorrowService().get_balance(
        tenant=tenant, business=business, customer=customer
    )
    assert Decimal(balance_before["balance_due"]) == Decimal("200.00")
    assert Decimal(str(order.metadata["pos"]["amount_due"])) == Decimal("200.00")

    shop_return = returns.create_return(
        tenant=tenant,
        business=business,
        order=order,
        lines=[{"order_line_id": str(order.lines.first().id), "quantity": 1}],
        restock=True,
        complete=True,
    )
    order.refresh_from_db()
    product.refresh_from_db()
    balance_after = BorrowService().get_balance(
        tenant=tenant, business=business, customer=customer
    )
    assert shop_return.refund_total == Decimal("100.00")
    assert product.stock_on_hand == stock_after_sale + Decimal("1")
    assert Decimal(str(order.metadata["pos"]["amount_due"])) == Decimal("100.00")
    assert Decimal(balance_after["balance_due"]) == Decimal("100.00")


@pytest.mark.django_db
def test_pets_pack_gate(shop_ctx: tuple[Tenant, Business, Customer]) -> None:
    tenant, business, customer = shop_ctx
    pets = PetsService()
    with pytest.raises(ValidationError):
        pets.create_pet(
            tenant=tenant,
            business=business,
            customer=customer,
            data={"name": "Bruno"},
        )
    pets.set_pack_enabled(
        tenant=tenant, business=business, pack=VerticalPack.PETS, enabled=True
    )
    pet = pets.create_pet(
        tenant=tenant,
        business=business,
        customer=customer,
        data={"name": "Bruno", "species": "Dog"},
    )
    assert pet.name == "Bruno"
