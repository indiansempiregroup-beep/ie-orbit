from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.bookings.models import BusinessSchedule, BusinessWeeklySchedule, StaffWeeklySchedule
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProfile, WhiteLabelProfile
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
from apps.shopie.models import ProductCategory, ProductStatus, ShopProduct
from apps.shopie.services.catalog import CatalogService
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment


FLAVOR_KEY = "sanket-pet-shop-sanket-pet-shop"

UNSPLASH = "https://images.unsplash.com"


def _photo(photo_id: str) -> str:
    return f"{UNSPLASH}/{photo_id}?auto=format&fit=crop&w=800&q=80"


@dataclass(frozen=True)
class CategorySpec:
    name: str
    slug: str
    display_order: int


@dataclass(frozen=True)
class ServiceSpec:
    code: str
    name: str
    category_slug: str
    duration_minutes: int
    price: int
    description: str
    display_order: int
    image_url: str


@dataclass(frozen=True)
class ProductSpec:
    sku: str
    name: str
    brand: str
    category: str
    pack_size: str
    price: str
    description: str
    hsn_sac: str
    stock: str
    image_url: str


CATEGORIES: tuple[CategorySpec, ...] = (
    CategorySpec("Bathing", "bathing", 1),
    CategorySpec("Grooming", "grooming", 2),
    CategorySpec("Spa & Hygiene", "spa", 3),
    CategorySpec("Add-ons", "add-ons", 4),
)

SERVICES: tuple[ServiceSpec, ...] = (
    ServiceSpec(
        "dog-bath-small",
        "Dog Bath — Small",
        "bathing",
        30,
        600,
        "Gentle shampoo and rinse for small breeds, finished with a fluff dry.",
        1,
        _photo("photo-1583511655857-d19b40a7a54e"),
    ),
    ServiceSpec(
        "dog-bath-medium",
        "Dog Bath — Medium",
        "bathing",
        45,
        800,
        "Full wash and dry for medium dogs, including a light coat tidy.",
        2,
        _photo("photo-1548199973-03cce0bbc87b"),
    ),
    ServiceSpec(
        "dog-bath-large",
        "Dog Bath — Large",
        "bathing",
        60,
        1000,
        "Thorough bath and blow-dry for large breeds.",
        3,
        _photo("photo-1552053831-71594a27632d"),
    ),
    ServiceSpec(
        "cat-bath",
        "Cat Bath",
        "bathing",
        30,
        800,
        "Calm, low-stress bath for cats with a gentle dry.",
        4,
        _photo("photo-1514888286974-6c03e2ca1dba"),
    ),
    ServiceSpec(
        "full-groom-small",
        "Full Groom — Small",
        "grooming",
        75,
        1200,
        "Bath, dry, haircut, and tidy-up for small dogs.",
        5,
        _photo("photo-1517849845537-4d257902454a"),
    ),
    ServiceSpec(
        "full-groom-medium",
        "Full Groom — Medium",
        "grooming",
        90,
        1600,
        "Complete groom with breed-style cut for medium dogs.",
        6,
        _photo("photo-1560807707-8cc77767d783"),
    ),
    ServiceSpec(
        "full-groom-large",
        "Full Groom — Large",
        "grooming",
        120,
        2200,
        "Full bath, dry, and haircut for large breeds.",
        7,
        _photo("photo-1561037404-61cd46aa615b"),
    ),
    ServiceSpec(
        "nail-trim",
        "Nail Trim",
        "spa",
        15,
        200,
        "Safe nail clip and file to a comfortable length.",
        8,
        _photo("photo-1583337130417-3346a1be7dee"),
    ),
    ServiceSpec(
        "ear-cleaning",
        "Ear Cleaning",
        "spa",
        15,
        150,
        "Gentle ear clean to remove wax and debris.",
        9,
        _photo("photo-1537151625747-768eb6cf92b2"),
    ),
    ServiceSpec(
        "teeth-brushing",
        "Teeth Brushing",
        "spa",
        15,
        200,
        "Fresh breath clean with pet-safe toothpaste.",
        10,
        _photo("photo-1477884213360-7e9d7dcc1e48"),
    ),
    ServiceSpec(
        "de-shedding",
        "De-shedding Treatment",
        "grooming",
        45,
        900,
        "Undercoat rake and blow-out to reduce shedding at home.",
        11,
        _photo("photo-1543466835-00a7907e9de1"),
    ),
    ServiceSpec(
        "paw-pad-care",
        "Paw Pad Care",
        "spa",
        15,
        180,
        "Pad clean, trim, and moisturising balm.",
        12,
        _photo("photo-1605897472359-85e4b94d685d"),
    ),
    ServiceSpec(
        "perfume-finish",
        "Perfume Finish",
        "add-ons",
        15,
        100,
        "Light pet-safe cologne after a bath or groom.",
        13,
        _photo("photo-1601758228041-f3b2795255f1"),
    ),
    ServiceSpec(
        "flea-tick-treatment",
        "Flea & Tick Treatment",
        "add-ons",
        20,
        350,
        "Topical flea and tick application after consultation.",
        14,
        _photo("photo-1551717743-49959800b1f6"),
    ),
)

