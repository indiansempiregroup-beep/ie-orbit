from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.utils import timezone
from PIL import Image

from apps.authentication.constants import DEFAULT_OWNER_ROLE_CODE
from apps.authentication.models import Role, User, UserStatus
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
    BusinessProfile,
    WhiteLabelProfile,
)
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.product_billing import ProductBillingService
from apps.businesses.services.white_label import ensure_white_label_profile
from apps.customers.models import Customer, CustomerStatus
from apps.platform_media.models import Media, MediaFolderType, MediaVisibility, StorageProviderType
from apps.platform_media.services import MediaService
from apps.services.models import (
    Service,
    ServiceCategory,
    ServiceDuration,
    ServiceImage,
    ServicePricing,
    ServiceStatus,
    ServiceVisibility,
)
from apps.shopie.models import (
    FulfillmentMode,
    ProductCategory,
    ProductStatus,
    ShopCoupon,
    ShopDeliveryZone,
    ShopOrder,
    ShopPet,
    ShopProduct,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.coupons import CouponService
from apps.shopie.services.orders import DELIVERY_METHOD_STANDARD, OrderService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.zones import DeliveryZoneService
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment
from apps.tenancy.models import Branding, Organization, Tenant
from apps.tenancy.repositories.tenancy import TenantRepository

UNSPLASH = "https://images.unsplash.com"
DEMO_TZ = ZoneInfo("Asia/Kolkata")
SEED_TAG = "demo_retail_pair"

PET_OWNER_EMAIL = "demo-pet-owner@ieorbit.local"
PET_OWNER_PASSWORD = "DemoPetPass123!"
ANTIQUE_OWNER_EMAIL = "demo-antique-owner@ieorbit.local"
ANTIQUE_OWNER_PASSWORD = "DemoAntiquePass123!"

PET_TENANT_SLUG = "demo-paws-whiskers"
PET_DISPLAY_NAME = "Paws & Whiskers"
PET_PRIMARY = "#0F766E"
PET_SECONDARY = "#111827"

ANTIQUE_TENANT_SLUG = "demo-heritage-antiques"
ANTIQUE_DISPLAY_NAME = "Heritage Antiques"
ANTIQUE_PRIMARY = "#92400E"
ANTIQUE_SECONDARY = "#1C1917"

BUSINESS_CODE = "MAIN"


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


@dataclass(frozen=True)
class StaffSpec:
    code: str
    first_name: str
    last_name: str
    designation: str
    department: str


PET_CATEGORIES: tuple[CategorySpec, ...] = (
    CategorySpec("Bathing", "bathing", 1),
    CategorySpec("Grooming", "grooming", 2),
    CategorySpec("Spa & Hygiene", "spa", 3),
    CategorySpec("Add-ons", "add-ons", 4),
)

PET_SERVICES: tuple[ServiceSpec, ...] = (
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

PET_PRODUCTS: tuple[ProductSpec, ...] = (
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
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
        "Paws & Whiskers",
        ProductCategory.PET_SUPPLIES,
        "200 ml",
        "249.00",
        "Mild, tear-free shampoo for regular baths.",
        "33051090",
        "16",
        _photo("photo-1556228578-0d85b1a4d571"),
    ),
    ProductSpec(
        "ortho-pet-bed-medium",
        "Orthopedic Pet Bed — Medium",
        "Paws & Whiskers",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "1499.00",
        "Memory-foam bed for joint comfort.",
        "94049000",
        "10",
        _photo("photo-1548199973-03cce0bbc87b"),
    ),
    ProductSpec(
        "travel-carrier-small",
        "Pet Travel Carrier — Small",
        "Paws & Whiskers",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "1299.00",
        "Ventilated soft-side carrier for short trips.",
        "42029200",
        "8",
        _photo("photo-1450778869180-41d0601e046e"),
    ),
    ProductSpec(
        "crystal-litter-scoop",
        "Crystal Litter Scoop",
        "Paws & Whiskers",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "149.00",
        "Durable scoop for clumping litter.",
        "39249090",
        "22",
        _photo("photo-1511044568932-338cba0ad803"),
    ),
    ProductSpec(
        "interactive-feather-wand",
        "Interactive Feather Wand",
        "Paws & Whiskers",
        ProductCategory.PET_SUPPLIES,
        "1 pc",
        "179.00",
        "Teaser wand for indoor cat play.",
        "95030099",
        "25",
        _photo("photo-1514888286974-6c03e2ca1dba"),
    ),
)

ANTIQUE_PRODUCTS: tuple[ProductSpec, ...] = (
    ProductSpec(
        "brass-ganesha-idol",
        "Brass Ganesha Idol",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "4200.00",
        "Hand-cast brass Ganesha with aged patina.",
        "74199990",
        "4",
        _photo("photo-1578662996442-48f60103fc96"),
    ),
    ProductSpec(
        "teak-side-table",
        "Teak Side Table",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "12500.00",
        "Restored mid-century teak side table.",
        "94036000",
        "2",
        _photo("photo-1538688525198-9b88f6f53126"),
    ),
    ProductSpec(
        "mantel-clock-mahogany",
        "Mahogany Mantel Clock",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "8900.00",
        "Wind-up mantel clock in mahogany case.",
        "91052100",
        "3",
        _photo("photo-1563861826100-9cb868fdbe1c"),
    ),
    ProductSpec(
        "silver-photo-frame",
        "Sterling Silver Photo Frame",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "3100.00",
        "Hallmarked silver frame, 5×7 inch.",
        "71141100",
        "6",
        _photo("photo-1555041469-a586c61ea9bc"),
    ),
    ProductSpec(
        "blue-willow-platter",
        "Blue Willow Platter",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "2800.00",
        "Vintage blue willow serving platter.",
        "69111000",
        "5",
        _photo("photo-1578749556568-bc2c40e68b61"),
    ),
    ProductSpec(
        "rosewood-writing-desk",
        "Rosewood Writing Desk",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "28500.00",
        "Victorian-style rosewood writing desk with drawers.",
        "94033000",
        "1",
        _photo("photo-1493663284031-b7e3aefcae8e"),
    ),
    ProductSpec(
        "brass-oil-lamp",
        "Brass Oil Lamp",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "1650.00",
        "Traditional brass diya with engraved base.",
        "74199990",
        "8",
        _photo("photo-1605649487212-47bdab064df7"),
    ),
    ProductSpec(
        "porcelain-tea-set",
        "Porcelain Tea Set (6 cups)",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 set",
        "5400.00",
        "Hand-painted porcelain cups and saucers.",
        "69111000",
        "3",
        _photo("photo-1544787219-7f47ccb76574"),
    ),
    ProductSpec(
        "carved-wall-mirror",
        "Carved Wooden Wall Mirror",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "7200.00",
        "Ornate carved frame with bevelled glass.",
        "70099200",
        "2",
        _photo("photo-1618220179428-22790b461013"),
    ),
    ProductSpec(
        "copper-water-vessel",
        "Hammered Copper Vessel",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "3900.00",
        "Large hammered copper storage vessel.",
        "74181900",
        "4",
        _photo("photo-1586023492125-27b2c045efd7"),
    ),
    ProductSpec(
        "vintage-trunk-chest",
        "Vintage Travel Trunk",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "9800.00",
        "Leather-trimmed wooden travel trunk.",
        "42021200",
        "2",
        _photo("photo-1555041469-a586c61ea9bc"),
    ),
    ProductSpec(
        "ivory-inlay-box",
        "Bone-Inlay Jewellery Box",
        "Heritage Antiques",
        ProductCategory.OTHER,
        "1 pc",
        "4500.00",
        "Decorative inlay box with velvet lining.",
        "44209090",
        "5",
        _photo("photo-1565193566173-7a0ee3dbe261"),
    ),
    ProductSpec(
        "gramophone-horn",
        "Decorative Gramophone Horn",
        "Heritage Antiques",
        ProductCategory.OTHER,
        "1 pc",
        "11200.00",
        "Display gramophone with brass horn.",
        "85198100",
        "1",
        _photo("photo-1511379938547-c1f69419868d"),
    ),
    ProductSpec(
        "marble-chess-set",
        "Marble Chess Set",
        "Heritage Antiques",
        ProductCategory.OTHER,
        "1 set",
        "6800.00",
        "Hand-carved marble chess pieces with board.",
        "95049090",
        "3",
        _photo("photo-1586165368502-1bad197a6461"),
    ),
    ProductSpec(
        "embroidered-wall-hanging",
        "Embroidered Wall Hanging",
        "Heritage Antiques",
        ProductCategory.APPAREL,
        "1 pc",
        "2400.00",
        "Vintage embroidered textile wall piece.",
        "63049900",
        "4",
        _photo("photo-1558618666-fcd25c85cd64"),
    ),
    ProductSpec(
        "cast-iron-candle-stand",
        "Cast Iron Candle Stand",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "1800.00",
        "Heavy cast-iron candlestick pair.",
        "83062990",
        "6",
        _photo("photo-1602874801007-e610e4b2e4f9"),
    ),
    ProductSpec(
        "sandalwood-carving",
        "Sandalwood Figurine",
        "Heritage Antiques",
        ProductCategory.OTHER,
        "1 pc",
        "5600.00",
        "Fine sandalwood carved figurine.",
        "44201000",
        "3",
        _photo("photo-1578662996442-48f60103fc96"),
    ),
    ProductSpec(
        "antique-bookshelf",
        "Antique Open Bookshelf",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "18900.00",
        "Tall open bookshelf in dark-stained hardwood.",
        "94036000",
        "1",
        _photo("photo-1594620302200-9a762244a156"),
    ),
    ProductSpec(
        "crystal-decanter",
        "Cut Crystal Decanter",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pc",
        "3700.00",
        "Cut-glass crystal decanter with stopper.",
        "70133700",
        "4",
        _photo("photo-1514362545857-3bc16c4c7d1b"),
    ),
    ProductSpec(
        "brass-bell-pair",
        "Temple Brass Bell Pair",
        "Heritage Antiques",
        ProductCategory.HOUSEHOLD,
        "1 pair",
        "2200.00",
        "Hand-tuned brass bells on wooden base.",
        "74199990",
        "7",
        _photo("photo-1605649487212-47bdab064df7"),
    ),
)

PET_STAFF: tuple[StaffSpec, ...] = (
    StaffSpec("priya", "Priya", "Mehta", "Head Groomer", "Grooming"),
    StaffSpec("arjun", "Arjun", "Desai", "Groomer", "Grooming"),
    StaffSpec("neha", "Neha", "Kulkarni", "Spa Specialist", "Spa"),
)

PET_ABOUT = (
    "Paws & Whiskers is your neighbourhood stop for pet grooming and everyday supplies. "
    "Book a bath or full groom, then pick up food, treats, and accessories for dogs and cats."
)
PET_CANCELLATION = (
    "Free cancellation up to 24 hours before your appointment. "
    "Late cancellations or no-shows may incur a fee of 50% of the service price."
)
ANTIQUE_ABOUT = (
    "Heritage Antiques curates restored furniture, brassware, clocks, and decorative pieces "
    "for collectors and home stylists across Pune."
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

PET_LOGO_URL = _photo("photo-1587300003388-59208cc962cb")
ANTIQUE_LOGO_URL = _photo("photo-1493663284031-b7e3aefcae8e")


def _fallback_jpeg_bytes(*, color: tuple[int, int, int] = (146, 64, 14)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (512, 512), color).save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def _fetch_image_bytes(url: str) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": "IE-Orbit demo retail pair seed",
            "Accept": "image/jpeg,image/webp,image/png,image/*;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            payload = response.read()
    except (HTTPError, URLError, TimeoutError, OSError):
        return _fallback_jpeg_bytes()
    if not payload:
        return _fallback_jpeg_bytes()
    return payload


def _image_upload_name(filename: str, payload: bytes) -> tuple[str, str]:
    stem = Path(filename).stem
    if payload.startswith(b"\xff\xd8\xff"):
        return f"{stem}.jpg", "image/jpeg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return f"{stem}.png", "image/png"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return f"{stem}.webp", "image/webp"
    return f"{stem}.jpg", "image/jpeg"


def _is_platform_media_url(url: str) -> bool:
    return "/api/v1/media/" in (url or "").strip()


def _is_placeholder_media(media: Media | None) -> bool:
    if media is None:
        return True
    if media.storage_provider in {StorageProviderType.S3, "r2"}:
        return False
    public_url = str((media.metadata or {}).get("public_url") or "")
    if _is_platform_media_url(public_url):
        return False
    return not str(media.storage_path or "").startswith("tenants/")


def _media_file_url(media: Media) -> str:
    return str((media.metadata or {}).get("public_url") or f"/api/v1/media/{media.id}/file")


def _upload_catalog_image(
    *,
    business: Business,
    source_url: str,
    filename: str,
    folder_type: str,
    tags: list[str],
    display_name: str,
) -> Media:
    payload = _fetch_image_bytes(source_url)
    name, content_type = _image_upload_name(filename, payload)
    uploaded = SimpleUploadedFile(name, payload, content_type=content_type)
    result = MediaService().upload(
        uploaded_file=uploaded,
        tenant=business.tenant,
        business=business,
        uploaded_by=getattr(business.tenant, "owner", None),
        folder_type=folder_type,
        visibility=MediaVisibility.PUBLIC,
        tags=tags,
        display_name=display_name,
    )
    return result.media


def _replace_placeholder_media(*, previous: Media | None, replacement: Media) -> None:
    if previous is None or previous.id == replacement.id:
        return
    if not _is_placeholder_media(previous):
        return
    if ServiceImage.objects.filter(media=previous).exists():
        return
    previous.soft_delete()


def _ensure_owner(
    *,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
) -> User:
    normalized = email.strip().lower()
    user = User.objects.filter(email__iexact=normalized).first()
    if user is None:
        user = User.objects.create_user(
            email=normalized,
            password=password,
            status=UserStatus.ACTIVE,
            first_name=first_name,
            last_name=last_name,
            email_verified_at=timezone.now(),
        )
    else:
        updates: list[str] = []
        if user.status != UserStatus.ACTIVE:
            user.status = UserStatus.ACTIVE
            updates.append("status")
        if not user.email_verified_at:
            user.email_verified_at = timezone.now()
            updates.append("email_verified_at")
        if user.first_name != first_name:
            user.first_name = first_name
            updates.append("first_name")
        if user.last_name != last_name:
            user.last_name = last_name
            updates.append("last_name")
        if updates:
            updates.append("updated_at")
            user.save(update_fields=updates)
        user.set_password(password)
        user.save(update_fields=["password", "updated_at"])
    if not Role.objects.filter(code=DEFAULT_OWNER_ROLE_CODE).exists():
        raise ValueError(f"Role {DEFAULT_OWNER_ROLE_CODE!r} is missing. Run migrations before seeding.")
    RoleService().assign_role(user=user, role_code=DEFAULT_OWNER_ROLE_CODE, assigned_by=None)
    return user


def _ensure_subscription(*, business: Business, product_code: str) -> BusinessProductSubscription:
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
    return subscription


def _ensure_business(
    *,
    owner: User,
    tenant_slug: str,
    display_name: str,
    primary_color: str,
    secondary_color: str,
    product_codes: tuple[str, ...],
    selected_product: str,
    industry_category: str,
) -> Business:
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if tenant is None:
        tenant = Tenant.objects.create(
            slug=tenant_slug,
            display_name=display_name,
            owner=owner,
            timezone="Asia/Kolkata",
            currency="INR",
            primary_color=primary_color,
            secondary_color=secondary_color,
        )
        TenantRepository().ensure_foundation_records(tenant)
    else:
        tenant.display_name = display_name
        tenant.owner = owner
        tenant.timezone = "Asia/Kolkata"
        tenant.currency = "INR"
        tenant.primary_color = primary_color
        tenant.secondary_color = secondary_color
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
        app_name=display_name,
        primary_color=primary_color,
        secondary_color=secondary_color,
        accent_color=primary_color,
        white_label_enabled=True,
    )

    organization = Organization.objects.filter(tenant=tenant).first()
    if organization is None:
        organization = Organization.objects.create(tenant=tenant, name=display_name)
    elif organization.name != display_name:
        organization.name = display_name
        organization.save(update_fields=["name", "updated_at"])

    business = Business.objects.filter(tenant=tenant, business_code=BUSINESS_CODE).first()
    service = BusinessService()
    if business is None:
        business = Business(
            tenant=tenant,
            organization=organization,
            business_code=BUSINESS_CODE,
            business_name=display_name,
            display_name=display_name,
            timezone="Asia/Kolkata",
            currency="INR",
            industry_category=industry_category,
            email=owner.email,
            city="Pune",
            state="Maharashtra",
            country="India",
            postal_code="411001",
            address_line1="12 MG Road",
        )
        business.mark_created(actor_id=owner.id)
        business.save()
        service.ensure_foundation_records(business)
    else:
        business.display_name = display_name
        business.business_name = display_name
        business.industry_category = industry_category
        business.email = owner.email
        business.save(
            update_fields=[
                "display_name",
                "business_name",
                "industry_category",
                "email",
                "updated_at",
            ]
        )
        service.ensure_foundation_records(business)

    for product_code in product_codes:
        _ensure_subscription(business=business, product_code=product_code)
    if business.selected_product != selected_product:
        business.selected_product = selected_product
        business.save(update_fields=["selected_product", "updated_at"])
    return business


def _apply_branding(
    *,
    business: Business,
    display_name: str,
    primary_color: str,
    secondary_color: str,
    build_tag: str,
) -> WhiteLabelProfile:
    profile = ensure_white_label_profile(business=business)
    profile.flavor_key = f"{business.tenant.slug}-{BUSINESS_CODE}"
    profile.app_slug = business.tenant.slug
    profile.app_name = display_name
    profile.primary_color = primary_color
    profile.secondary_color = secondary_color
    profile.accent_color = primary_color
    profile.white_label_enabled = True
    profile.build_metadata = {"demo_retail_pair": True, "tag": build_tag}
    profile.save()
    return profile


def _ensure_logo(*, business: Business, profile: WhiteLabelProfile, source_url: str, filename: str) -> str:
    if business.logo and _is_platform_media_url(business.logo) and profile.logo == business.logo:
        return business.logo
    media = _upload_catalog_image(
        business=business,
        source_url=source_url,
        filename=filename,
        folder_type=MediaFolderType.BRANDING,
        tags=["branding", "logo"],
        display_name=f"{business.display_name} logo",
    )
    logo_url = _media_file_url(media)
    if business.logo != logo_url:
        business.logo = logo_url
        business.save(update_fields=["logo", "updated_at"])
    if profile.logo != logo_url:
        profile.logo = logo_url
        profile.save(update_fields=["logo", "updated_at"])
    Branding.objects.filter(tenant=business.tenant).update(logo=logo_url)
    return logo_url


def _ensure_branch(*, business: Business) -> Branch:
    branch, _ = Branch.objects.update_or_create(
        tenant=business.tenant,
        business=business,
        branch_code="main",
        defaults={
            "branch_name": "Main",
            "display_name": "Main",
            "is_primary": True,
            "email": business.email or f"hello@{business.tenant.slug}.example",
            "phone_number": "+91 90000 40001",
            "address_line1": business.address_line1 or "12 MG Road",
            "city": business.city or "Pune",
            "state": business.state or "Maharashtra",
            "country": business.country or "India",
            "postal_code": business.postal_code or "411001",
            "timezone": "Asia/Kolkata",
            "status": BranchStatus.ACTIVE,
            "is_active": True,
        },
    )
    return branch


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


def _ensure_business_profile(*, business: Business, about: str, cancellation_policy: str = "") -> BusinessProfile:
    profile, _ = BusinessProfile.objects.get_or_create(
        tenant=business.tenant,
        business=business,
        defaults={"about": about, "cancellation_policy": cancellation_policy},
    )
    updates: list[str] = []
    if profile.about != about:
        profile.about = about
        updates.append("about")
    if cancellation_policy and profile.cancellation_policy != cancellation_policy:
        profile.cancellation_policy = cancellation_policy
        updates.append("cancellation_policy")
    if updates:
        profile.save(update_fields=[*updates, "updated_at"])
    return profile


def _ensure_categories(*, business: Business, specs: tuple[CategorySpec, ...]) -> dict[str, ServiceCategory]:
    mapping: dict[str, ServiceCategory] = {}
    for spec in specs:
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
    specs: tuple[ServiceSpec, ...],
) -> dict[str, Service]:
    services: dict[str, Service] = {}
    for spec in specs:
        category = categories.get(spec.category_slug)
        service, _ = Service.objects.update_or_create(
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


def _ensure_service_images(*, business: Business, services: dict[str, Service], specs: tuple[ServiceSpec, ...]) -> int:
    count = 0
    image_by_code = {spec.code: spec.image_url for spec in specs}
    for code, service in services.items():
        source_url = image_by_code.get(code)
        if not source_url:
            continue
        existing = (
            ServiceImage.objects.filter(tenant=business.tenant, service=service, is_primary=True)
            .select_related("media")
            .first()
        )
        if existing and not _is_placeholder_media(existing.media):
            count += 1
            continue
        media = _upload_catalog_image(
            business=business,
            source_url=source_url,
            filename=f"{code}.jpg",
            folder_type="services",
            tags=["service", "image"],
            display_name=f"{service.display_name or service.name} image",
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
        _replace_placeholder_media(
            previous=existing.media if existing else None,
            replacement=media,
        )
        count += 1
    return count


def _ensure_pet_staff(*, business: Business, services: dict[str, Service], owner: User) -> list[Staff]:
    staff_rows: list[Staff] = []
    for index, spec in enumerate(PET_STAFF):
        linked_user = owner if index == 0 else None
        staff, _ = Staff.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            staff_code=spec.code,
            defaults={
                "user": linked_user,
                "first_name": spec.first_name,
                "last_name": spec.last_name,
                "display_name": f"{spec.first_name} {spec.last_name}",
                "email": owner.email if linked_user else f"{spec.code}@{business.tenant.slug}.example",
                "designation": spec.designation,
                "department": spec.department,
                "employment_status": EmploymentStatus.ACTIVE,
                "is_bookable": True,
                "is_active": True,
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
        for service in services.values():
            StaffServiceAssignment.objects.update_or_create(
                tenant=business.tenant,
                staff=staff,
                service=service,
                defaults={"is_active_assignment": True, "priority": 0},
            )
        staff_rows.append(staff)
    return staff_rows


def _product_image_url(*, business: Business, product: ShopProduct | None, spec: ProductSpec) -> str:
    if product is not None:
        if _is_platform_media_url(product.image_url):
            return product.image_url
        images = (product.metadata or {}).get("images") if isinstance(product.metadata, dict) else {}
        front = str((images or {}).get("front") or "")
        if _is_platform_media_url(front):
            return front
    media = _upload_catalog_image(
        business=business,
        source_url=spec.image_url,
        filename=f"{spec.sku}.jpg",
        folder_type="products",
        tags=["shop", "product", "image"],
        display_name=f"{spec.name} image",
    )
    return _media_file_url(media)


def _ensure_products(*, business: Business, specs: tuple[ProductSpec, ...]) -> list[ShopProduct]:
    catalog = CatalogService()
    products: list[ShopProduct] = []
    for spec in specs:
        existing = ShopProduct.objects.filter(
            tenant=business.tenant,
            business=business,
            sku=spec.sku,
        ).first()
        image_url = _product_image_url(business=business, product=existing, spec=spec)
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
            "image_url": image_url,
            "category": spec.category,
            "low_stock_threshold": "3",
            "metadata": {
                "tax_inclusive": True,
                "images": {"gallery": [image_url], "front": image_url},
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


@dataclass(frozen=True)
class CustomerSpec:
    code: str
    first_name: str
    last_name: str
    email: str
    phone: str


@dataclass(frozen=True)
class ZoneSpec:
    name: str
    cities: tuple[str, ...]
    postal_prefixes: tuple[str, ...]
    fee: str
    min_order_total: str
    same_day: bool
    instant_delivery_enabled: bool = False


@dataclass(frozen=True)
class CouponSpec:
    code: str
    name: str
    discount_type: str
    discount_value: str
    min_order_total: str = "0"
    description: str = ""


@dataclass(frozen=True)
class PetSpec:
    customer_code: str
    name: str
    species: str
    breed: str
    sex: str
    birthday: date


@dataclass(frozen=True)
class BookingSeedSpec:
    number_suffix: str
    day_offset: int
    hour: int
    minute: int
    status: str
    customer_code: str
    service_code: str
    staff_code: str


PET_CUSTOMERS: tuple[CustomerSpec, ...] = (
    CustomerSpec("cust-ananya", "Ananya", "Deshmukh", "ananya.deshmukh@example.com", "+91 90000 21001"),
    CustomerSpec("cust-rohan", "Rohan", "Kulkarni", "rohan.kulkarni@example.com", "+91 90000 21002"),
    CustomerSpec("cust-meera", "Meera", "Joshi", "meera.joshi@example.com", "+91 90000 21003"),
    CustomerSpec("cust-arjun", "Arjun", "Patil", "arjun.patil@example.com", "+91 90000 21004"),
)

ANTIQUE_CUSTOMERS: tuple[CustomerSpec, ...] = (
    CustomerSpec("cust-neha", "Neha", "Shah", "neha.shah@example.com", "+91 90000 22001"),
    CustomerSpec("cust-vikram", "Vikram", "Rao", "vikram.rao@example.com", "+91 90000 22002"),
    CustomerSpec("cust-diya", "Diya", "Banerjee", "diya.banerjee@example.com", "+91 90000 22003"),
)

DEMO_ZONES: tuple[ZoneSpec, ...] = (
    ZoneSpec("Pune City", ("Pune",), ("411", "412"), "49.00", "0", True, True),
    ZoneSpec("All India", (), (), "99.00", "500", False, False),
)

DEMO_COUPONS: tuple[CouponSpec, ...] = (
    CouponSpec("WELCOME10", "Welcome 10%", "percent", "10", "0", "10% off online orders"),
    CouponSpec("FLAT50", "Flat ₹50 off", "amount", "50", "299", "₹50 off orders over ₹299"),
    CouponSpec("FIRSTORDER", "First order 15%", "percent", "15", "0", "First online order only"),
)

PET_SPECS: tuple[PetSpec, ...] = (
    PetSpec("cust-ananya", "Bruno", "Dog", "Labrador", "male", date(2021, 3, 12)),
    PetSpec("cust-ananya", "Mochi", "Cat", "Persian", "female", date(2022, 7, 4)),
    PetSpec("cust-rohan", "Simba", "Dog", "Indie", "male", date(2020, 11, 20)),
    PetSpec("cust-meera", "Luna", "Cat", "Siamese", "female", date(2023, 1, 15)),
    PetSpec("cust-arjun", "Coco", "Dog", "Beagle", "female", date(2019, 5, 8)),
)

PET_BOOKINGS: tuple[BookingSeedSpec, ...] = (
    BookingSeedSpec("001", -5, 10, 0, BookingStatus.COMPLETED, "cust-ananya", "dog-bath-medium", "priya"),
    BookingSeedSpec("002", -3, 11, 30, BookingStatus.COMPLETED, "cust-rohan", "full-groom-small", "arjun"),
    BookingSeedSpec("003", -1, 15, 0, BookingStatus.CANCELLED, "cust-meera", "cat-bath", "neha"),
    BookingSeedSpec("004", 0, 10, 0, BookingStatus.CONFIRMED, "cust-ananya", "nail-trim", "priya"),
    BookingSeedSpec("005", 0, 14, 0, BookingStatus.PENDING, "cust-arjun", "dog-bath-large", "arjun"),
    BookingSeedSpec("006", 1, 11, 0, BookingStatus.CONFIRMED, "cust-meera", "ear-cleaning", "neha"),
    BookingSeedSpec("007", 2, 16, 0, BookingStatus.CONFIRMED, "cust-rohan", "de-shedding", "priya"),
    BookingSeedSpec("008", 3, 12, 30, BookingStatus.PENDING, "cust-ananya", "full-groom-medium", "arjun"),
)


def _ensure_customers(*, business: Business, specs: tuple[CustomerSpec, ...]) -> dict[str, Customer]:
    mapping: dict[str, Customer] = {}
    for spec in specs:
        customer, _ = Customer.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            customer_code=spec.code,
            defaults={
                "first_name": spec.first_name,
                "last_name": spec.last_name,
                "display_name": f"{spec.first_name} {spec.last_name}",
                "email": spec.email,
                "phone_number": spec.phone,
                "status": CustomerStatus.ACTIVE,
                "is_active": True,
                "source": SEED_TAG,
            },
        )
        mapping[spec.code] = customer
    return mapping


def _ensure_zones(*, business: Business) -> list[ShopDeliveryZone]:
    service = DeliveryZoneService()
    zones: list[ShopDeliveryZone] = []
    for spec in DEMO_ZONES:
        existing = ShopDeliveryZone.objects.filter(
            tenant=business.tenant,
            business=business,
            name=spec.name,
        ).first()
        payload = {
            "name": spec.name,
            "cities": list(spec.cities),
            "postal_prefixes": list(spec.postal_prefixes),
            "fee": spec.fee,
            "min_order_total": spec.min_order_total,
            "same_day": spec.same_day,
            "instant_delivery_enabled": spec.instant_delivery_enabled,
            "enabled": True,
            "notes": f"Seeded by {SEED_TAG}",
        }
        if existing is None:
            zones.append(service.create_zone(tenant=business.tenant, business=business, data=payload))
        else:
            zones.append(service.update_zone(zone=existing, data=payload))
    return zones


def _ensure_coupons(*, business: Business) -> list[ShopCoupon]:
    service = CouponService()
    coupons: list[ShopCoupon] = []
    for spec in DEMO_COUPONS:
        payload = {
            "code": spec.code,
            "name": spec.name,
            "description": spec.description,
            "discount_type": spec.discount_type,
            "discount_value": spec.discount_value,
            "min_order_total": spec.min_order_total,
            "is_active": True,
            "first_order_only": spec.code == "FIRSTORDER",
        }
        existing = ShopCoupon.objects.filter(
            tenant=business.tenant,
            business=business,
            code=spec.code,
        ).first()
        if existing is None:
            coupons.append(service.create_coupon(tenant=business.tenant, business=business, data=payload))
        else:
            coupons.append(service.update_coupon(coupon=existing, data=payload))
    return coupons


def _ensure_pets(*, business: Business, customers: dict[str, Customer]) -> list[ShopPet]:
    pets_service = PetsService()
    pets_service.require_pets_pack(tenant=business.tenant, business=business)
    rows: list[ShopPet] = []
    for spec in PET_SPECS:
        customer = customers.get(spec.customer_code)
        if customer is None:
            continue
        existing = ShopPet.objects.filter(
            tenant=business.tenant,
            business=business,
            customer=customer,
            name=spec.name,
        ).first()
        payload = {
            "name": spec.name,
            "species": spec.species,
            "breed": spec.breed,
            "sex": spec.sex,
            "birthday": spec.birthday,
            "metadata": {"seed": SEED_TAG},
        }
        if existing is None:
            rows.append(
                pets_service.create_pet(
                    tenant=business.tenant,
                    business=business,
                    customer=customer,
                    data=payload,
                )
            )
        else:
            rows.append(pets_service.update_pet(pet=existing, data=payload))
    return rows


def _ensure_bookings(
    *,
    business: Business,
    branch: Branch,
    customers: dict[str, Customer],
    services: dict[str, Service],
    staff_rows: list[Staff],
) -> int:
    staff_by_code = {staff.staff_code: staff for staff in staff_rows}
    local_today = timezone.now().astimezone(DEMO_TZ).date()
    count = 0
    for spec in PET_BOOKINGS:
        customer = customers.get(spec.customer_code)
        service = services.get(spec.service_code)
        staff = staff_by_code.get(spec.staff_code)
        if customer is None or service is None or staff is None:
            continue
        duration = service.durations.filter(is_default=True).first()
        minutes = int(duration.duration_minutes) if duration else 45
        day = local_today + timedelta(days=spec.day_offset)
        start_local = datetime(day.year, day.month, day.day, spec.hour, spec.minute, tzinfo=DEMO_TZ)
        end_local = start_local + timedelta(minutes=minutes)
        Booking.objects.update_or_create(
            tenant=business.tenant,
            booking_number=f"{business.tenant.slug}-BK-{spec.number_suffix}",
            defaults={
                "business": business,
                "branch": branch,
                "customer_id": customer.id,
                "staff_id": staff.id,
                "service_id": service.id,
                "appointment_date": day,
                "start_at": start_local.astimezone(dt_timezone.utc),
                "end_at": end_local.astimezone(dt_timezone.utc),
                "duration_minutes": minutes,
                "status": spec.status,
                "source": BookingSource.OPERATIONS_DASHBOARD,
                "channel": BookingChannel.WEB,
                "metadata": {"seed": SEED_TAG},
                "is_active": True,
            },
        )
        count += 1
    return count


def _ensure_orders(
    *,
    business: Business,
    products: list[ShopProduct],
    customers: dict[str, Customer],
    prefix: str,
) -> int:
    if not products:
        return 0
    customer_list = list(customers.values())
    if not customer_list:
        return 0
    order_service = OrderService()
    specs = (
        {
            "key": f"{prefix}-pos-1",
            "customer": customer_list[0],
            "mode": FulfillmentMode.POS,
            "lines": [{"product_id": products[0].id, "quantity": 1}],
            "payment_method": "upi",
            "coupon_code": "",
        },
        {
            "key": f"{prefix}-pickup-1",
            "customer": customer_list[1 % len(customer_list)],
            "mode": FulfillmentMode.PICKUP,
            "lines": [{"product_id": products[1 % len(products)].id, "quantity": 2}],
            "payment_method": "cash",
            "coupon_code": "WELCOME10",
        },
        {
            "key": f"{prefix}-delivery-1",
            "customer": customer_list[2 % len(customer_list)],
            "mode": FulfillmentMode.DELIVERY,
            "lines": [{"product_id": products[2 % len(products)].id, "quantity": 1}],
            "payment_method": "upi",
            "coupon_code": "FLAT50",
            "delivery": True,
        },
        {
            "key": f"{prefix}-pickup-2",
            "customer": customer_list[0],
            "mode": FulfillmentMode.PICKUP,
            "lines": [
                {"product_id": products[0].id, "quantity": 1},
                {"product_id": products[3 % len(products)].id, "quantity": 1},
            ],
            "payment_method": "cash",
            "coupon_code": "",
        },
    )
    created = 0
    for spec in specs:
        if ShopOrder.objects.filter(
            tenant=business.tenant,
            business=business,
            metadata__seed_key=spec["key"],
        ).exists():
            continue
        kwargs: dict[str, Any] = {
            "tenant": business.tenant,
            "business": business,
            "customer": spec["customer"],
            "fulfillment_mode": spec["mode"],
            "lines": spec["lines"],
            "confirm": True,
            "payment_method": spec["payment_method"],
            "metadata_extra": {"seed": SEED_TAG, "seed_key": spec["key"]},
        }
        if spec.get("coupon_code"):
            kwargs["coupon_code"] = spec["coupon_code"]
        if spec.get("delivery"):
            kwargs.update(
                {
                    "delivery_address": "12 Lane 5, Kalyani Nagar",
                    "delivery_city": "Pune",
                    "delivery_state": "Maharashtra",
                    "delivery_postal_code": "411006",
                    "delivery_method": DELIVERY_METHOD_STANDARD,
                }
            )
        order_service.create_order(**kwargs)
        created += 1
    return ShopOrder.objects.filter(
        tenant=business.tenant,
        business=business,
        metadata__seed=SEED_TAG,
    ).count()


def _seed_pet_shop() -> dict[str, Any]:
    owner = _ensure_owner(
        email=PET_OWNER_EMAIL,
        password=PET_OWNER_PASSWORD,
        first_name="Priya",
        last_name="Mehta",
    )
    business = _ensure_business(
        owner=owner,
        tenant_slug=PET_TENANT_SLUG,
        display_name=PET_DISPLAY_NAME,
        primary_color=PET_PRIMARY,
        secondary_color=PET_SECONDARY,
        product_codes=("appointie", "shopie"),
        selected_product="appointie",
        industry_category="pets",
    )
    profile = _apply_branding(
        business=business,
        display_name=PET_DISPLAY_NAME,
        primary_color=PET_PRIMARY,
        secondary_color=PET_SECONDARY,
        build_tag="pet",
    )
    logo = _ensure_logo(
        business=business,
        profile=profile,
        source_url=PET_LOGO_URL,
        filename="paws-whiskers-logo.jpg",
    )
    _ensure_business_profile(business=business, about=PET_ABOUT, cancellation_policy=PET_CANCELLATION)
    _ensure_business_hours(business=business)
    branch = _ensure_branch(business=business)
    BusinessProductSubscription.objects.filter(
        tenant=business.tenant,
        business=business,
        product_code="shopie",
    ).update(pets_pack_enabled=True)
    categories = _ensure_categories(business=business, specs=PET_CATEGORIES)
    services = _ensure_services(business=business, categories=categories, specs=PET_SERVICES)
    service_images = _ensure_service_images(business=business, services=services, specs=PET_SERVICES)
    staff = _ensure_pet_staff(business=business, services=services, owner=owner)
    products = _ensure_products(business=business, specs=PET_PRODUCTS)
    customers = _ensure_customers(business=business, specs=PET_CUSTOMERS)
    zones = _ensure_zones(business=business)
    coupons = _ensure_coupons(business=business)
    pets = _ensure_pets(business=business, customers=customers)
    bookings = _ensure_bookings(
        business=business,
        branch=branch,
        customers=customers,
        services=services,
        staff_rows=staff,
    )
    orders = _ensure_orders(
        business=business,
        products=products,
        customers=customers,
        prefix="pet",
    )
    return {
        "kind": "pet",
        "display_name": PET_DISPLAY_NAME,
        "owner_email": PET_OWNER_EMAIL,
        "owner_password": PET_OWNER_PASSWORD,
        "tenant_slug": business.tenant.slug,
        "business_code": business.business_code,
        "flavor_key": profile.flavor_key,
        "logo": logo,
        "products": len(products),
        "services": len(services),
        "service_images": service_images,
        "staff": len(staff),
        "customers": len(customers),
        "zones": len(zones),
        "coupons": len(coupons),
        "pets": len(pets),
        "bookings": bookings,
        "orders": orders,
        "subscriptions": ["appointie", "shopie"],
    }


def _seed_antique_shop() -> dict[str, Any]:
    owner = _ensure_owner(
        email=ANTIQUE_OWNER_EMAIL,
        password=ANTIQUE_OWNER_PASSWORD,
        first_name="Rohan",
        last_name="Kapoor",
    )
    business = _ensure_business(
        owner=owner,
        tenant_slug=ANTIQUE_TENANT_SLUG,
        display_name=ANTIQUE_DISPLAY_NAME,
        primary_color=ANTIQUE_PRIMARY,
        secondary_color=ANTIQUE_SECONDARY,
        product_codes=("shopie",),
        selected_product="shopie",
        industry_category="retail",
    )
    profile = _apply_branding(
        business=business,
        display_name=ANTIQUE_DISPLAY_NAME,
        primary_color=ANTIQUE_PRIMARY,
        secondary_color=ANTIQUE_SECONDARY,
        build_tag="antique",
    )
    logo = _ensure_logo(
        business=business,
        profile=profile,
        source_url=ANTIQUE_LOGO_URL,
        filename="heritage-antiques-logo.jpg",
    )
    _ensure_business_profile(business=business, about=ANTIQUE_ABOUT)
    _ensure_business_hours(business=business)
    _ensure_branch(business=business)
    products = _ensure_products(business=business, specs=ANTIQUE_PRODUCTS)
    customers = _ensure_customers(business=business, specs=ANTIQUE_CUSTOMERS)
    zones = _ensure_zones(business=business)
    coupons = _ensure_coupons(business=business)
    orders = _ensure_orders(
        business=business,
        products=products,
        customers=customers,
        prefix="antique",
    )
    return {
        "kind": "antique",
        "display_name": ANTIQUE_DISPLAY_NAME,
        "owner_email": ANTIQUE_OWNER_EMAIL,
        "owner_password": ANTIQUE_OWNER_PASSWORD,
        "tenant_slug": business.tenant.slug,
        "business_code": business.business_code,
        "flavor_key": profile.flavor_key,
        "logo": logo,
        "products": len(products),
        "services": 0,
        "service_images": 0,
        "staff": 0,
        "customers": len(customers),
        "zones": len(zones),
        "coupons": len(coupons),
        "pets": 0,
        "bookings": 0,
        "orders": orders,
        "subscriptions": ["shopie"],
    }


@transaction.atomic
def seed_demo_retail_pair() -> list[dict[str, Any]]:
    return [_seed_pet_shop(), _seed_antique_shop()]
