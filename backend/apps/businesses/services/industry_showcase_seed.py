from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone as dt_timezone
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.authentication.constants import DEFAULT_CUSTOMER_ROLE_CODE
from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import (
    Booking,
    BookingChannel,
    BookingSource,
    BookingStatus,
    BusinessSchedule,
    BusinessWeeklySchedule,
    StaffWeeklySchedule,
)
from apps.businesses.models import (
    Branch,
    BranchStatus,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    WhiteLabelProfile,
)
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.product_billing import ProductBillingService
from apps.businesses.services.white_label import ensure_white_label_profile
from apps.customers.models import Customer, CustomerStatus
from apps.services.models import (
    Service,
    ServiceCategory,
    ServiceDuration,
    ServicePricing,
    ServiceStatus,
    ServiceVisibility,
)
from apps.shopie.models import FulfillmentMode, ProductCategory, ProductStatus
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.godowns import GodownsService
from apps.shopie.services.orders import OrderService
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment
from apps.tenancy.models import Branding, Organization, Tenant
from apps.tenancy.repositories.tenancy import TenantRepository

TZ = ZoneInfo("Asia/Kolkata")
UNSPLASH = "https://images.unsplash.com"
SHOWCASE_CUSTOMER_EMAIL = "showcase-customer@example.com"
SHOWCASE_CUSTOMER_PASSWORD = "ShowcasePass123!"


def _photo(photo_id: str) -> str:
    return f"{UNSPLASH}/{photo_id}?auto=format&fit=crop&w=800&q=80"


@dataclass(frozen=True)
class ServiceSpec:
    code: str
    name: str
    minutes: int
    price: int
    category: str


@dataclass(frozen=True)
class ProductSpec:
    sku: str
    name: str
    price: str
    category: str
    image_url: str


@dataclass(frozen=True)
class IndustryShowcase:
    slug: str
    industry_slug: str
    display_name: str
    primary_color: str
    secondary_color: str
    products: tuple[str, ...]
    services: tuple[ServiceSpec, ...]
    catalog: tuple[ProductSpec, ...]
    staff_name: tuple[str, str]
    staff_role: str


