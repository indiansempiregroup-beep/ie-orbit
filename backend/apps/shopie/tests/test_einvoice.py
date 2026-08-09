from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import EInvoiceStatus, EWayBillStatus, ShopProduct
from apps.shopie.services.books import BooksService
from apps.shopie.services.einvoice.service import GstComplianceService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def gst_business() -> Business:
    owner = User.objects.create_user(
        email="einvoice-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="einvoice-tenant", display_name="EInvoice Tenant", owner=owner
    )
    organization = Organization.objects.create(tenant=tenant, name="EInvoice Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="einvoice-biz",
        business_name="EInvoice Biz",
        display_name="EInvoice Biz",
        selected_product="shopie",
        gst_tax_number="27AAAPL1234C1ZV",
        state="Maharashtra",
        address_line1="123 Industrial Estate",
        city="Mumbai",
        postal_code="400001",
    )


@pytest.fixture
def b2b_customer(gst_business: Business) -> Customer:
    return Customer.objects.create(
        tenant=gst_business.tenant,
        business=gst_business,
        customer_code="cust-gst-1",
        first_name="Acme",
        last_name="Traders",
        display_name="Acme Traders",
        gstin="29AABCU9603R1ZM",
        billing_state="Karnataka",
    )


@pytest.fixture
def product(gst_business: Business) -> ShopProduct:
    return ShopProduct.objects.create(
        tenant=gst_business.tenant,
        business=gst_business,
        name="Widget",
        price=Decimal("1000"),
        gst_rate=Decimal("18"),
        hsn_sac="8471",
        stock_on_hand=Decimal("100"),
    )


def _make_sale_voucher(*, business: Business, customer: Customer, product: ShopProduct):
    books = BooksService()
    return books.create_sale_voucher(
        tenant=business.tenant,
        business=business,
        data={
            "customer": customer,
            "lines": [{"product_id": product.id, "qty": "2", "rate": "1000", "gst_rate": "18"}],
            "is_interstate": True,
            "place_of_supply": "Karnataka",
        },
    )


@pytest.mark.django_db
def test_generate_einvoice_with_mock_provider(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant,
        business=gst_business,
        data={"einvoice_enabled": True, "eway_enabled": True},
    )
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)

    einvoice = compliance.generate_einvoice(
        tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
    )

    assert einvoice.status == EInvoiceStatus.GENERATED
    assert len(einvoice.irn) == 64
    assert einvoice.ack_no
    assert einvoice.signed_qr
    assert einvoice.signed_invoice
    assert einvoice.request_payload["BuyerDtls"]["Gstin"] == "29AABCU9603R1ZM"
    assert einvoice.request_payload["TranDtls"]["SupTyp"] == "B2B"
    assert einvoice.response_payload["mode"] == "mock"

    # Re-generating an already-generated e-invoice is idempotent.
    again = compliance.generate_einvoice(
        tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
    )
    assert again.id == einvoice.id
    assert again.irn == einvoice.irn


@pytest.mark.django_db
def test_generate_einvoice_requires_buyer_gstin_without_b2c(
    gst_business: Business, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant, business=gst_business, data={"einvoice_enabled": True}
    )
    books = BooksService()
    voucher = books.create_sale_voucher(
        tenant=gst_business.tenant,
        business=gst_business,
        data={
            "customer": None,
            "lines": [{"product_id": product.id, "qty": "1", "rate": "1000", "gst_rate": "18"}],
        },
    )

    with pytest.raises(ValidationError):
        compliance.generate_einvoice(
            tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
        )


@pytest.mark.django_db
def test_generate_einvoice_fails_when_not_enabled(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)

    with pytest.raises(ValidationError):
        compliance.generate_einvoice(
            tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
        )


@pytest.mark.django_db
def test_cancel_einvoice(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant, business=gst_business, data={"einvoice_enabled": True}
    )
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)
    compliance.generate_einvoice(
        tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
    )

    cancelled = compliance.cancel_einvoice(
        tenant=gst_business.tenant,
        business=gst_business,
        voucher_id=voucher.id,
        reason="Data entry mistake",
    )
    assert cancelled.status == EInvoiceStatus.CANCELLED
    assert cancelled.cancelled_at is not None
    assert cancelled.cancel_reason == "Data entry mistake"

    with pytest.raises(ValidationError):
        compliance.cancel_einvoice(
            tenant=gst_business.tenant,
            business=gst_business,
            voucher_id=voucher.id,
            reason="Try again",
        )


@pytest.mark.django_db
def test_generate_and_cancel_eway_bill(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant,
        business=gst_business,
        data={"einvoice_enabled": True, "eway_enabled": True},
    )
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)
    einvoice = compliance.generate_einvoice(
        tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
    )

    eway = compliance.generate_eway(
        tenant=gst_business.tenant,
        business=gst_business,
        voucher_id=voucher.id,
        transport={
            "transporter_name": "Speedy Logistics",
            "transport_mode": "1",
            "vehicle_no": "MH12AB1234",
            "vehicle_type": "R",
            "distance_km": 850,
            "from_place": "Mumbai",
            "from_state_code": "Maharashtra",
            "to_place": "Bengaluru",
            "to_state_code": "Karnataka",
        },
    )

    assert eway.status == EWayBillStatus.GENERATED
    assert eway.ewb_no.startswith("EWB")
    assert eway.valid_upto is not None
    assert eway.einvoice_id == einvoice.id
    assert eway.from_state_code == "27"
    assert eway.to_state_code == "29"

    cancelled = compliance.cancel_eway(
        tenant=gst_business.tenant,
        business=gst_business,
        eway_id=eway.id,
        reason="Vehicle breakdown",
    )
    assert cancelled.status == EWayBillStatus.CANCELLED
    assert cancelled.cancelled_at is not None


@pytest.mark.django_db
def test_generate_eway_without_prior_irn(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant, business=gst_business, data={"eway_enabled": True}
    )
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)

    eway = compliance.generate_eway(
        tenant=gst_business.tenant,
        business=gst_business,
        voucher_id=voucher.id,
        transport={"vehicle_no": "KA01AB9999", "distance_km": 50},
    )
    assert eway.status == EWayBillStatus.GENERATED
    assert eway.einvoice_id is None


@pytest.mark.django_db
def test_list_einvoices_and_eway_bills(
    gst_business: Business, b2b_customer: Customer, product: ShopProduct
) -> None:
    compliance = GstComplianceService()
    compliance.update_compliance_settings(
        tenant=gst_business.tenant,
        business=gst_business,
        data={"einvoice_enabled": True, "eway_enabled": True},
    )
    voucher = _make_sale_voucher(business=gst_business, customer=b2b_customer, product=product)
    compliance.generate_einvoice(
        tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
    )
    compliance.generate_eway(
        tenant=gst_business.tenant,
        business=gst_business,
        voucher_id=voucher.id,
        transport={"vehicle_no": "KA01AB9999", "distance_km": 50},
    )

    einvoices = list(compliance.list_einvoices(tenant=gst_business.tenant, business=gst_business))
    assert len(einvoices) == 1

    eway_bills = list(
        compliance.list_eway_bills(
            tenant=gst_business.tenant, business=gst_business, voucher_id=voucher.id
        )
    )
    assert len(eway_bills) == 1
