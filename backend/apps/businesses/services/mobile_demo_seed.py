from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Any

from django.db import transaction
from django.utils.text import slugify

from apps.bookings.models import BusinessSchedule, BusinessWeeklySchedule, StaffWeeklySchedule
from apps.businesses.models import Business, BusinessProfile, WhiteLabelProfile
from apps.notifications.services.template_seed import ensure_notification_templates
from apps.platform_media.models import Media, MediaType, MediaVisibility, StorageProviderType
from apps.services.models import (
    Service,
    ServiceCategory,
    ServiceDuration,
    ServiceImage,
    ServicePricing,
    ServiceStatus,
    ServiceVisibility,
)
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment


@dataclass(frozen=True)
class DemoCategorySpec:
    name: str
    slug: str
    display_order: int


@dataclass(frozen=True)
class DemoServiceSpec:
    code: str
    name: str
    category_slug: str
    duration_minutes: int
    price: int
    description: str
    display_order: int


@dataclass(frozen=True)
class DemoStaffSpec:
    code: str
    first_name: str
    last_name: str
    designation: str
    department: str
    service_codes: tuple[str, ...]


RUPALI_CATEGORIES: tuple[DemoCategorySpec, ...] = (
    DemoCategorySpec("Cuts", "cuts", 1),
    DemoCategorySpec("Color", "color", 2),
    DemoCategorySpec("Styling", "styling", 3),
    DemoCategorySpec("Skin & Care", "skin-care", 4),
)

RUPALI_SERVICES: tuple[DemoServiceSpec, ...] = (
    DemoServiceSpec(
        "hair-cut",
        "Hair Cut",
        "cuts",
        45,
        699,
        "Precision cut with wash and blow dry",
        1,
    ),
    DemoServiceSpec(
        "hair-color-cut",
        "Hair Color + Cut",
        "color",
        120,
        2499,
        "Full color application with cut and styling",
        2,
    ),
    DemoServiceSpec(
        "highlights",
        "Highlights",
        "color",
        150,
        3199,
        "Partial or full highlights with toner",
        3,
    ),
    DemoServiceSpec(
        "blowout",
        "Blowout & Styling",
        "styling",
        45,
        799,
        "Wash, blow dry, and event-ready styling",
        4,
    ),
    DemoServiceSpec(
        "bridal-trial",
        "Bridal Makeup Trial",
        "skin-care",
        60,
        1499,
        "Bridal look consultation and trial session",
        5,
    ),
    DemoServiceSpec(
        "facial-glow",
        "Glow Facial",
        "skin-care",
        60,
        999,
        "Deep cleanse and hydration facial",
        6,
    ),
)

RUPALI_STAFF: tuple[DemoStaffSpec, ...] = (
    DemoStaffSpec(
        "rupali",
        "Rupali",
        "Sirsat",
        "Senior Stylist & Owner",
        "Hair & Beauty",
        ("hair-cut", "hair-color-cut", "blowout", "bridal-trial"),
    ),
    DemoStaffSpec(
        "priya",
        "Priya",
        "Sharma",
        "Color Specialist",
        "Color",
        ("hair-color-cut", "highlights", "hair-cut"),
    ),
    DemoStaffSpec(
        "keiko",
        "Keiko",
        "Tanaka",
        "Stylist",
        "Styling",
        ("hair-cut", "blowout", "highlights"),
    ),
)

SERVICE_IMAGE_URLS: dict[str, str] = {
    "hair-cut": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&auto=format&fit=crop",
    "hair-color-cut": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&auto=format&fit=crop",
    "highlights": "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=600&auto=format&fit=crop",
    "blowout": "https://images.unsplash.com/photo-1633681928080-9b8a1e4e8c2b?w=600&auto=format&fit=crop",
    "bridal-trial": "https://images.unsplash.com/photo-1487412940907-5fbf55aea93e?w=600&auto=format&fit=crop",
    "facial-glow": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&auto=format&fit=crop",
}

CANCELLATION_POLICY = (
    "Free cancellation up to 24 hours before your appointment. "
    "Late cancellations or no-shows may incur a fee of 50% of the service price."
)

BUSINESS_HOURS: tuple[tuple[int, time, time, bool], ...] = (
    # weekday (0=Mon), open, close, is_open
    (0, time(9, 0), time(19, 0), True),
    (1, time(9, 0), time(19, 0), True),
    (2, time(9, 0), time(19, 0), True),
    (3, time(9, 0), time(19, 0), True),
    (4, time(9, 0), time(19, 0), True),
    (5, time(9, 0), time(19, 0), True),
    (6, time(10, 0), time(17, 0), True),
)


