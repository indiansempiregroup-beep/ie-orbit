from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any
from zoneinfo import ZoneInfo

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.bookings.models import (
    Booking,
    BookingChannel,
    BookingReview,
    BookingSource,
    BookingStatus,
)
from apps.businesses.models import (
    Branch,
    BranchStatus,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    BusinessSettings,
)
from apps.businesses.services.mobile_demo_seed import seed_mobile_demo_for_flavor
from apps.businesses.services.pilot_seed import seed_pilot_white_label_profiles
from apps.businesses.services.product_billing import ProductBillingService
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerStatus
from apps.customers.services.loyalty import LoyaltyService
from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.models import Notification, NotificationChannel, NotificationStatus
from apps.services.models import Service, ServiceDuration
from apps.staff.models import EmploymentStatus, Staff
DEFAULT_FLAVOR_KEY = "demo-MAIN"
PILOT_OWNER_EMAIL = "pilot-owner@ieorbit.local"
DEMO_TZ = ZoneInfo("Asia/Kolkata")


@dataclass(frozen=True)
class DemoBranchSpec:
    code: str
    name: str
    address_line1: str
    city: str
    state: str
    postal_code: str
    phone: str
    is_primary: bool
    latitude: str
    longitude: str


@dataclass(frozen=True)
class DemoCustomerSpec:
    code: str
    first_name: str
    last_name: str
    email: str
    phone: str
    tags: tuple[str, ...]
    loyalty_points: int = 0


@dataclass(frozen=True)
class DemoBookingSpec:
    number: str
    day_offset: int
    hour: int
    minute: int
    status: str
    customer_code: str
    service_code: str
    staff_code: str
    branch_code: str
    source: str = BookingSource.OPERATIONS_DASHBOARD
    channel: str = BookingChannel.WEB
    notes: str = ""
    review_rating: int | None = None
    review_comment: str = ""


@dataclass(frozen=True)
class DemoNotificationSpec:
    seed_key: str
    subject: str
    body: str
    is_read: bool
    event_type: str
    hours_ago: int


DEMO_BRANCHES: tuple[DemoBranchSpec, ...] = (
    DemoBranchSpec(
        "kalyani-nagar",
        "Kalyani Nagar",
        "Lane 5, Kalyani Nagar",
        "Pune",
        "Maharashtra",
        "411006",
        "+91 98765 43210",
        True,
        "18.546300",
        "73.903300",
    ),
    DemoBranchSpec(
        "baner",
        "Baner",
        "Baner Road, Near Balewadi High Street",
        "Pune",
        "Maharashtra",
        "411045",
        "+91 98765 43211",
        False,
        "18.559000",
        "73.786800",
    ),
)

DEMO_CUSTOMERS: tuple[DemoCustomerSpec, ...] = (
    DemoCustomerSpec("cust-ananya", "Ananya", "Deshmukh", "ananya.deshmukh@example.com", "+91 90000 10001", ("vip", "color"), 420),
    DemoCustomerSpec("cust-rohan", "Rohan", "Kulkarni", "rohan.kulkarni@example.com", "+91 90000 10002", ("regular",), 180),
    DemoCustomerSpec("cust-meera", "Meera", "Joshi", "meera.joshi@example.com", "+91 90000 10003", ("bridal",), 860),
    DemoCustomerSpec("cust-arjun", "Arjun", "Patil", "arjun.patil@example.com", "+91 90000 10004", ("walk-in",), 40),
    DemoCustomerSpec("cust-isha", "Isha", "Nair", "isha.nair@example.com", "+91 90000 10005", ("regular", "skin"), 260),
    DemoCustomerSpec("cust-kabir", "Kabir", "Shah", "kabir.shah@example.com", "+91 90000 10006", ("new",), 0),
    DemoCustomerSpec("cust-sara", "Sara", "Khan", "sara.khan@example.com", "+91 90000 10007", ("vip",), 510),
    DemoCustomerSpec("cust-dev", "Dev", "Iyer", "dev.iyer@example.com", "+91 90000 10008", ("regular",), 95),
    DemoCustomerSpec("cust-neha", "Neha", "Gupta", "neha.gupta@example.com", "+91 90000 10009", ("color",), 300),
    DemoCustomerSpec("cust-vikram", "Vikram", "Rao", "vikram.rao@example.com", "+91 90000 10010", ("regular",), 150),
    DemoCustomerSpec("cust-priya-c", "Priya", "Chavan", "priya.chavan@example.com", "+91 90000 10011", ("new",), 20),
    DemoCustomerSpec("cust-aditi", "Aditi", "Menon", "aditi.menon@example.com", "+91 90000 10012", ("bridal", "vip"), 720),
)