PRODUCTS: tuple[ProductSpec, ...] = (
    ProductSpec(
        "pedigree-adult-10kg",
        "Pedigree Adult Dry Food",
        "Pedigree",
        ProductCategory.PET_FOOD,
        "10 kg",
        "1878.00",
        "Complete adult dog food with chicken and vegetables.",
        "23091000",
        "20",
        _photo("photo-1568640347023-a616a30bc3bd"),
    ),
    ProductSpec(
        "pedigree-puppy-3kg",
        "Pedigree Puppy Dry Food",
        "Pedigree",
        ProductCategory.PET_FOOD,
        "3 kg",
        "720.00",
        "Puppy formula for growth and immunity.",
        "23091000",
        "20",
        _photo("photo-1541364983171-a8ba01e95cfc"),
    ),
    ProductSpec(
        "royal-canin-mini-adult-4kg",
        "Royal Canin Mini Adult",
        "Royal Canin",
        ProductCategory.PET_FOOD,
        "4 kg",
        "2450.00",
        "Breed-size nutrition for small adult dogs.",
        "23091000",
        "12",
        _photo("photo-1598133894008-61f7fdb8cc3a"),
    ),
    ProductSpec(
        "whiskas-adult-1-2kg",
        "Whiskas Adult Cat Food",
        "Whiskas",
        ProductCategory.PET_FOOD,
        "1.2 kg",
        "380.00",
        "Everyday dry food for adult cats.",
        "23091000",
        "24",
        _photo("photo-1574158622682-e40e69881006"),
    ),
    ProductSpec(
        "drools-adult-3kg",
        "Drools Adult Dog Food",
        "Drools",
        ProductCategory.PET_FOOD,
        "3 kg",
        "499.00",
        "Balanced adult dog food for daily feeding.",
        "23091000",
        "20",
        _photo("photo-1589923188900-85dae523342b"),
    ),
    ProductSpec(
        "wanpy-duck-broth-50g",
        "Wanpy Duck Broth Treat",
        "Wanpy",
        ProductCategory.PET_FOOD,
        "50 g",
        "60.00",
        "Savoury duck broth pouch for dogs.",
        "23091000",
        "40",
        _photo("photo-1601758123927-4f7acc7da589"),
    ),
    ProductSpec(
        "moochie-tuna-broth-50g",
        "Moochie Creamy Broth — Tuna",
        "Moochie",
        ProductCategory.PET_FOOD,
        "50 g",
        "50.00",
        "Creamy tuna bonito broth treat.",
        "23091000",
        "40",
        _photo("photo-1612532275214-e4ca76d0e4d1"),
    ),
    ProductSpec(
        "pedigree-dentastix-medium",
        "Pedigree Dentastix (Medium)",
        "Pedigree",
        ProductCategory.PET_FOOD,
        "7 sticks",
        "180.00",
        "Daily dental chew for medium dogs.",
        "23091000",
        "30",
        _photo("photo-1601758003122-53c40e686a19"),
    ),
    ProductSpec(
        "nylon-leash-medium",
        "Nylon Dog Leash — Medium",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "349.00",
        "Sturdy medium leash with a comfortable grip.",
        "42010000",
        "15",
        _photo("photo-1530281700549-e82e7bf110d6"),
    ),
    ProductSpec(
        "adjustable-collar-medium",
        "Adjustable Dog Collar — Medium",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "249.00",
        "Adjustable nylon collar with a secure buckle.",
        "42010000",
        "15",
        _photo("photo-1544568100-847a948585b9"),
    ),
    ProductSpec(
        "rubber-chew-toy",
        "Rubber Chew Toy",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "199.00",
        "Durable rubber chew for everyday play.",
        "39269099",
        "18",
        _photo("photo-1558788353-f76d92427f16"),
    ),
    ProductSpec(
        "steel-bowl-medium",
        "Stainless Steel Bowl — Medium",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "229.00",
        "Rust-resistant feeding bowl for dogs and cats.",
        "73239390",
        "16",
        _photo("photo-1596492784531-6e6eb5ea9993"),
    ),
    ProductSpec(
        "cat-litter-5kg",
        "Cat Litter",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "5 kg",
        "449.00",
        "Clumping litter with odour control.",
        "25081000",
        "14",
        _photo("photo-1511044568932-338cba0ad803"),
    ),
    ProductSpec(
        "cat-scratching-post-mini",
        "Cat Scratching Post (Mini)",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "799.00",
        "Compact sisal post for indoor cats.",
        "44219990",
        "8",
        _photo("photo-1513364776144-60967b0f800f"),
    ),
    ProductSpec(
        "grooming-brush",
        "Pet Grooming Brush",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "199.00",
        "Slicker brush for daily de-shedding at home.",
        "96032900",
        "18",
        _photo("photo-1516734212186-a967f81ad0d7"),
    ),
    ProductSpec(
        "gentle-pet-shampoo-200ml",
        "Pet Shampoo — Gentle",
        "Sanket Pet Shop",
        ProductCategory.PET_SUPPLIES,
        "200 ml",
        "249.00",
        "Mild, tear-free shampoo for regular baths.",
        "33051090",
        "16",
        _photo("photo-1556228578-0d85b1a4d571"),
    ),
)

