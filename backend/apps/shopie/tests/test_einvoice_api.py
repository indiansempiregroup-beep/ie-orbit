from __future__ import annotations

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import ShopBooksVoucher, ShopProduct
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def owner() -> User:
    return User.objects.create_user(
        email="gst-api-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


@pytest.fixture
def gst_workspace(owner: User) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.create(
        slug="gst-api-tenant", display_name="GST API Tenant", owner=owner
    )
    organization = Organization.objects.create(tenant=tenant, name="GST API Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="gst-api-biz",
        business_name="GST API Biz",
        display_name="GST API Biz",
        selected_product="shopie",
        gst_tax_number="27AAAPL1234C1ZV",
        state="Maharashtra",
        address_line1="123 Industrial Estate",
        city="Mumbai",
        postal_code="400001",
    )
    return tenant, business


@pytest.fixture
def product(gst_workspace: tuple[Tenant, Business]) -> ShopProduct:
    tenant, business = gst_workspace
    return ShopProduct.objects.create(
        tenant=tenant,
        business=business,
        name="Widget",
        price=Decimal("1000"),
        gst_rate=Decimal("18"),
        hsn_sac="8471",
        stock_on_hand=Decimal("100"),
    )


@pytest.fixture
def b2b_customer(gst_workspace: tuple[Tenant, Business]) -> Customer:
    tenant, business = gst_workspace
    return Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="gst-cust-1",
        first_name="Acme",
        last_name="Traders",
        display_name="Acme Traders",
        gstin="29AABCU9603R1ZM",
        billing_state="Karnataka",
    )