SHOWCASES: tuple[IndustryShowcase, ...] = (
    IndustryShowcase(
        slug="showcase-clinic",
        industry_slug="clinic-healthcare",
        display_name="Nimbus Clinic",
        primary_color="#0F766E",
        secondary_color="#111827",
        products=("appointie", "shopie"),
        staff_name=("Anika", "Rao"),
        staff_role="Physician",
        services=(
            ServiceSpec("consult", "General Consultation", 30, 800, "Consults"),
            ServiceSpec("follow-up", "Follow-up Visit", 20, 500, "Consults"),
            ServiceSpec("dental", "Dental Check-up", 40, 1200, "Dental"),
            ServiceSpec("physio", "Physio Session", 45, 900, "Therapy"),
        ),
        catalog=(
            ProductSpec("pulse-ox", "Pulse Oximeter", "1490.00", ProductCategory.HEALTH, _photo("photo-1584982751601-97dcc096659c")),
            ProductSpec("thermo", "Digital Thermometer", "420.00", ProductCategory.HEALTH, _photo("photo-1584308666744-24d98cee735c")),
            ProductSpec("vitd", "Vitamin D3 60s", "680.00", ProductCategory.HEALTH, _photo("photo-1587854692152-cbe660dbde88")),
        ),
    ),
    IndustryShowcase(
        slug="showcase-fitness",
        industry_slug="fitness-wellness",
        display_name="Apex Fitness",
        primary_color="#C2410C",
        secondary_color="#111827",
        products=("appointie", "shopie"),
        staff_name=("Kabir", "Seth"),
        staff_role="Coach",
        services=(
            ServiceSpec("pt", "Personal Training", 60, 1500, "Training"),
            ServiceSpec("yoga", "Yoga Class", 50, 700, "Classes"),
            ServiceSpec("assess", "Strength Assessment", 40, 900, "Training"),
        ),
        catalog=(
            ProductSpec("band", "Resistance Band Set", "890.00", ProductCategory.OTHER, _photo("photo-1517838277536-cd18d8cd5c8f")),
            ProductSpec("whey", "Whey Protein 1kg", "2490.00", ProductCategory.HEALTH, _photo("photo-1579722821273-0f6c1b1d5448")),
            ProductSpec("mat", "Yoga Mat", "1290.00", ProductCategory.OTHER, _photo("photo-1601925260368-ae2f83cf8b7f")),
        ),
    ),
    IndustryShowcase(
        slug="showcase-professional",
        industry_slug="professional-services",
        display_name="Northstar Advisors",
        primary_color="#1E3A8A",
        secondary_color="#111827",
        products=("appointie",),
        staff_name=("Meera", "Iyer"),
        staff_role="Advisor",
        services=(
            ServiceSpec("tax", "Tax Consultation", 45, 2500, "Advisory"),
            ServiceSpec("strategy", "Strategy Session", 60, 4000, "Advisory"),
            ServiceSpec("contract", "Contract Review", 40, 3200, "Legal"),
        ),
        catalog=(),
    ),
    IndustryShowcase(
        slug="showcase-retail",
        industry_slug="retail",
        display_name="Kirana Collective",
        primary_color="#B45309",
        secondary_color="#111827",
        products=("shopie",),
        staff_name=("Rahul", "Desai"),
        staff_role="Store lead",
        services=(),
        catalog=(
            ProductSpec("atta", "Atta 5 kg", "280.00", ProductCategory.FOOD_GROCERY, _photo("photo-1509440159596-0249088772ff")),
            ProductSpec("dal", "Toor Dal 1 kg", "165.00", ProductCategory.FOOD_GROCERY, _photo("photo-1596797038530-2c107229654b")),
            ProductSpec("oil", "Coconut Oil 1L", "320.00", ProductCategory.FOOD_GROCERY, _photo("photo-1474979266404-7eaacbcd87c5")),
            ProductSpec("tea", "Green Tea 100s", "240.00", ProductCategory.BEVERAGES, _photo("photo-1556679343-c7306c1976bc")),
        ),
    ),
    IndustryShowcase(
        slug="showcase-education",
        industry_slug="education-training",
        display_name="Brightpath Academy",
        primary_color="#6D28D9",
        secondary_color="#111827",
        products=("appointie", "shopie"),
        staff_name=("Priya", "Nair"),
        staff_role="Tutor",
        services=(
            ServiceSpec("maths", "Maths Tutoring", 50, 800, "Classes"),
            ServiceSpec("english", "Spoken English", 45, 700, "Classes"),
            ServiceSpec("piano", "Piano Class", 40, 900, "Arts"),
        ),
        catalog=(
            ProductSpec("workbook", "Practice Workbook", "350.00", ProductCategory.OTHER, _photo("photo-1456513080800-7d93d4eac7d0")),
            ProductSpec("kit", "Stationery Kit", "280.00", ProductCategory.OTHER, _photo("photo-1456735190827-d1262f71b8a3")),
        ),
    ),
    IndustryShowcase(
        slug="showcase-home",
        industry_slug="home-services",
        display_name="Hearth Home Care",
        primary_color="#0369A1",
        secondary_color="#111827",
        products=("appointie", "shopie"),
        staff_name=("Arjun", "Patil"),
        staff_role="Technician",
        services=(
            ServiceSpec("ac", "AC Service", 60, 1499, "Repairs"),
            ServiceSpec("clean", "Deep Cleaning", 90, 2499, "Cleaning"),
            ServiceSpec("plumb", "Plumbing Visit", 50, 899, "Repairs"),
        ),
        catalog=(
            ProductSpec("filter", "AC Air Filter", "450.00", ProductCategory.HOUSEHOLD, _photo("photo-1581578731548-c64695cc6952")),
            ProductSpec("clean-kit", "Cleaning Kit", "690.00", ProductCategory.HOUSEHOLD, _photo("photo-1563453392212-326f5e854473")),
        ),
    ),
)


def _resolve_owner() -> User:
    demo = Tenant.objects.filter(slug="demo").select_related("owner").first()
    if demo and demo.owner_id:
        return demo.owner
    for email in ("pilot-owner@ieplatform.local", "pilot-owner@ieorbit.local"):
        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            return user
    raise ValueError("No pilot owner found. Seed Demo Salon first.")


def _ensure_subscription(*, business: Business, product_code: str) -> None:
    billing = ProductBillingService()
    plan_code = "shopie-pro" if product_code == "shopie" else "appointie-pro"
    plan, plan_definition = billing.resolve_subscription_plan(
        product_code=product_code,
        plan_code=plan_code,
    )
    now = timezone.now()
    subscription, _ = BusinessProductSubscription.objects.get_or_create(
        tenant=business.tenant,
        business=business,
        product_code=product_code,
        defaults={"status": BusinessProductSubscriptionStatus.TRIALING, "plan": plan},
    )
    subscription.plan = plan
    subscription.status = BusinessProductSubscriptionStatus.TRIALING
    subscription.billing_interval = str((plan_definition or {}).get("billing_interval") or "monthly")
    subscription.trial_ends_at = now + timedelta(days=14)
    subscription.current_period_starts_at = now - timedelta(days=1)
    subscription.current_period_ends_at = now + timedelta(days=14)
    subscription.canceled_at = None
    subscription.save()