CANCELLATION_POLICY = (
    "Free cancellation up to 24 hours before your appointment. "
    "Late cancellations or no-shows may incur a fee of 50% of the service price."
)

BUSINESS_HOURS: tuple[tuple[int, time, time, bool], ...] = (
    (0, time(9, 0), time(19, 0), True),
    (1, time(9, 0), time(19, 0), True),
    (2, time(9, 0), time(19, 0), True),
    (3, time(9, 0), time(19, 0), True),
    (4, time(9, 0), time(19, 0), True),
    (5, time(9, 0), time(19, 0), True),
    (6, time(10, 0), time(17, 0), True),
)

ABOUT = (
    "Sanket Pet Shop is your neighbourhood stop for pet grooming and everyday supplies. "
    "Book a bath or full groom, then pick up food, treats, and accessories for dogs and cats."
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
        defaults={"about": ABOUT},
    )
    updates: list[str] = []
    if not profile.about:
        profile.about = ABOUT
        updates.append("about")
    if not profile.cancellation_policy:
        profile.cancellation_policy = CANCELLATION_POLICY
        updates.append("cancellation_policy")
    if updates:
        profile.save(update_fields=[*updates, "updated_at"])
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


def _enable_pets_pack(*, business: Business) -> bool:
    updated = BusinessProductSubscription.objects.filter(
        tenant=business.tenant,
        business=business,
        product_code="shopie",
        pets_pack_enabled=False,
    ).update(pets_pack_enabled=True)
    return bool(updated)


