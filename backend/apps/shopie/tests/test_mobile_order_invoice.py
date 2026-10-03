from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.shopie.models import BarcodeType, FulfillmentMode, ProductStatus, ShopBooksVoucher
from apps.shopie.services.books import BooksService
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService


@pytest.mark.django_db
def test_mobile_order_invoice_available_for_owner(shop_business, customer, cash_account):
    user = User.objects.create_user(
        email="buyer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        first_name="Buyer",
    )
    customer.email = user.email
    customer.save(update_fields=["email", "updated_at"])

    product = CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Invoice Item",
            "price": "100.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "10",
            "gst_rate": "18",
        },
        barcodes=[{"code": "INV-ITEM-1", "barcode_type": BarcodeType.EAN13}],
    )
    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        payment_method="upi",
        payment_proof_url="https://cdn.example.com/upi-proof.png",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    voucher = BooksService().create_sale_from_order(
        tenant=shop_business.tenant,
        business=shop_business,
        order=order,
        cash_account_id=cash_account.id,
    )
    assert isinstance(voucher, ShopBooksVoucher)

    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get(
        f"/api/v1/mobile/shop/orders/{order.id}/invoice",
        {
            "tenant_slug": shop_business.tenant.slug,
            "business_code": shop_business.business_code,
        },
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["available"] is True
    assert body["invoice_number"] == voucher.voucher_number
    assert body["voucher_id"] == str(voucher.id)
    assert "format=html" in body["view_url"]
    assert "format=pdf" in body["pdf_url"]
    assert body["message"]

    html = client.get(f"/api/v1/public/shop-docs/{body['token']}", {"format": "html"})
    assert html.status_code == 200
    assert b"TAX INVOICE" in html.content
    assert voucher.voucher_number.encode() in html.content


@pytest.mark.django_db
def test_mobile_order_invoice_unavailable_without_voucher(shop_business, customer):
    user = User.objects.create_user(
        email="buyer2@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    customer.email = user.email
    customer.save(update_fields=["email", "updated_at"])

    product = CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Pending Invoice Item",
            "price": "50.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
        },
        barcodes=[{"code": "INV-ITEM-2", "barcode_type": BarcodeType.EAN13}],
    )
    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        payment_method="upi",
        payment_proof_url="https://cdn.example.com/upi-proof.png",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=False,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get(
        f"/api/v1/mobile/shop/orders/{order.id}/invoice",
        {
            "tenant_slug": shop_business.tenant.slug,
            "business_code": shop_business.business_code,
        },
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["available"] is False
    assert "reason" in body


@pytest.mark.django_db
def test_mobile_order_invoice_hidden_from_other_customer(shop_business, customer, cash_account):
    owner = User.objects.create_user(
        email="owner-buyer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    stranger = User.objects.create_user(
        email="stranger@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    customer.email = owner.email
    customer.save(update_fields=["email", "updated_at"])

    product = CatalogService().create_product(
        tenant=shop_business.tenant,
        business=shop_business,
        data={
            "name": "Private Invoice Item",
            "price": "80.00",
            "status": ProductStatus.ACTIVE,
            "stock_on_hand": "5",
            "gst_rate": "18",
        },
        barcodes=[{"code": "INV-ITEM-3", "barcode_type": BarcodeType.EAN13}],
    )
    order = OrderService().create_order(
        tenant=shop_business.tenant,
        business=shop_business,
        customer=customer,
        fulfillment_mode=FulfillmentMode.PICKUP,
        payment_method="upi",
        payment_proof_url="https://cdn.example.com/upi-proof.png",
        lines=[{"product_id": str(product.id), "quantity": 1}],
        confirm=True,
    )
    BooksService().create_sale_from_order(
        tenant=shop_business.tenant,
        business=shop_business,
        order=order,
        cash_account_id=cash_account.id,
    )

    client = APIClient()
    client.force_authenticate(user=stranger)
    res = client.get(
        f"/api/v1/mobile/shop/orders/{order.id}/invoice",
        {
            "tenant_slug": shop_business.tenant.slug,
            "business_code": shop_business.business_code,
        },
    )
    assert res.status_code == 404