def _ensure_business(*, spec: IndustryShowcase, owner: User) -> Business:
    tenant = Tenant.objects.filter(slug=spec.slug).first()
    if tenant is None:
        tenant = Tenant.objects.create(
            slug=spec.slug,
            display_name=spec.display_name,
            owner=owner,
            timezone="Asia/Kolkata",
            currency="INR",
            primary_color=spec.primary_color,
            secondary_color=spec.secondary_color,
        )
        TenantRepository().ensure_foundation_records(tenant)
    else:
        tenant.display_name = spec.display_name
        tenant.owner = owner
        tenant.timezone = "Asia/Kolkata"
        tenant.currency = "INR"
        tenant.primary_color = spec.primary_color
        tenant.secondary_color = spec.secondary_color
        tenant.save(
            update_fields=[
                "display_name",
                "owner",
                "timezone",
                "currency",
                "primary_color",
                "secondary_color",
                "updated_at",
            ]
        )
        TenantRepository().ensure_foundation_records(tenant)
    Branding.objects.filter(tenant=tenant).update(
        app_name=spec.display_name,
        primary_color=spec.primary_color,
        secondary_color=spec.secondary_color,
        accent_color=spec.primary_color,
        white_label_enabled=True,
    )

    organization = Organization.objects.filter(tenant=tenant).first()
    if organization is None:
        organization = Organization.objects.create(tenant=tenant, name=spec.display_name)

    business = Business.objects.filter(tenant=tenant, business_code="MAIN").first()
    service = BusinessService()
    if business is None:
        business = Business(
            tenant=tenant,
            organization=organization,
            business_code="MAIN",
            business_name=spec.display_name,
            display_name=spec.display_name,
            timezone="Asia/Kolkata",
            currency="INR",
        )
        business.mark_created(actor_id=owner.id)
        business.save()
        service.ensure_foundation_records(business)
    else:
        if business.display_name != spec.display_name:
            business.display_name = spec.display_name
            business.business_name = spec.display_name
            business.save(update_fields=["display_name", "business_name", "updated_at"])
        service.ensure_foundation_records(business)

    for product_code in spec.products:
        _ensure_subscription(business=business, product_code=product_code)
    selected = "shopie" if spec.products == ("shopie",) else "appointie"
    if business.selected_product != selected:
        business.selected_product = selected
        business.save(update_fields=["selected_product", "updated_at"])
    return business


def _apply_branding(*, business: Business, spec: IndustryShowcase) -> WhiteLabelProfile:
    profile = ensure_white_label_profile(business=business)
    profile.flavor_key = f"{spec.slug}-MAIN"
    profile.app_slug = spec.slug
    profile.app_name = spec.display_name
    profile.primary_color = spec.primary_color
    profile.secondary_color = spec.secondary_color
    profile.accent_color = spec.primary_color
    profile.white_label_enabled = True
    profile.build_metadata = {"showcase": True, "industry_slug": spec.industry_slug}
    profile.save()
    return profile


def _ensure_hours(*, business: Business) -> None:
    schedule = BusinessSchedule.objects.filter(tenant=business.tenant, business=business, is_default=True).first()
    if schedule is None:
        schedule = BusinessSchedule.objects.create(
            tenant=business.tenant,
            business=business,
            name="Default",
            is_default=True,
        )
    for weekday in range(7):
        BusinessWeeklySchedule.objects.update_or_create(
            tenant=business.tenant,
            schedule=schedule,
            weekday=weekday,
            defaults={
                "business": business,
                "is_open": weekday < 6,
                "opening_time": time(9, 0),
                "closing_time": time(19, 0),
                "capacity": 4,
            },
        )


def _ensure_branch(*, business: Business) -> Branch:
    branch, _ = Branch.objects.update_or_create(
        tenant=business.tenant,
        business=business,
        branch_code="main",
        defaults={
            "branch_name": "Main",
            "display_name": "Main",
            "is_primary": True,
            "email": f"hello@{business.tenant.slug}.example",
            "phone_number": "+91 90000 30001",
            "address_line1": "12 MG Road",
            "city": "Pune",
            "state": "Maharashtra",
            "country": "India",
            "postal_code": "411001",
            "timezone": "Asia/Kolkata",
            "status": BranchStatus.ACTIVE,
            "is_active": True,
        },
    )
    return branch


