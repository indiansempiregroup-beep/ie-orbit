from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.models import PlatformCatalogDaily, PlatformUsageDaily
from apps.analytics.services.platform_analytics import PlatformAnalyticsService
from apps.authentication.models import Role, User, UserRole, UserStatus
from apps.bookings.models import Booking, BookingLineItem, BookingStatus
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.services.models import Service
from apps.shopie.models import FulfillmentMode, OrderStatus, ShopOrder, ShopOrderLine, ShopProduct
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def platform_admin() -> User:
    user = User.objects.create_user(
        email="platform-analytics-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="platform_admin").first()
    if role is None:
        role = Role.objects.create(code="platform_admin", name="Platform Admin", is_system=True)
    UserRole.objects.create(user=user, role=role)
    return user


def _workspace(slug: str, product: str) -> tuple[Tenant, Business]:
    owner = User.objects.create_user(
        email=f"{slug}-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug=slug, display_name=slug.replace("-", " ").title(), owner=owner
    )
    organization = Organization.objects.create(tenant=tenant, name=f"{slug} org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code=f"{slug}-biz",
        business_name=f"{slug} biz",
        display_name=f"{slug} biz",
        selected_product=product,
        currency="INR",
    )
    return tenant, business


def _service(tenant: Tenant, business: Business, code: str) -> Service:
    return Service.objects.create(
        tenant=tenant,
        business=business,
        service_code=code,
        name=code,
        display_name=code.replace("-", " ").title(),
    )


def _booking(
    *,
    tenant: Tenant,
    business: Business,
    service: Service,
    day,
    status: str,
    revenue: Decimal,
    number: str,
) -> Booking:
    start = timezone.make_aware(datetime.combine(day, time(hour=10)))
    booking = Booking.objects.create(
        tenant=tenant,
        business=business,
        booking_number=number,
        customer_id=uuid4(),
        service_id=service.id,
        appointment_date=day,
        start_at=start,
        end_at=start + timedelta(minutes=30),
        duration_minutes=30,
        status=status,
    )
    BookingLineItem.objects.create(
        tenant=tenant,
        booking=booking,
        service_id=service.id,
        start_at=start,
        end_at=start + timedelta(minutes=30),
        duration_minutes=30,
        price_snapshot=revenue,
    )
    return booking


@pytest.mark.django_db
def test_platform_analytics_covers_product_tenant_business_and_catalog(
    api_client: APIClient,
    platform_admin: User,
) -> None:
    today = timezone.now().date()
    salon_tenant, salon = _workspace("analytics-salon", "appointie")
    mart_tenant, mart = _workspace("analytics-mart", "shopie")
    haircut = _service(salon_tenant, salon, "haircut")
    add_on = _service(salon_tenant, salon, "tiny-add-on")
    _booking(
        tenant=salon_tenant,
        business=salon,
        service=haircut,
        day=today,
        status=BookingStatus.COMPLETED,
        revenue=Decimal("900.00"),
        number="AN-1",
    )
    _booking(
        tenant=salon_tenant,
        business=salon,
        service=add_on,
        day=today,
        status=BookingStatus.COMPLETED,
        revenue=Decimal("50.00"),
        number="AN-2",
    )
    Customer.objects.create(
        tenant=salon_tenant,
        business=salon,
        customer_code="new-1",
        first_name="New",
        display_name="New Guest",
    )
    rice = ShopProduct.objects.create(
        tenant=mart_tenant,
        business=mart,
        name="25kg Rice",
        sku="RICE-25",
        price=Decimal("1800"),
        stock_on_hand=Decimal("12"),
    )
    candy = ShopProduct.objects.create(
        tenant=mart_tenant,
        business=mart,
        name="Mint candy",
        sku="MINT-1",
        price=Decimal("5"),
        stock_on_hand=Decimal("200"),
    )
    shopper = Customer.objects.create(
        tenant=mart_tenant,
        business=mart,
        customer_code="shop-1",
        first_name="Shop",
        display_name="Shopper",
    )
    big_order = ShopOrder.objects.create(
        tenant=mart_tenant,
        business=mart,
        customer=shopper,
        order_number="SO-BIG",
        status=OrderStatus.COMPLETED,
        fulfillment_mode=FulfillmentMode.POS,
        total=Decimal("1800"),
    )
    ShopOrderLine.objects.create(
        tenant=mart_tenant,
        business=mart,
        order=big_order,
        product=rice,
        product_name=rice.name,
        quantity=Decimal("1"),
        unit_price=rice.price,
        line_total=Decimal("1800"),
    )
    small_order = ShopOrder.objects.create(
        tenant=mart_tenant,
        business=mart,
        customer=shopper,
        order_number="SO-SMALL",
        status=OrderStatus.COMPLETED,
        total=Decimal("5"),
    )
    ShopOrderLine.objects.create(
        tenant=mart_tenant,
        business=mart,
        order=small_order,
        product=candy,
        product_name=candy.name,
        quantity=Decimal("1"),
        unit_price=candy.price,
        line_total=Decimal("5"),
    )

    api_client.force_authenticate(user=platform_admin)
    response = api_client.get(
        reverse("platform-analytics"),
        {
            "start_date": today.isoformat(),
            "end_date": today.isoformat(),
            "grain": "day",
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["kpis"]["bookings"] == 2
    assert payload["kpis"]["completed_bookings"] == 2
    assert payload["kpis"]["booking_revenue"] == 950
    assert payload["kpis"]["orders"] == 2
    assert payload["kpis"]["pos_orders"] == 1
    assert payload["kpis"]["online_orders"] == 1
    assert payload["kpis"]["gmv"] == 1805
    assert payload["kpis"]["pos_gmv"] == 1800
    assert payload["kpis"]["online_gmv"] == 5
    assert payload["kpis"]["new_customers"] >= 2
    products = {row["product_code"]: row for row in payload["by_product"]}
    assert products["appointie"]["bookings"] == 2
    assert products["shopie"]["orders"] == 2
    assert products["shopie"]["pos_orders"] == 1
    assert products["shopie"]["online_orders"] == 1
    tenant_names = {row["tenant_slug"]: row for row in payload["by_tenant"]}
    assert tenant_names["analytics-salon"]["bookings"] == 2
    assert tenant_names["analytics-mart"]["orders"] == 2
    assert tenant_names["analytics-mart"]["pos_orders"] == 1
    assert tenant_names["analytics-mart"]["online_orders"] == 1
    business_names = {row["business_code"]: row for row in payload["by_business"]}
    assert business_names["analytics-salon-biz"]["bookings"] == 2
    assert business_names["analytics-mart-biz"]["gmv"] == 1805
    assert business_names["analytics-mart-biz"]["pos_gmv"] == 1800
    assert payload["datapoints"]["fulfillment_mode"]["pos"] == 1
    top_service = payload["catalog"]["services"]["top"][0]
    bottom_service = payload["catalog"]["services"]["bottom"][0]
    assert top_service["item_name"] == "Haircut"
    assert bottom_service["item_name"] == "Tiny Add On"
    top_sku = payload["catalog"]["skus"]["top"][0]
    bottom_sku = payload["catalog"]["skus"]["bottom"][0]
    assert top_sku["item_name"] == "25kg Rice"
    assert bottom_sku["item_name"] == "Mint candy"
    assert payload["series"][0]["period"] == today.isoformat()

    weekly = api_client.get(
        reverse("platform-analytics"),
        {
            "start_date": (today - timedelta(days=6)).isoformat(),
            "end_date": today.isoformat(),
            "grain": "week",
            "product_code": "shopie",
        },
    )
    assert weekly.status_code == 200
    week_payload = weekly.json()["data"]
    assert week_payload["kpis"]["orders"] == 2
    assert week_payload["kpis"]["pos_orders"] == 1
    assert week_payload["kpis"]["online_orders"] == 1
    assert week_payload["kpis"]["bookings"] == 0
    assert week_payload["filters"]["product_code"] == "shopie"

    tenant_only = api_client.get(
        reverse("platform-analytics"),
        {
            "tenant_id": str(salon_tenant.id),
            "start_date": today.isoformat(),
            "end_date": today.isoformat(),
        },
    )
    assert tenant_only.json()["data"]["kpis"]["orders"] == 0
    assert tenant_only.json()["data"]["kpis"]["bookings"] == 2


@pytest.mark.django_db
def test_platform_analytics_snapshot_persists_daily_facts() -> None:
    today = timezone.now().date()
    tenant, business = _workspace("snap-salon", "appointie")
    service = _service(tenant, business, "color")
    _booking(
        tenant=tenant,
        business=business,
        service=service,
        day=today,
        status=BookingStatus.COMPLETED,
        revenue=Decimal("400.00"),
        number="SNAP-1",
    )
    result = PlatformAnalyticsService().snapshot_day(today)
    assert result["usage_rows"] == 1
    assert result["catalog_rows"] == 1
    usage = PlatformUsageDaily.objects.get(
        business_id=business.id, product_code="appointie", day=today
    )
    assert usage.bookings == 1
    assert usage.booking_revenue == Decimal("400.00")
    catalog = PlatformCatalogDaily.objects.get(business_id=business.id, day=today)
    assert catalog.item_name == "Color"
    assert catalog.revenue == Decimal("400.00")


@pytest.mark.django_db
def test_platform_analytics_requires_platform_admin(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="analytics-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    api_client.force_authenticate(user=user)
    response = api_client.get(reverse("platform-analytics"))
    assert response.status_code == 403