def _resolve_business(*, flavor_key: str) -> tuple[WhiteLabelProfile, Business]:
    profile = (
        WhiteLabelProfile.objects.select_related("business", "tenant")
        .filter(flavor_key=flavor_key, white_label_enabled=True)
        .first()
    )
    if profile is None:
        raise ValueError(f"White-label profile not found for flavor_key={flavor_key!r}.")
    return profile, profile.business


def _ensure_business_profile(*, business: Business) -> BusinessProfile:
    profile, _ = BusinessProfile.objects.get_or_create(
        tenant=business.tenant,
        business=business,
        defaults={"about": f"Welcome to {business.display_name}"},
    )
    updates: list[str] = []
    if not profile.cancellation_policy:
        profile.cancellation_policy = CANCELLATION_POLICY
        updates.append("cancellation_policy")
    if not profile.about:
        profile.about = (
            f"{business.display_name} offers premium hair, color, and beauty services in Pune. "
            "Book your appointment in seconds."
        )
        updates.append("about")
    if updates:
        profile.save(update_fields=[*updates, "updated_at"])
    if not business.address_line1:
        business.address_line1 = "Kalyani Nagar"
        business.city = business.city or "Pune"
        business.state = business.state or "Maharashtra"
        business.postal_code = business.postal_code or "411006"
        business.country = business.country or "India"
        business.primary_contact = business.primary_contact or "+91 98765 43210"
        business.email = business.email or "hello@rupalisirsat.example"
        business.save(
            update_fields=[
                "address_line1",
                "city",
                "state",
                "postal_code",
                "country",
                "primary_contact",
                "email",
                "updated_at",
            ]
        )
    return profile


def _ensure_business_hours(*, business: Business) -> None:
    schedule = BusinessSchedule.objects.filter(tenant=business.tenant, business=business, is_default=True).first()
    if schedule is None:
        schedule = BusinessSchedule.objects.create(
            tenant=business.tenant,
            business=business,
            name="Default",
            is_default=True,
        )
    for weekday, opening, closing, is_open in BUSINESS_HOURS:
        BusinessWeeklySchedule.objects.update_or_create(
            tenant=business.tenant,
            schedule=schedule,
            weekday=weekday,
            defaults={
                "business": business,
                "is_open": is_open,
                "opening_time": opening,
                "closing_time": closing,
                "capacity": 3,
            },
        )


def _ensure_categories(*, business: Business) -> dict[str, ServiceCategory]:
    mapping: dict[str, ServiceCategory] = {}
    for spec in RUPALI_CATEGORIES:
        category, _ = ServiceCategory.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            slug=spec.slug,
            defaults={
                "name": spec.name,
                "display_order": spec.display_order,
                "status": ServiceStatus.ACTIVE,
            },
        )
        mapping[spec.slug] = category
    return mapping


def _ensure_services(
    *,
    business: Business,
    categories: dict[str, ServiceCategory],
) -> dict[str, Service]:
    services: dict[str, Service] = {}
    alias_map = {"S1": "hair-cut"}
    for existing in Service.objects.filter(tenant=business.tenant, business=business):
        alias = alias_map.get(existing.service_code.upper())
        if alias and alias not in services:
            existing.service_code = alias
            existing.save(update_fields=["service_code", "updated_at"])

    for spec in RUPALI_SERVICES:
        category = categories.get(spec.category_slug)
        service, created = Service.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            service_code=spec.code,
            defaults={
                "name": spec.name,
                "display_name": spec.name,
                "short_description": spec.description,
                "description": spec.description,
                "category": category,
                "status": ServiceStatus.ACTIVE,
                "visibility": ServiceVisibility.PUBLIC,
                "online_booking_enabled": True,
                "display_order": spec.display_order,
            },
        )
        if not created:
            service.display_name = spec.name
            service.short_description = spec.description
            service.category = category
            service.status = ServiceStatus.ACTIVE
            service.visibility = ServiceVisibility.PUBLIC
            service.online_booking_enabled = True
            service.display_order = spec.display_order
            service.save(
                update_fields=[
                    "display_name",
                    "short_description",
                    "category",
                    "status",
                    "visibility",
                    "online_booking_enabled",
                    "display_order",
                    "updated_at",
                ]
            )
        duration = ServiceDuration.objects.filter(service=service, is_default=True).first()
        if duration is None:
            ServiceDuration.objects.create(
                tenant=business.tenant,
                service=service,
                duration_minutes=spec.duration_minutes,
                is_default=True,
            )
        else:
            duration.duration_minutes = spec.duration_minutes
            duration.save(update_fields=["duration_minutes", "updated_at"])
        pricing = ServicePricing.objects.filter(service=service, is_default=True).first()
        if pricing is None:
            ServicePricing.objects.create(
                tenant=business.tenant,
                service=service,
                currency=business.currency,
                base_price=spec.price,
                is_default=True,
            )
        else:
            pricing.base_price = spec.price
            pricing.currency = business.currency
            pricing.save(update_fields=["base_price", "currency", "updated_at"])
        services[spec.code] = service
    return services