def _ensure_catalog_services(*, business: Business, spec: IndustryShowcase) -> list[Service]:
    services: list[Service] = []
    for index, row in enumerate(spec.services, start=1):
        category, _ = ServiceCategory.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            slug=row.category.lower().replace(" ", "-"),
            defaults={"name": row.category, "display_order": index, "status": ServiceStatus.ACTIVE},
        )
        service, _ = Service.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            service_code=row.code,
            defaults={
                "name": row.name,
                "display_name": row.name,
                "short_description": row.name,
                "description": row.name,
                "category": category,
                "status": ServiceStatus.ACTIVE,
                "visibility": ServiceVisibility.PUBLIC,
                "online_booking_enabled": True,
                "display_order": index,
                "is_active": True,
            },
        )
        ServiceDuration.objects.update_or_create(
            tenant=business.tenant,
            service=service,
            is_default=True,
            defaults={"duration_minutes": row.minutes},
        )
        ServicePricing.objects.update_or_create(
            tenant=business.tenant,
            service=service,
            is_default=True,
            defaults={"currency": "INR", "base_price": row.price},
        )
        services.append(service)
    return services


def _ensure_staff(*, business: Business, spec: IndustryShowcase, services: list[Service], owner: User) -> Staff:
    staff, _ = Staff.objects.update_or_create(
        tenant=business.tenant,
        business=business,
        staff_code="lead",
        defaults={
            "user": owner,
            "first_name": spec.staff_name[0],
            "last_name": spec.staff_name[1],
            "display_name": f"{spec.staff_name[0]} {spec.staff_name[1]}",
            "email": owner.email,
            "designation": spec.staff_role,
            "department": spec.staff_role,
            "employment_status": EmploymentStatus.ACTIVE,
            "is_bookable": True,
            "is_active": True,
        },
    )
    for weekday in range(6):
        StaffWeeklySchedule.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            staff_id=staff.id,
            weekday=weekday,
            defaults={
                "is_available": True,
                "shift_start": time(9, 0),
                "shift_end": time(19, 0),
                "capacity": 1,
            },
        )
    for service in services:
        StaffServiceAssignment.objects.update_or_create(
            tenant=business.tenant,
            staff=staff,
            service=service,
            defaults={"is_active_assignment": True, "priority": 0},
        )
    return staff


def _ensure_customers(*, business: Business) -> list[Customer]:
    people = (
        ("Asha", "Kulkarni"),
        ("Rohan", "Mehta"),
        ("Neel", "Sharma"),
        ("Diya", "Banerjee"),
    )
    rows: list[Customer] = []
    for index, (first, last) in enumerate(people, start=1):
        customer, _ = Customer.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            customer_code=f"sc-{index}",
            defaults={
                "first_name": first,
                "last_name": last,
                "display_name": f"{first} {last}",
                "email": f"{first.lower()}.{business.tenant.slug}@example.com",
                "phone_number": f"+91 90011 4000{index}",
                "status": CustomerStatus.ACTIVE,
                "is_active": True,
                "source": "industry_showcase",
            },
        )
        rows.append(customer)
    return rows


def _ensure_customer_user(*, customers: list[Customer]) -> User:
    user = User.objects.filter(email__iexact=SHOWCASE_CUSTOMER_EMAIL).first()
    if user is None:
        user = User.objects.create_user(
            email=SHOWCASE_CUSTOMER_EMAIL,
            password=SHOWCASE_CUSTOMER_PASSWORD,
            status=UserStatus.ACTIVE,
            first_name="Asha",
            last_name="Kulkarni",
        )
    RoleService().assign_role(user=user, role_code=DEFAULT_CUSTOMER_ROLE_CODE)
    if customers:
        first = customers[0]
        if first.email.lower() != SHOWCASE_CUSTOMER_EMAIL:
            first.email = SHOWCASE_CUSTOMER_EMAIL
            first.save(update_fields=["email", "updated_at"])
    return user