def _ensure_categories(*, business: Business) -> dict[str, ServiceCategory]:
    mapping: dict[str, ServiceCategory] = {}
    for spec in CATEGORIES:
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
    for spec in SERVICES:
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
                "loyalty_points_earn": 10,
            },
        )
        if not created:
            service.name = spec.name
            service.display_name = spec.name
            service.short_description = spec.description
            service.description = spec.description
            service.category = category
            service.status = ServiceStatus.ACTIVE
            service.visibility = ServiceVisibility.PUBLIC
            service.online_booking_enabled = True
            service.display_order = spec.display_order
            service.loyalty_points_earn = 10
            service.save(
                update_fields=[
                    "name",
                    "display_name",
                    "short_description",
                    "description",
                    "category",
                    "status",
                    "visibility",
                    "online_booking_enabled",
                    "display_order",
                    "loyalty_points_earn",
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
                currency=business.currency or "INR",
                base_price=spec.price,
                is_default=True,
            )
        else:
            pricing.base_price = spec.price
            pricing.currency = business.currency or "INR"
            pricing.save(update_fields=["base_price", "currency", "updated_at"])
        services[spec.code] = service
    return services


def _ensure_service_images(*, business: Business, services: dict[str, Service]) -> int:
    count = 0
    image_by_code = {spec.code: spec.image_url for spec in SERVICES}
    for code, service in services.items():
        image_url = image_by_code.get(code)
        if not image_url:
            continue
        checksum = f"sanket-pet-shop-service-{code}"
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
                "storage_path": f"sanket-pet-shop/services/{code}.jpg",
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


def _ensure_staff(*, business: Business, services: dict[str, Service]) -> list[Staff]:
    staff_rows = list(
        Staff.objects.filter(
            tenant=business.tenant,
            business=business,
            employment_status=EmploymentStatus.ACTIVE,
            is_bookable=True,
        )
    )
    if not staff_rows:
        owner = getattr(business.tenant, "owner", None)
        first_name = getattr(owner, "first_name", "") or "Sanket"
        last_name = getattr(owner, "last_name", "") or "Pathak"
        display_name = f"{first_name} {last_name}".strip()
        staff, _ = Staff.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            staff_code="sanket",
            defaults={
                "user": owner if getattr(owner, "id", None) else None,
                "first_name": first_name,
                "last_name": last_name,
                "display_name": display_name,
                "email": getattr(owner, "email", "") or "",
                "designation": "Head Groomer",
                "department": "Grooming",
                "employment_status": EmploymentStatus.ACTIVE,
                "is_bookable": True,
            },
        )
        staff_rows = [staff]
    for staff in staff_rows:
        for weekday, opening, closing, is_open in BUSINESS_HOURS:
            if not is_open:
                continue
            StaffWeeklySchedule.objects.get_or_create(
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
        for service in services.values():
            StaffServiceAssignment.objects.update_or_create(
                tenant=business.tenant,
                staff=staff,
                service=service,
                defaults={"is_active_assignment": True, "priority": 0},
            )
    return staff_rows


def _ensure_products(*, business: Business) -> list[ShopProduct]:
    catalog = CatalogService()
    products: list[ShopProduct] = []
    for spec in PRODUCTS:
        existing = ShopProduct.objects.filter(
            tenant=business.tenant,
            business=business,
            sku=spec.sku,
        ).first()
        payload = {
            "sku": spec.sku,
            "name": spec.name,
            "brand": spec.brand,
            "description": spec.description,
            "status": ProductStatus.ACTIVE,
            "price": spec.price,
            "gst_rate": "18",
            "tax_rate": "18",
            "hsn_sac": spec.hsn_sac,
            "currency": business.currency or "INR",
            "pack_size": spec.pack_size,
            "image_url": spec.image_url,
            "category": spec.category,
            "low_stock_threshold": "3",
            "metadata": {
                "tax_inclusive": True,
                "images": {"gallery": [spec.image_url], "front": spec.image_url},
            },
        }
        if existing is None:
            product = catalog.create_product(
                tenant=business.tenant,
                business=business,
                data={**payload, "stock_on_hand": spec.stock},
            )
        else:
            product = catalog.update_product(
                tenant=business.tenant,
                business=business,
                product=existing,
                data=payload,
            )
        products.append(product)
    return products


@transaction.atomic
def seed_sanket_pet_shop(*, flavor_key: str = FLAVOR_KEY) -> dict[str, Any]:
    profile, business = _resolve_business(flavor_key=flavor_key)
    _ensure_business_profile(business=business)
    _ensure_business_hours(business=business)
    pets_pack = _enable_pets_pack(business=business)
    categories = _ensure_categories(business=business)
    services = _ensure_services(business=business, categories=categories)
    images = _ensure_service_images(business=business, services=services)
    staff = _ensure_staff(business=business, services=services)
    products = _ensure_products(business=business)
    return {
        "flavor_key": profile.flavor_key,
        "tenant_slug": business.tenant.slug,
        "business_code": business.business_code,
        "business_name": business.display_name,
        "categories": len(categories),
        "services": len(services),
        "service_images": images,
        "staff": len(staff),
        "products": len(products),
        "pets_pack_enabled": pets_pack
        or BusinessProductSubscription.objects.filter(
            tenant=business.tenant,
            business=business,
            product_code="shopie",
            pets_pack_enabled=True,
        ).exists(),
    }