def _ensure_staff(
    *,
    business: Business,
    services: dict[str, Service],
) -> list[Staff]:
    staff_rows: list[Staff] = []
    for spec in RUPALI_STAFF:
        display_name = f"{spec.first_name} {spec.last_name}".strip()
        staff, _ = Staff.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            staff_code=spec.code,
            defaults={
                "first_name": spec.first_name,
                "last_name": spec.last_name,
                "display_name": display_name,
                "designation": spec.designation,
                "department": spec.department,
                "employment_status": EmploymentStatus.ACTIVE,
            },
        )
        for weekday, opening, closing, is_open in BUSINESS_HOURS:
            if not is_open:
                continue
            StaffWeeklySchedule.objects.update_or_create(
                tenant=business.tenant,
                business=business,
                staff_id=staff.id,
                weekday=weekday,
                defaults={
                    "is_available": True,
                    "shift_start": opening,
                    "shift_end": closing,
                    "capacity": 1,
                },
            )
        for service_code in spec.service_codes:
            service = services.get(service_code)
            if service is None:
                continue
            StaffServiceAssignment.objects.update_or_create(
                tenant=business.tenant,
                staff=staff,
                service=service,
                defaults={"is_active_assignment": True, "priority": 0},
            )
        staff_rows.append(staff)
    return staff_rows


def _ensure_service_images(*, business: Business, services: dict[str, Service]) -> int:
    count = 0
    for code, service in services.items():
        image_url = SERVICE_IMAGE_URLS.get(code)
        if not image_url:
            continue
        checksum = f"demo-service-image-{code}"
        media, _ = Media.objects.update_or_create(
            tenant=business.tenant,
            checksum=checksum,
            storage_provider=StorageProviderType.LOCAL,
            defaults={
                "business": business,
                "media_type": MediaType.IMAGE,
                "original_filename": f"{code}.jpg",
                "storage_filename": f"{code}.jpg",
                "display_name": service.display_name or service.name,
                "file_extension": "jpg",
                "mime_type": "image/jpeg",
                "file_size": 1,
                "storage_path": f"demo/services/{code}.jpg",
                "visibility": MediaVisibility.PUBLIC,
                "metadata": {"public_url": image_url},
            },
        )
        ServiceImage.objects.update_or_create(
            tenant=business.tenant,
            service=service,
            is_primary=True,
            defaults={
                "media": media,
                "alt_text": service.display_name or service.name,
                "display_order": 0,
            },
        )
        count += 1
    return count


@transaction.atomic
def seed_mobile_demo_for_flavor(*, flavor_key: str) -> dict[str, Any]:
    profile, business = _resolve_business(flavor_key=flavor_key)
    _ensure_business_profile(business=business)
    _ensure_business_hours(business=business)
    categories = _ensure_categories(business=business)
    services = _ensure_services(business=business, categories=categories)
    staff = _ensure_staff(business=business, services=services)
    images = _ensure_service_images(business=business, services=services)
    templates = ensure_notification_templates(tenant=business.tenant, business=business)
    return {
        "flavor_key": profile.flavor_key,
        "tenant_slug": business.tenant.slug,
        "business_code": business.business_code,
        "business_name": business.display_name,
        "categories": len(categories),
        "services": len(services),
        "staff": len(staff),
        "images": images,
        "notification_templates": templates,
    }


def seed_rupali_mobile_demo() -> dict[str, Any]:
    return seed_mobile_demo_for_flavor(flavor_key="rupali-s-business-rupali-s-business")