def _ensure_bookings(*, business: Business, services: list[Service], staff: Staff, customers: list[Customer], branch: Branch) -> int:
    if not services or not customers:
        return 0
    local_today = timezone.now().astimezone(TZ).date()
    slots = ((10, 0, 0, BookingStatus.CONFIRMED), (12, 0, 1, BookingStatus.CONFIRMED), (15, 30, 2, BookingStatus.PENDING))
    count = 0
    for hour, minute, index, status in slots:
        service = services[index % len(services)]
        customer = customers[index % len(customers)]
        duration = service.durations.filter(is_default=True).first()
        minutes = int(duration.duration_minutes) if duration else 45
        start_local = datetime(local_today.year, local_today.month, local_today.day, hour, minute, tzinfo=TZ)
        end_local = start_local + timedelta(minutes=minutes)
        Booking.objects.update_or_create(
            tenant=business.tenant,
            booking_number=f"{business.tenant.slug}-BK-{index + 1:03d}",
            defaults={
                "business": business,
                "branch": branch,
                "customer_id": customer.id,
                "staff_id": staff.id,
                "service_id": service.id,
                "appointment_date": local_today,
                "start_at": start_local.astimezone(dt_timezone.utc),
                "end_at": end_local.astimezone(dt_timezone.utc),
                "duration_minutes": minutes,
                "status": status,
                "source": BookingSource.OPERATIONS_DASHBOARD,
                "channel": BookingChannel.WEB,
                "metadata": {"seed": "industry_showcase"},
                "is_active": True,
            },
        )
        count += 1
    return count


def _ensure_products(*, business: Business, spec: IndustryShowcase) -> list[Any]:
    if not spec.catalog:
        return []
    GodownsService().ensure_default_godown(tenant=business.tenant, business=business)
    catalog = CatalogService()
    from apps.shopie.models import ShopProduct

    products = []
    for row in spec.catalog:
        existing = ShopProduct.objects.filter(tenant=business.tenant, business=business, sku=row.sku).first()
        payload = {
            "sku": row.sku,
            "name": row.name,
            "brand": spec.display_name,
            "description": row.name,
            "status": ProductStatus.ACTIVE,
            "price": row.price,
            "gst_rate": "18",
            "tax_rate": "18",
            "currency": "INR",
            "image_url": row.image_url,
            "category": row.category,
            "low_stock_threshold": "3",
            "metadata": {"images": {"front": row.image_url, "gallery": [row.image_url]}},
        }
        if existing is None:
            product = catalog.create_product(
                tenant=business.tenant,
                business=business,
                data={**payload, "stock_on_hand": "18"},
            )
        else:
            product = catalog.update_product(tenant=business.tenant, business=business, product=existing, data=payload)
        products.append(product)
    return products


def _ensure_orders(*, business: Business, products: list[Any], customers: list[Customer]) -> int:
    if not products or not customers:
        return 0
    from apps.shopie.models import ShopOrder

    if ShopOrder.objects.filter(tenant=business.tenant, business=business).exists():
        return ShopOrder.objects.filter(tenant=business.tenant, business=business).count()
    OrderService().create_order(
        tenant=business.tenant,
        business=business,
        customer=customers[0],
        fulfillment_mode=FulfillmentMode.POS,
        lines=[{"product_id": products[0].id, "quantity": 1}],
        confirm=True,
        payment_method="upi",
    )
    if len(products) > 1:
        OrderService().create_order(
            tenant=business.tenant,
            business=business,
            customer=customers[1 % len(customers)],
            fulfillment_mode=FulfillmentMode.PICKUP,
            lines=[{"product_id": products[1].id, "quantity": 2}],
            confirm=True,
            payment_method="cash",
        )
    return ShopOrder.objects.filter(tenant=business.tenant, business=business).count()


@transaction.atomic
def seed_industry_showcase() -> list[dict[str, Any]]:
    owner = _resolve_owner()
    RoleService().assign_role(user=owner, role_code="business_owner")
    rows: list[dict[str, Any]] = []
    for spec in SHOWCASES:
        business = _ensure_business(spec=spec, owner=owner)
        profile = _apply_branding(business=business, spec=spec)
        _ensure_hours(business=business)
        branch = _ensure_branch(business=business)
        services = _ensure_catalog_services(business=business, spec=spec)
        staff = _ensure_staff(business=business, spec=spec, services=services, owner=owner)
        customers = _ensure_customers(business=business)
        _ensure_customer_user(customers=customers)
        bookings = _ensure_bookings(
            business=business, services=services, staff=staff, customers=customers, branch=branch
        )
        products = _ensure_products(business=business, spec=spec)
        orders = _ensure_orders(business=business, products=products, customers=customers)
        rows.append(
            {
                "industry_slug": spec.industry_slug,
                "flavor_key": profile.flavor_key,
                "tenant_slug": spec.slug,
                "tenant_id": str(business.tenant_id),
                "business_id": str(business.id),
                "business_code": "MAIN",
                "display_name": spec.display_name,
                "products": list(spec.products),
                "services": len(services),
                "catalog": len(products),
                "bookings": bookings,
                "orders": orders,
                "customer_email": SHOWCASE_CUSTOMER_EMAIL,
            }
        )
    return rows
