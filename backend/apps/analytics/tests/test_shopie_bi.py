from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.analytics.services.analytics import AnalyticsService
from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import FulfillmentMode, OrderStatus, ShopOrder
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_workspace() -> tuple[Business, Customer]:
    owner = User.objects.create_user(
        email="shopie-bi-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shopie-bi-tenant",
        display_name="Shopie BI Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Shopie BI Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shopie-bi",
        business_name="Shopie BI",
        display_name="Shopie BI",
        selected_product="shopie",
        address_line1="1 Shop Road",
        city="Mumbai",
        postal_code="400001",
        currency="INR",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="SHOPIE-BI-1",
        first_name="Asha",
        last_name="Shah",
        display_name="Asha Shah",
        phone_number="+919999900011",
    )
    return business, customer


@pytest.mark.django_db
def test_shopie_growth_and_revenue_use_shop_orders(shop_workspace) -> None:
    business, customer = shop_workspace
    tenant = business.tenant
    ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-BI-1",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("200.00"),
    )
    ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-BI-2",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.PICKUP,
        currency="INR",
        total=Decimal("150.00"),
    )
    ShopOrder.objects.create(
        tenant=tenant,
        business=business,
        customer=customer,
        order_number="SO-BI-3",
        status=OrderStatus.CANCELLED,
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("99.00"),
    )
    today = timezone.localdate()
    service = AnalyticsService()
    growth = service.shopie_growth(
        tenant=tenant,
        business=business,
        start_date=today - timedelta(days=7),
        end_date=today,
    )
    revenue = service.shopie_revenue(
        tenant=tenant,
        business=business,
        start_date=today - timedelta(days=7),
        end_date=today,
    )
    forecast = service.shopie_forecast(tenant=tenant, business=business, horizon_days=30)
    reports = service.shopie_reports(
        tenant=tenant,
        business=business,
        start_date=today - timedelta(days=7),
        end_date=today,
    )
    assert growth["customers_with_orders"] == 1
    assert growth["new_customers"] == 1
    assert growth["top_customers"][0]["orders"] == 2
    assert revenue["orders"] == 2
    assert revenue["cancelled_orders"] == 1
    assert revenue["gmv"] == 350.0
    assert {row["channel"] for row in revenue["by_channel"]} == {"pos", "pickup"}
    assert forecast["projected_orders"] >= 0
    assert reports["growth"]["new_customers"] == 1
    assert reports["revenue"]["gmv"] == 350.0