# Mixed history + upcoming bookings for dashboard / calendar / BI screenshots.
DEMO_BOOKINGS: tuple[DemoBookingSpec, ...] = (
    DemoBookingSpec("DEMO-BK-001", -28, 10, 0, BookingStatus.COMPLETED, "cust-ananya", "hair-cut", "rupali", "kalyani-nagar", review_rating=5, review_comment="Perfect cut, loved it!"),
    DemoBookingSpec("DEMO-BK-002", -26, 11, 30, BookingStatus.COMPLETED, "cust-rohan", "blowout", "keiko", "baner", review_rating=4, review_comment="Great styling."),
    DemoBookingSpec("DEMO-BK-003", -24, 14, 0, BookingStatus.COMPLETED, "cust-meera", "bridal-trial", "rupali", "kalyani-nagar", review_rating=5, review_comment="Bridal trial was excellent."),
    DemoBookingSpec("DEMO-BK-004", -22, 12, 0, BookingStatus.CANCELLED, "cust-arjun", "hair-cut", "priya", "baner", notes="Customer cancelled — schedule conflict."),
    DemoBookingSpec("DEMO-BK-005", -20, 16, 0, BookingStatus.COMPLETED, "cust-isha", "facial-glow", "priya", "kalyani-nagar", review_rating=5, review_comment="Skin felt amazing."),
    DemoBookingSpec("DEMO-BK-006", -18, 10, 30, BookingStatus.NO_SHOW, "cust-kabir", "hair-cut", "keiko", "baner"),
    DemoBookingSpec("DEMO-BK-007", -16, 13, 0, BookingStatus.COMPLETED, "cust-sara", "highlights", "priya", "kalyani-nagar", review_rating=4, review_comment="Color turned out well."),
    DemoBookingSpec("DEMO-BK-008", -14, 11, 0, BookingStatus.COMPLETED, "cust-dev", "hair-cut", "rupali", "baner"),
    DemoBookingSpec("DEMO-BK-009", -12, 15, 30, BookingStatus.COMPLETED, "cust-neha", "hair-color-cut", "priya", "kalyani-nagar", review_rating=5, review_comment="Best color service in Pune."),
    DemoBookingSpec("DEMO-BK-010", -10, 9, 30, BookingStatus.COMPLETED, "cust-vikram", "blowout", "keiko", "baner"),
    DemoBookingSpec("DEMO-BK-011", -8, 12, 30, BookingStatus.COMPLETED, "cust-priya-c", "facial-glow", "rupali", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-012", -7, 14, 0, BookingStatus.COMPLETED, "cust-aditi", "bridal-trial", "rupali", "kalyani-nagar", review_rating=5, review_comment="Ready for the wedding look."),
    DemoBookingSpec("DEMO-BK-013", -6, 10, 0, BookingStatus.COMPLETED, "cust-ananya", "highlights", "priya", "baner"),
    DemoBookingSpec("DEMO-BK-014", -5, 11, 0, BookingStatus.COMPLETED, "cust-rohan", "hair-cut", "keiko", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-015", -4, 16, 30, BookingStatus.CANCELLED, "cust-meera", "blowout", "rupali", "baner"),
    DemoBookingSpec("DEMO-BK-016", -3, 13, 30, BookingStatus.COMPLETED, "cust-isha", "hair-cut", "priya", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-017", -2, 10, 0, BookingStatus.COMPLETED, "cust-sara", "facial-glow", "rupali", "baner"),
    DemoBookingSpec("DEMO-BK-018", -1, 15, 0, BookingStatus.COMPLETED, "cust-dev", "hair-color-cut", "priya", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-019", 0, 10, 0, BookingStatus.CONFIRMED, "cust-neha", "hair-cut", "rupali", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-020", 0, 11, 30, BookingStatus.CHECKED_IN, "cust-vikram", "blowout", "keiko", "baner"),
    DemoBookingSpec("DEMO-BK-021", 0, 14, 0, BookingStatus.PENDING, "cust-priya-c", "facial-glow", "priya", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-022", 0, 16, 0, BookingStatus.CONFIRMED, "cust-aditi", "highlights", "priya", "baner"),
    DemoBookingSpec("DEMO-BK-023", 1, 10, 30, BookingStatus.CONFIRMED, "cust-ananya", "hair-color-cut", "rupali", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-024", 1, 13, 0, BookingStatus.PENDING, "cust-kabir", "hair-cut", "keiko", "baner"),
    DemoBookingSpec("DEMO-BK-025", 2, 11, 0, BookingStatus.CONFIRMED, "cust-rohan", "blowout", "keiko", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-026", 2, 15, 30, BookingStatus.CONFIRMED, "cust-meera", "bridal-trial", "rupali", "baner"),
    DemoBookingSpec("DEMO-BK-027", 3, 10, 0, BookingStatus.PENDING, "cust-arjun", "hair-cut", "priya", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-028", 3, 14, 30, BookingStatus.CONFIRMED, "cust-isha", "facial-glow", "rupali", "baner"),
    DemoBookingSpec("DEMO-BK-029", 4, 12, 0, BookingStatus.CONFIRMED, "cust-sara", "highlights", "priya", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-030", 5, 11, 0, BookingStatus.PENDING, "cust-dev", "hair-cut", "keiko", "baner"),
    DemoBookingSpec("DEMO-BK-031", 6, 16, 0, BookingStatus.CONFIRMED, "cust-neha", "blowout", "rupali", "kalyani-nagar"),
    DemoBookingSpec("DEMO-BK-032", 7, 10, 0, BookingStatus.CONFIRMED, "cust-vikram", "hair-cut", "priya", "baner"),
)

DEMO_NOTIFICATIONS: tuple[DemoNotificationSpec, ...] = (
    DemoNotificationSpec(
        "demo-notif-new-booking",
        "New booking request",
        "Kabir Shah requested a Hair Cut for tomorrow.",
        False,
        "BookingCreated",
        1,
    ),
    DemoNotificationSpec(
        "demo-notif-checked-in",
        "Customer checked in",
        "Vikram Rao has checked in for Blowout & Styling.",
        False,
        "BookingCheckedIn",
        2,
    ),
    DemoNotificationSpec(
        "demo-notif-review",
        "New 5-star review",
        "Aditi Menon left a 5-star review for Bridal Makeup Trial.",
        False,
        "BookingReviewed",
        6,
    ),
    DemoNotificationSpec(
        "demo-notif-cancelled",
        "Booking cancelled",
        "Meera Joshi cancelled Blowout & Styling.",
        True,
        "BookingCancelled",
        20,
    ),
    DemoNotificationSpec(
        "demo-notif-reminder",
        "Today's schedule ready",
        "You have 4 appointments scheduled for today across both offices.",
        True,
        "DailyDigest",
        8,
    ),
    DemoNotificationSpec(
        "demo-notif-no-show",
        "No-show recorded",
        "Kabir Shah was marked as no-show for Hair Cut.",
        True,
        "BookingNoShow",
        72,
    ),
)


def _local_now() -> datetime:
    return timezone.now().astimezone(DEMO_TZ)


def _ensure_owner_role(*, owner: User) -> None:
    RoleService().assign_role(user=owner, role_code="business_owner")


def _ensure_subscription(*, business: Business) -> BusinessProductSubscription:
    billing = ProductBillingService()
    plan, plan_definition = billing.resolve_subscription_plan(
        product_code="appointie",
        plan_code="appointie-pro",
    )
    subscription = (
        BusinessProductSubscription.objects.filter(
            tenant=business.tenant,
            business=business,
            product_code="appointie",
        )
        .select_related("plan")
        .first()
    )
    now = timezone.now()
    if subscription is None:
        subscription = BusinessProductSubscription.objects.create(
            tenant=business.tenant,
            business=business,
            product_code="appointie",
            status=BusinessProductSubscriptionStatus.TRIALING,
            plan=plan,
        )
    subscription.plan = plan
    subscription.status = BusinessProductSubscriptionStatus.TRIALING
    subscription.billing_interval = str((plan_definition or {}).get("billing_interval") or "monthly")
    subscription.trial_ends_at = now + timedelta(days=14)
    subscription.current_period_starts_at = now - timedelta(days=1)
    subscription.current_period_ends_at = now + timedelta(days=14)
    subscription.canceled_at = None
    subscription.extra_staff = 0
    subscription.extra_offices = 0
    subscription.save()
    if business.selected_product != "appointie":
        business.selected_product = "appointie"
        business.save(update_fields=["selected_product", "updated_at"])
    return subscription


def _ensure_loyalty_settings(*, business: Business) -> None:
    settings, _ = BusinessSettings.objects.get_or_create(
        tenant=business.tenant,
        business=business,
    )
    prefs = dict(settings.loyalty_preferences or {})
    prefs.update(
        {
            "enabled": True,
            "points_per_currency_unit": 10,
            "max_redeem_percent": 50,
            "min_redeem_points": 10,
            "earn_points_per_100": 1,
        }
    )
    settings.loyalty_preferences = prefs
    settings.save(update_fields=["loyalty_preferences", "updated_at"])


def _ensure_branches(*, business: Business) -> dict[str, Branch]:
    mapping: dict[str, Branch] = {}
    for spec in DEMO_BRANCHES:
        branch, _ = Branch.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            branch_code=spec.code,
            defaults={
                "branch_name": spec.name,
                "display_name": spec.name,
                "is_primary": spec.is_primary,
                "email": f"{spec.code}@demosalon.example",
                "phone_number": spec.phone,
                "address_line1": spec.address_line1,
                "city": spec.city,
                "state": spec.state,
                "country": "India",
                "postal_code": spec.postal_code,
                "latitude": spec.latitude,
                "longitude": spec.longitude,
                "timezone": "Asia/Kolkata",
                "status": BranchStatus.ACTIVE,
                "is_active": True,
            },
        )
        mapping[spec.code] = branch
    # Keep a single primary office.
    primary_codes = {spec.code for spec in DEMO_BRANCHES if spec.is_primary}
    Branch.objects.filter(business=business, is_primary=True).exclude(branch_code__in=primary_codes).update(
        is_primary=False
    )
    return mapping


def _ensure_customers(*, business: Business) -> dict[str, Customer]:
    mapping: dict[str, Customer] = {}
    loyalty = LoyaltyService()
    for spec in DEMO_CUSTOMERS:
        display_name = f"{spec.first_name} {spec.last_name}".strip()
        customer, _ = Customer.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            customer_code=spec.code,
            defaults={
                "first_name": spec.first_name,
                "last_name": spec.last_name,
                "display_name": display_name,
                "email": spec.email,
                "phone_number": spec.phone,
                "status": CustomerStatus.ACTIVE,
                "tags": list(spec.tags),
                "source": "dashboard_demo_seed",
                "is_active": True,
            },
        )
        account = loyalty.ensure_account(
            tenant=business.tenant,
            business=business,
            customer=customer,
        )
        if account.points_balance != spec.loyalty_points:
            CustomerLoyaltyAccount.objects.filter(id=account.id).update(points_balance=spec.loyalty_points)
        mapping[spec.code] = customer
    return mapping


def _service_duration_minutes(*, business: Business, service: Service) -> int:
    duration = (
        ServiceDuration.objects.filter(tenant=business.tenant, service=service, is_default=True)
        .order_by("id")
        .first()
    )
    if duration is None:
        duration = ServiceDuration.objects.filter(tenant=business.tenant, service=service).order_by("id").first()
    return int(duration.duration_minutes) if duration else 45


def _ensure_bookings(
    *,
    business: Business,
    customers: dict[str, Customer],
    branches: dict[str, Branch],
) -> dict[str, Any]:
    services = {
        service.service_code: service
        for service in Service.objects.filter(tenant=business.tenant, business=business, is_active=True)
    }
    staff_rows = {
        staff.staff_code: staff
        for staff in Staff.objects.filter(tenant=business.tenant, business=business, is_active=True)
    }
    created = 0
    updated = 0
    reviews = 0
    local_today = _local_now().date()

    for spec in DEMO_BOOKINGS:
        customer = customers.get(spec.customer_code)
        service = services.get(spec.service_code)
        staff = staff_rows.get(spec.staff_code)
        branch = branches.get(spec.branch_code)
        if customer is None or service is None or staff is None or branch is None:
            continue

        duration = _service_duration_minutes(business=business, service=service)
        appointment_date = local_today + timedelta(days=spec.day_offset)
        start_local = datetime(
            appointment_date.year,
            appointment_date.month,
            appointment_date.day,
            spec.hour,
            spec.minute,
            tzinfo=DEMO_TZ,
        )
        end_local = start_local + timedelta(minutes=duration)
        start_at = start_local.astimezone(dt_timezone.utc)
        end_at = end_local.astimezone(dt_timezone.utc)

        defaults = {
            "business": business,
            "branch": branch,
            "customer_id": customer.id,
            "staff_id": staff.id,
            "service_id": service.id,
            "appointment_date": appointment_date,
            "start_at": start_at,
            "end_at": end_at,
            "duration_minutes": duration,
            "status": spec.status,
            "source": spec.source,
            "channel": spec.channel,
            "notes": spec.notes,
            "cancellation_reason": (
                "Customer cancelled" if spec.status == BookingStatus.CANCELLED else ""
            ),
            "metadata": {"seed": "dashboard_demo", "seed_key": spec.number},
            "is_active": True,
        }
        booking, was_created = Booking.objects.update_or_create(
            tenant=business.tenant,
            booking_number=spec.number,
            defaults=defaults,
        )
        if was_created:
            created += 1
        else:
            updated += 1

        if spec.review_rating and spec.status == BookingStatus.COMPLETED:
            _, review_created = BookingReview.objects.update_or_create(
                tenant=business.tenant,
                booking=booking,
                defaults={
                    "business": business,
                    "customer_id": customer.id,
                    "rating": spec.review_rating,
                    "comment": spec.review_comment,
                    "is_active": True,
                },
            )
            if review_created:
                reviews += 1

    return {"created": created, "updated": updated, "reviews": reviews, "total": len(DEMO_BOOKINGS)}


def _ensure_notifications(*, business: Business, owner: User) -> int:
    now = timezone.now()
    for spec in DEMO_NOTIFICATIONS:
        external_id = f"dashboard-demo:{spec.seed_key}"
        notification, _ = Notification.objects.update_or_create(
            tenant=business.tenant,
            business=business,
            external_id=external_id,
            defaults={
                "user": owner,
                "channel": NotificationChannel.IN_APP,
                "subject": spec.subject,
                "body": spec.body,
                "status": NotificationStatus.READ if spec.is_read else NotificationStatus.SENT,
                "is_read": spec.is_read,
                "metadata": {
                    "audience": AUDIENCE_ADMIN,
                    "event_type": spec.event_type,
                    "seed_key": spec.seed_key,
                    "seed": "dashboard_demo",
                },
                "is_active": True,
            },
        )
        Notification.objects.filter(id=notification.id).update(
            created_at=now - timedelta(hours=spec.hours_ago),
            updated_at=now - timedelta(hours=spec.hours_ago),
        )
    return len(DEMO_NOTIFICATIONS)


def _ensure_manager_teammate(*, business: Business) -> dict[str, Any] | None:
    email = "demo-manager@ieorbit.local"
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email,
                    password="DemoManager123!",
                    status=UserStatus.ACTIVE,
                    first_name="Demo",
                    last_name="Manager",
                )
        except IntegrityError:
            user = User.objects.get(email__iexact=email)
    RoleService().assign_role(user=user, role_code="manager")

    staff, _ = Staff.objects.update_or_create(
        tenant=business.tenant,
        business=business,
        staff_code="demo-manager",
        defaults={
            "user": user,
            "first_name": "Demo",
            "last_name": "Manager",
            "display_name": "Demo Manager",
            "email": email,
            "phone_number": "+91 90000 20001",
            "designation": "Salon Manager",
            "department": "Operations",
            "employment_status": EmploymentStatus.ACTIVE,
            "is_bookable": False,
            "is_active": True,
        },
    )
    return {
        "email": email,
        "staff_code": staff.staff_code,
        "password": "DemoManager123!",
    }


def _resolve_business(*, flavor_key: str) -> Business:
    from apps.businesses.models import WhiteLabelProfile

    profile = (
        WhiteLabelProfile.objects.select_related("business", "tenant")
        .filter(flavor_key=flavor_key, white_label_enabled=True)
        .first()
    )
    if profile is None:
        raise ValueError(f"White-label profile not found for flavor_key={flavor_key!r}.")
    return profile.business


@transaction.atomic
def seed_dashboard_demo(*, flavor_key: str = DEFAULT_FLAVOR_KEY) -> dict[str, Any]:
    """Ensure pilot + catalog seed, then fill operational demo data for screenshots."""
    seed_pilot_white_label_profiles()
    catalog = seed_mobile_demo_for_flavor(flavor_key=flavor_key)
    business = _resolve_business(flavor_key=flavor_key)
    owner = business.tenant.owner
    if owner is None:
        owner = User.objects.filter(email__iexact=PILOT_OWNER_EMAIL).first()
        if owner is None:
            raise ValueError("Pilot owner user is missing.")
        business.tenant.owner = owner
        business.tenant.save(update_fields=["owner", "updated_at"])

    _ensure_owner_role(owner=owner)
    subscription = _ensure_subscription(business=business)
    _ensure_loyalty_settings(business=business)
    branches = _ensure_branches(business=business)
    customers = _ensure_customers(business=business)
    bookings = _ensure_bookings(business=business, customers=customers, branches=branches)
    notifications = _ensure_notifications(business=business, owner=owner)
    manager = _ensure_manager_teammate(business=business)
    staff_count = Staff.objects.filter(
        tenant=business.tenant,
        business=business,
        is_active=True,
    ).count()

    return {
        "flavor_key": flavor_key,
        "tenant_slug": business.tenant.slug,
        "business_code": business.business_code,
        "business_name": business.display_name,
        "owner_email": owner.email,
        "plan_code": subscription.plan.code if subscription.plan_id else None,
        "subscription_status": subscription.status,
        "categories": catalog["categories"],
        "services": catalog["services"],
        "staff": staff_count,
        "branches": len(branches),
        "customers": len(customers),
        "bookings_created": bookings["created"],
        "bookings_updated": bookings["updated"],
        "bookings_total": bookings["total"],
        "reviews": bookings["reviews"],
        "notifications": notifications,
        "manager": manager,
        "login": {
            "email": PILOT_OWNER_EMAIL,
            "password": "PilotPass123!",
        },
    }
