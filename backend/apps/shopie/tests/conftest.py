from decimal import Decimal

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Branch, BranchStatus, Business
from apps.customers.models import Customer
from apps.shopie.models import CashAccountType, ShopCashAccount
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="shop-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="shop-tenant",
        display_name="Shop Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Shop Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="shop-main",
        business_name="Shop Main",
        display_name="Shop Main",
        selected_product="shopie",
        address_line1="1 Shop Road",
        city="Mumbai",
        postal_code="400001",
        currency="INR",
    )


@pytest.fixture
def customer(shop_business: Business) -> Customer:
    return Customer.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        customer_code="SHOP-CUSTOMER",
        display_name="Shop Customer",
        first_name="Shop",
        phone_number="+919999900001",
    )


@pytest.fixture
def cash_account(shop_business: Business) -> ShopCashAccount:
    return ShopCashAccount.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Counter Cash",
        account_type=CashAccountType.CASH,
        opening_balance=Decimal("0"),
    )


def make_office(
    business: Business,
    *,
    name: str,
    latitude: str,
    longitude: str,
    is_primary: bool = False,
) -> Branch:
    return Branch.objects.create(
        tenant=business.tenant,
        business=business,
        branch_code=name.lower().replace(" ", "-"),
        branch_name=name,
        display_name=name,
        is_primary=is_primary,
        status=BranchStatus.ACTIVE,
        address_line1=f"{name} Road",
        city="Mumbai",
        country="India",
        postal_code="400001",
        latitude=Decimal(latitude),
        longitude=Decimal(longitude),
    )