def authenticate(api_client: APIClient, owner: User, tenant: Tenant) -> None:
    response = api_client.post(
        reverse("auth-login"),
        {"email": owner.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=str(tenant.id),
    )


def create_sale_voucher(
    api_client: APIClient,
    *,
    business: Business,
    product: ShopProduct,
    customer: Customer | None = None,
    metadata: dict | None = None,
) -> dict:
    payload: dict = {
        "voucher_type": "sale",
        "business_id": str(business.id),
        "is_interstate": True,
        "place_of_supply": "Karnataka",
        "lines": [{"product_id": str(product.id), "qty": "2", "rate": "1000", "gst_rate": "18"}],
    }
    if customer is not None:
        payload["customer_id"] = str(customer.id)
    if metadata:
        payload["metadata"] = metadata
    response = api_client.post(reverse("shop-books-voucher-list-create"), payload, format="json")
    assert response.status_code == 201, response.content
    return response.json()["data"]


@pytest.mark.django_db
def test_ops_mobile_gst_compliance_http_flow(
    api_client: APIClient,
    owner: User,
    gst_workspace: tuple[Tenant, Business],
    product: ShopProduct,
    b2b_customer: Customer,
) -> None:
    tenant, business = gst_workspace
    authenticate(api_client, owner, tenant)

    settings_url = reverse("shop-books-compliance-settings")
    loaded = api_client.get(settings_url, {"business_id": str(business.id)})
    assert loaded.status_code == 200, loaded.content
    body = loaded.json()["data"]
    assert body["einvoice_enabled"] is False
    assert body["eway_enabled"] is False
    assert (body.get("gst_compliance") or {}).get("provider", "mock") in {"mock", ""}

    voucher = create_sale_voucher(api_client, business=business, product=product, customer=b2b_customer)
    voucher_id = voucher["id"]
    assert voucher["status"] == "confirmed"

    einvoice_url = reverse("shop-books-voucher-einvoice", kwargs={"voucher_id": voucher_id})
    missing = api_client.get(einvoice_url)
    assert missing.status_code == 404

    blocked = api_client.post(einvoice_url, {}, format="json")
    assert blocked.status_code == 422
    assert "einvoice_enabled" in str(blocked.json())

    saved = api_client.patch(
        settings_url,
        {
            "business_id": str(business.id),
            "einvoice_enabled": True,
            "eway_enabled": True,
            "gst_compliance": {
                "provider": "mock",
                "seller_legal_name": "GST API Biz Pvt Ltd",
                "seller_trade_name": "GST API Biz",
                "seller_addr1": "123 Industrial Estate",
                "seller_loc": "Mumbai",
                "seller_pin": "400001",
                "seller_state_code": "27",
            },
        },
        format="json",
    )
    assert saved.status_code == 200, saved.content
    saved_data = saved.json()["data"]
    assert saved_data["einvoice_enabled"] is True
    assert saved_data["eway_enabled"] is True
    assert saved_data["gst_compliance"]["provider"] == "mock"
    assert saved_data["gst_compliance"]["seller_legal_name"] == "GST API Biz Pvt Ltd"

    generated = api_client.post(einvoice_url, {}, format="json")
    assert generated.status_code == 201, generated.content
    einvoice = generated.json()["data"]
    assert einvoice["status"] == "generated"
    assert einvoice["irn"]
    assert einvoice["ack_no"]
    assert einvoice["signed_qr"]

    fetched = api_client.get(einvoice_url)
    assert fetched.status_code == 200
    assert fetched.json()["data"]["irn"] == einvoice["irn"]

    eway_url = reverse("shop-books-voucher-eway", kwargs={"voucher_id": voucher_id})
    eway_created = api_client.post(
        eway_url,
        {
            "vehicle_no": "MH12AB1234",
            "transport_mode": "1",
            "distance_km": 850,
            "transporter_name": "Speedy Logistics",
            "from_place": "Mumbai",
            "from_state_code": "Maharashtra",
            "to_place": "Bengaluru",
            "to_state_code": "Karnataka",
        },
        format="json",
    )
    assert eway_created.status_code == 201, eway_created.content
    eway = eway_created.json()["data"]
    assert eway["status"] == "generated"
    assert eway["ewb_no"]
    assert eway["einvoice"] == einvoice["id"]

    listed = api_client.get(
        reverse("shop-books-eway-list"),
        {"business_id": str(business.id), "voucher_id": voucher_id},
    )
    assert listed.status_code == 200, listed.content
    rows = listed.json()["data"]
    assert isinstance(rows, list)
    assert len(rows) == 1
    assert rows[0]["ewb_no"] == eway["ewb_no"]

    cancelled_eway = api_client.post(
        reverse("shop-books-eway-cancel", kwargs={"eway_id": eway["id"]}),
        {"reason": "Vehicle breakdown"},
        format="json",
    )
    assert cancelled_eway.status_code == 200, cancelled_eway.content
    assert cancelled_eway.json()["data"]["status"] == "cancelled"

    cancelled_irn = api_client.post(
        reverse("shop-books-voucher-einvoice-cancel", kwargs={"voucher_id": voucher_id}),
        {"reason": "Data entry mistake"},
        format="json",
    )
    assert cancelled_irn.status_code == 200, cancelled_irn.content
    assert cancelled_irn.json()["data"]["status"] == "cancelled"


@pytest.mark.django_db
def test_pos_walkin_gstin_can_generate_einvoice(
    api_client: APIClient,
    owner: User,
    gst_workspace: tuple[Tenant, Business],
    product: ShopProduct,
) -> None:
    tenant, business = gst_workspace
    authenticate(api_client, owner, tenant)

    api_client.patch(
        reverse("shop-books-compliance-settings"),
        {"business_id": str(business.id), "einvoice_enabled": True, "eway_enabled": True},
        format="json",
    )

    order = api_client.post(
        reverse("shop-order-list-create"),
        {
            "business_id": str(business.id),
            "fulfillment_mode": "pos",
            "confirm": True,
            "payment_method": "cash",
            "customer_gstin": "29AABCU9603R1ZM",
            "lines": [{"product_id": str(product.id), "quantity": "1"}],
        },
        format="json",
    )
    assert order.status_code == 201, order.content

    vouchers = ShopBooksVoucher.objects.filter(business=business, voucher_type="sale")
    assert vouchers.count() == 1
    voucher = vouchers.get()
    assert voucher.metadata.get("customer_gstin") == "29AABCU9603R1ZM"

    generated = api_client.post(
        reverse("shop-books-voucher-einvoice", kwargs={"voucher_id": voucher.id}),
        {},
        format="json",
    )
    assert generated.status_code == 201, generated.content
    assert generated.json()["data"]["status"] == "generated"


@pytest.mark.django_db
def test_b2c_einvoice_requires_allow_b2c_flag(
    api_client: APIClient,
    owner: User,
    gst_workspace: tuple[Tenant, Business],
    product: ShopProduct,
) -> None:
    tenant, business = gst_workspace
    authenticate(api_client, owner, tenant)
    api_client.patch(
        reverse("shop-books-compliance-settings"),
        {"business_id": str(business.id), "einvoice_enabled": True},
        format="json",
    )
    voucher = create_sale_voucher(api_client, business=business, product=product)
    einvoice_url = reverse("shop-books-voucher-einvoice", kwargs={"voucher_id": voucher["id"]})

    rejected = api_client.post(einvoice_url, {}, format="json")
    assert rejected.status_code == 422

    allowed = api_client.post(einvoice_url, {"allow_b2c": True}, format="json")
    assert allowed.status_code == 201, allowed.content
    assert allowed.json()["data"]["status"] == "generated"
