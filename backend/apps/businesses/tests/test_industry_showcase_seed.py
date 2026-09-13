from __future__ import annotations

import pytest

from apps.authentication.models import User, UserStatus
from apps.bookings.models import Booking
from apps.businesses.models import WhiteLabelProfile
from apps.businesses.services.industry_showcase_seed import (
    SHOWCASE_CUSTOMER_EMAIL,
    seed_industry_showcase,
)
from apps.customers.models import Customer
from apps.services.models import Service
from apps.shopie.models import ShopProduct
from apps.tenancy.models import Tenant


@pytest.mark.django_db
def test_seed_industry_showcase_is_idempotent_and_branded() -> None:
    owner = User.objects.create_user(
        email="pilot-owner@ieplatform.local",
        password="PilotPass123!",
        status=UserStatus.ACTIVE,
        first_name="Pilot",
        last_name="Owner",
    )
    Tenant.objects.create(slug="demo", display_name="Demo Salon", owner=owner)

    first = seed_industry_showcase()
    second = seed_industry_showcase()

    assert len(first) == 6
    assert [row["flavor_key"] for row in first] == [row["flavor_key"] for row in second]
    assert {row["industry_slug"] for row in first} == {
        "clinic-healthcare",
        "fitness-wellness",
        "professional-services",
        "retail",
        "education-training",
        "home-services",
    }

    clinic = next(row for row in first if row["industry_slug"] == "clinic-healthcare")
    assert clinic["flavor_key"] == "showcase-clinic-MAIN"
    assert clinic["services"] == 4
    assert clinic["catalog"] == 3
    assert clinic["bookings"] == 3
    assert WhiteLabelProfile.objects.filter(flavor_key="showcase-clinic-MAIN", app_name="Nimbus Clinic").exists()
    assert Service.objects.filter(business_id=clinic["business_id"], display_name="General Consultation").exists()
    assert Booking.objects.filter(business_id=clinic["business_id"]).count() == 3
    assert Customer.objects.filter(business_id=clinic["business_id"], email=SHOWCASE_CUSTOMER_EMAIL).exists()

    professional = next(row for row in first if row["industry_slug"] == "professional-services")
    assert professional["catalog"] == 0
    assert professional["services"] == 3
    assert ShopProduct.objects.filter(business_id=professional["business_id"]).count() == 0

    retail = next(row for row in first if row["industry_slug"] == "retail")
    assert retail["services"] == 0
    assert retail["catalog"] == 4
    assert Booking.objects.filter(business_id=retail["business_id"]).count() == 0
    assert ShopProduct.objects.filter(business_id=retail["business_id"], sku="atta").exists()
