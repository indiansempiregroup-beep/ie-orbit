"""Extended Business Assistant tools mirroring ops-mobile owner workflows."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.bookings.models import Booking, BookingReview, BookingStatus, StaffWeeklySchedule
from apps.businesses.constants import (
    FEATURE_APPOINTIE_BOOKINGS,
    FEATURE_APPOINTIE_REVIEWS,
    FEATURE_APPOINTIE_SERVICES,
    FEATURE_APPOINTIE_STAFF,
    FEATURE_SHOPIE_BOOKS_CASH,
    FEATURE_SHOPIE_BOOKS_EXPENSE,
    FEATURE_SHOPIE_BOOKS_GODOWNS,
    FEATURE_SHOPIE_BOOKS_PARTIES,
    FEATURE_SHOPIE_BOOKS_PURCHASE,
    FEATURE_SHOPIE_COUPONS,
    FEATURE_SHOPIE_LOYALTY,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_PRODUCTS,
    PRODUCT_APPOINTIE,
    PRODUCT_SHOPIE,
)
from apps.businesses.models import Business
from apps.customers.models import Customer, CustomerBorrowAccount, CustomerLoyaltyAccount
from apps.services.models import Service, ServiceDuration, ServicePricing, ServiceStatus
from apps.shopie.models import (
    OrderStatus,
    ShopCashAccount,
    ShopCoupon,
    ShopGodown,
    ShopGodownStock,
    ShopOrder,
    ShopProduct,
    VoucherStatus,
    VoucherType,
)
from apps.shopie.models import ShopBooksVoucher
from apps.shopie.services.books import BooksService
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.staff.models import EmploymentStatus, Staff
from apps.assistant.services.links import entity_link, pack_reply
from apps.tenancy.models import Tenant
from apps.businesses.services.entitlements import EntitlementService


def _entitlements() -> EntitlementService:
    return EntitlementService()


def has_domain_feature(*, business: Business, feature: str, product_code: str) -> bool:
    return _entitlements().has_feature(business=business, feature=feature, product_code=product_code)


def _customer_label(customer: Customer | None) -> str:
    if customer is None:
        return "Guest"
    return (customer.display_name or f"{customer.first_name} {customer.last_name}".strip() or "Customer").strip()


def _money(amount) -> str:
    try:
        return f"₹{Decimal(str(amount)).quantize(Decimal('0.01'))}"
    except Exception:
        return f"₹{amount}"


def books_cash_summary(*, tenant: Tenant, business: Business) -> str:
    if not (
        has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_CASH, product_code=PRODUCT_SHOPIE)
        or has_domain_feature(
            business=business, feature=FEATURE_SHOPIE_BOOKS_PARTIES, product_code=PRODUCT_SHOPIE
        )
    ):
        return "Books cash/parties are not enabled on your Orbit Mart plan."
    metrics = BooksService().get_dashboard_metrics(tenant=tenant, business=business)
    lines = [
        f"Cash: {_money(metrics.get('cash'))}",
        f"Bank: {_money(metrics.get('bank'))}",
        f"To collect: {_money(metrics.get('to_collect'))}",
        f"To pay: {_money(metrics.get('to_pay'))}",
    ]
    accounts = metrics.get("accounts") or []
    if accounts:
        lines.append("Accounts:")
        for account in accounts[:8]:
            lines.append(
                f"• {account.get('name')} ({account.get('account_type')}) — "
                f"{_money(account.get('current_balance'))}"
            )
    return "\n".join(lines)


def list_cash_accounts(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_CASH, product_code=PRODUCT_SHOPIE):
        return "Books cash is not enabled on your Orbit Mart plan."
    accounts = list(
        ShopCashAccount.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .order_by("name")[:12]
    )
    if not accounts:
        return "No cash/bank accounts found."
    lines = ["Cash & bank accounts:"]
    for account in accounts:
        lines.append(f"• {account.name} ({account.account_type}) — {_money(account.current_balance)}")
    return "\n".join(lines)


def books_purchases_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_BOOKS_PURCHASE, product_code=PRODUCT_SHOPIE
    ):
        return "Books purchase is not enabled on your Orbit Mart plan."
    today = timezone.localdate()
    qs = ShopBooksVoucher.objects.require_tenant(tenant).filter(
        business=business,
        voucher_type=VoucherType.PURCHASE,
        voucher_date=today,
    ).exclude(status=VoucherStatus.CANCELLED)
    total = qs.count()
    amount = qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
    if total == 0:
        return "No purchases today."
    return f"Purchases today: {total} voucher{'s' if total != 1 else ''} · {_money(amount)}."


def books_expenses_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_BOOKS_EXPENSE, product_code=PRODUCT_SHOPIE
    ):
        return "Books expense is not enabled on your Orbit Mart plan."
    today = timezone.localdate()
    qs = ShopBooksVoucher.objects.require_tenant(tenant).filter(
        business=business,
        voucher_type=VoucherType.EXPENSE,
        voucher_date=today,
    ).exclude(status=VoucherStatus.CANCELLED)
    total = qs.count()
    amount = qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
    if total == 0:
        return "No expenses today."
    return f"Expenses today: {total} voucher{'s' if total != 1 else ''} · {_money(amount)}."


def list_orders_awaiting_payment(*, tenant: Tenant, business: Business) -> dict | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    orders = list(
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business)
        .exclude(status=OrderStatus.CANCELLED)
        .select_related("customer")
        .order_by("-created_at")[:40]
    )
    waiting = []
    for order in orders:
        pos = order.metadata.get("pos") if isinstance(order.metadata, dict) else {}
        status = str((pos or {}).get("payment_status") or "").lower()
        if status in {"awaiting_confirmation", "due", "pending"}:
            waiting.append(order)
        if len(waiting) >= 10:
            break
    if not waiting:
        return "No orders awaiting payment confirmation."
    lines = [f"{len(waiting)} order{'s' if len(waiting) != 1 else ''} awaiting payment:"]
    links = []
    for order in waiting:
        pos = order.metadata.get("pos") if isinstance(order.metadata, dict) else {}
        pay = str((pos or {}).get("payment_status") or "due")
        customer = _customer_label(order.customer)
        lines.append(f"• {order.order_number} — {customer} — {_money(order.total)} — {pay}")
        links.append(
            entity_link(
                kind="order",
                id=str(order.id),
                label=order.order_number,
                subtitle=f"{customer} · {pay}",
            )
        )
    return pack_reply("\n".join(lines), links=links)


def orders_for_customer(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    customer = _resolve_customer(tenant=tenant, business=business, query=query)
    if isinstance(customer, dict):
        return customer
    if customer is None:
        return f"No customer matching “{query}”."
    orders = list(
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business, customer=customer)
        .order_by("-created_at")[:8]
    )
    if not orders:
        return f"No orders for {_customer_label(customer)}."
    lines = [f"Recent orders for {_customer_label(customer)}:"]
    links = [
        entity_link(kind="customer", id=str(customer.id), label=_customer_label(customer), subtitle="Customer")
    ]
    for order in orders:
        lines.append(f"• {order.order_number} — {order.status} — {_money(order.total)}")
        links.append(
            entity_link(
                kind="order",
                id=str(order.id),
                label=order.order_number,
                subtitle=order.status,
            )
        )
    return pack_reply("\n".join(lines), links=links)


def price_of_product(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        return "Products are not enabled on your Orbit Mart plan."
    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(name__icontains=query.strip()) | Q(sku__icontains=query.strip()))
        .order_by("name")[:8]
    )
    if not products:
        return f"No products matching “{query}”."
    lines = [f"Price for “{query}”:"]
    links = []
    chips = []
    for product in products:
        lines.append(
            f"• {product.name} — {_money(product.price)} — stock {product.stock_on_hand} — "
            f"SKU {product.sku or '—'}"
        )
        links.append(
            entity_link(
                kind="product",
                id=str(product.id),
                label=product.name,
                subtitle=f"{_money(product.price)} · stock {product.stock_on_hand}",
            )
        )
        chips.append(f"Stock of {product.name}")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5] if len(products) > 1 else None)


def list_godowns(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_BOOKS_GODOWNS, product_code=PRODUCT_SHOPIE
    ):
        return "Godowns are not enabled on your Orbit Mart plan."
    godowns = list(
        ShopGodown.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .order_by("name")[:12]
    )
    if not godowns:
        return "No godowns found."
    lines = ["Godowns:"]
    for godown in godowns:
        mark = " (default)" if godown.is_default else ""
        lines.append(f"• {godown.name}{mark}" + (f" — {godown.code}" if godown.code else ""))
    return "\n".join(lines)


def godown_stock_of_product(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_BOOKS_GODOWNS, product_code=PRODUCT_SHOPIE
    ):
        return "Godowns are not enabled on your Orbit Mart plan."
    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(name__icontains=query.strip()) | Q(sku__icontains=query.strip()))
        .order_by("name")[:8]
    )
    if not products:
        return f"No product matching “{query}”."
    if len(products) > 1:
        lines = [f"Several products match “{query}”. Tap one:"]
        links = []
        chips = []
        for product in products:
            lines.append(f"• {product.name} — SKU {product.sku or '—'}")
            links.append(
                entity_link(kind="product", id=str(product.id), label=product.name, subtitle=product.sku or "")
            )
            chips.append(f"Godown stock of {product.name}")
        return pack_reply("\n".join(lines), links=links, suggestions=chips[:5])
    product = products[0]
    rows = list(
        ShopGodownStock.objects.require_tenant(tenant)
        .filter(business=business, product=product)
        .select_related("godown")
        .order_by("godown__name")[:12]
    )
    lines = [f"Godown stock for {product.name} (office {product.stock_on_hand}):"]
    if not rows:
        lines.append("• No godown stock rows yet.")
    else:
        for row in rows:
            name = row.godown.name if row.godown_id else "Godown"
            lines.append(f"• {name} — {row.quantity}")
    return pack_reply(
        "\n".join(lines),
        links=[
            entity_link(
                kind="product",
                id=str(product.id),
                label=product.name,
                subtitle=f"Office {product.stock_on_hand}",
            )
        ],
    )


def find_coupon(*, tenant: Tenant, business: Business, query: str) -> str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_COUPONS, product_code=PRODUCT_SHOPIE):
        return "Coupons are not enabled on your Orbit Mart plan."
    q = query.strip()
    coupons = list(
        ShopCoupon.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(code__icontains=q) | Q(name__icontains=q))
        .order_by("-created_at")[:8]
    )
    if not coupons:
        return f"No coupons matching “{q}”."
    lines = [f"Coupons matching “{q}”:"]
    for coupon in coupons:
        state = "active" if coupon.is_active else "inactive"
        lines.append(
            f"• {coupon.code} — {coupon.name} — {coupon.discount_type} "
            f"{coupon.discount_value} — {state}"
        )
    return "\n".join(lines)


def loyalty_points_for_customer(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_LOYALTY, product_code=PRODUCT_SHOPIE):
        return "Loyalty points are not enabled on your Orbit Mart plan."
    customer = _resolve_customer(tenant=tenant, business=business, query=query)
    if isinstance(customer, dict):
        return customer
    if customer is None:
        return f"No customer matching “{query}”."
    account = (
        CustomerLoyaltyAccount.objects.require_tenant(tenant)
        .filter(business=business, customer=customer)
        .first()
    )
    pts = account.points_balance if account else 0
    label = _customer_label(customer)
    return pack_reply(
        f"{label} has {pts} loyalty point{'s' if pts != 1 else ''}.",
        links=[entity_link(kind="customer", id=str(customer.id), label=label, subtitle=customer.phone_number or "")],
    )


def reviews_summary(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_REVIEWS, product_code=PRODUCT_APPOINTIE
    ):
        return "Reviews are not enabled on your Orbit Appoint plan."
    qs = BookingReview.objects.require_tenant(tenant).filter(business=business)
    total = qs.count()
    if total == 0:
        return "No booking reviews yet."
    avg = qs.aggregate(a=Avg("rating"))["a"] or 0
    return f"Reviews: {total} total · average {Decimal(str(avg)).quantize(Decimal('0.1'))}★."


def list_recent_reviews(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_REVIEWS, product_code=PRODUCT_APPOINTIE
    ):
        return "Reviews are not enabled on your Orbit Appoint plan."
    rows = list(
        BookingReview.objects.require_tenant(tenant)
        .filter(business=business)
        .select_related("booking")
        .order_by("-created_at")[:8]
    )
    if not rows:
        return "No booking reviews yet."
    lines = ["Recent reviews:"]
    for review in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=review.customer_id).first()
        comment = (review.comment or "").strip()
        snippet = f" — {comment[:80]}" if comment else ""
        lines.append(f"• {review.rating}★ {_customer_label(customer)}{snippet}")
    return "\n".join(lines)


def low_rating_reviews(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_REVIEWS, product_code=PRODUCT_APPOINTIE
    ):
        return "Reviews are not enabled on your Orbit Appoint plan."
    rows = list(
        BookingReview.objects.require_tenant(tenant)
        .filter(business=business, rating__lte=2)
        .order_by("-created_at")[:8]
    )
    if not rows:
        return "No low ratings (1–2★) found."
    lines = ["Low ratings:"]
    for review in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=review.customer_id).first()
        lines.append(f"• {review.rating}★ {_customer_label(customer)} — {(review.comment or '—')[:80]}")
    return "\n".join(lines)


def bookings_for_staff_today(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    staff = _resolve_staff(tenant=tenant, business=business, query=query)
    if isinstance(staff, dict):
        return staff
    if staff is None:
        return f"No staff matching “{query}”."
    today = timezone.localdate()
    rows = list(
        Booking.objects.require_tenant(tenant)
        .filter(business=business, appointment_date=today, staff_id=staff.id)
        .exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED])
        .order_by("start_at")[:12]
    )
    if not rows:
        return f"No bookings for {staff.display_name} today."
    lines = [f"{staff.display_name}'s bookings today ({len(rows)}):"]
    links = [
        entity_link(kind="staff", id=str(staff.id), label=staff.display_name, subtitle="Staff")
    ]
    for booking in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
        when = timezone.localtime(booking.start_at).strftime("%H:%M")
        lines.append(f"• {when} — {booking.booking_number} — {_customer_label(customer)} — {booking.status}")
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=f"{when} · {_customer_label(customer)}",
            )
        )
    return pack_reply("\n".join(lines), links=links)


def staff_workload_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    today = timezone.localdate()
    rows = (
        Booking.objects.require_tenant(tenant)
        .filter(business=business, appointment_date=today)
        .exclude(status__in=[BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED])
        .exclude(staff_id__isnull=True)
        .values("staff_id")
        .annotate(c=Count("id"))
        .order_by("-c")[:10]
    )
    if not rows:
        return "No staff bookings today."
    lines = ["Staff workload today:"]
    for row in rows:
        member = Staff.objects.require_tenant(tenant).filter(business=business, id=row["staff_id"]).first()
        name = member.display_name if member else str(row["staff_id"])[:8]
        lines.append(f"• {name} — {row['c']} booking{'s' if row['c'] != 1 else ''}")
    return "\n".join(lines)


def staff_on_duty_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_STAFF, product_code=PRODUCT_APPOINTIE
    ):
        return "Staff is not enabled on your Orbit Appoint plan."
    weekday = timezone.localdate().weekday()
    schedules = list(
        StaffWeeklySchedule.objects.require_tenant(tenant)
        .filter(business=business, weekday=weekday, is_available=True)
        .order_by("shift_start")[:20]
    )
    if not schedules:
        return "No staff schedule entries for today."
    lines = ["Staff on duty today:"]
    for schedule in schedules:
        member = Staff.objects.require_tenant(tenant).filter(business=business, id=schedule.staff_id).first()
        name = member.display_name if member else "Staff"
        lines.append(
            f"• {name} — {schedule.shift_start.strftime('%H:%M')}–{schedule.shift_end.strftime('%H:%M')}"
        )
    return "\n".join(lines)


def get_service_detail(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_SERVICES, product_code=PRODUCT_APPOINTIE
    ):
        return "Services are not enabled on your Orbit Appoint plan."
    by_id = (
        Service.objects.require_tenant(tenant)
        .filter(business=business, id=query.strip())
        .first()
        if query and len(query.strip()) >= 8
        else None
    )
    services = (
        [by_id]
        if by_id is not None
        else list(
            Service.objects.require_tenant(tenant)
            .filter(business=business, status=ServiceStatus.ACTIVE)
            .filter(
                Q(name__icontains=query.strip())
                | Q(display_name__icontains=query.strip())
                | Q(service_code__icontains=query.strip())
            )
            .order_by("display_name")[:8]
        )
    )
    services = [s for s in services if s is not None]
    if not services:
        return f"No service matching “{query}”."
    if len(services) > 1:
        lines = [f"Several services match “{query}”. Tap one or ask again with the exact name:"]
        links = []
        chips = []
        for service in services:
            name = service.display_name or service.name
            lines.append(f"• {name}")
            links.append(
                entity_link(kind="service", id=str(service.id), label=name, subtitle="Service", action="preview")
            )
            chips.append(f"Service details for {name}")
        return pack_reply("\n".join(lines), links=links, suggestions=chips[:5])
    service = services[0]
    duration = (
        ServiceDuration.objects.require_tenant(tenant).filter(service=service).order_by("id").first()
    )
    price = (
        ServicePricing.objects.require_tenant(tenant)
        .filter(service=service, is_default=True)
        .order_by("id")
        .first()
    )
    mins = duration.duration_minutes if duration else "—"
    amount = price.sale_price or price.base_price if price else None
    price_txt = _money(amount) if amount is not None else "—"
    name = service.display_name or service.name
    text = "\n".join(
        [
            f"Service {name}",
            f"Duration: {mins} min",
            f"Price: {price_txt}",
        ]
        + ([f"About: {service.short_description}"] if service.short_description else [])
    )
    return pack_reply(
        text,
        links=[
            entity_link(
                kind="service",
                id=str(service.id),
                label=f"Open {name}",
                subtitle=f"{mins} min · {price_txt}",
                action="open",
            )
        ],
    )


def get_customer_detail(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    by_id = (
        Customer.objects.require_tenant(tenant).filter(business=business, id=query.strip()).first()
        if query and len(query.strip()) >= 8
        else None
    )
    customer = by_id if by_id is not None else _resolve_customer(tenant=tenant, business=business, query=query)
    if isinstance(customer, dict):
        return customer
    if customer is None:
        return f"No customer matching “{query}”."
    lines = [
        f"{_customer_label(customer)}",
        f"Phone: {customer.phone_number or '—'}",
        f"Email: {customer.email or '—'}",
        f"Status: {getattr(customer, 'status', None) or '—'}",
    ]
    borrow = (
        CustomerBorrowAccount.objects.require_tenant(tenant)
        .filter(business=business, customer=customer)
        .first()
    )
    if borrow and borrow.balance_due:
        lines.append(f"Borrow due: {_money(borrow.balance_due)}")
    if has_domain_feature(business=business, feature=FEATURE_SHOPIE_LOYALTY, product_code=PRODUCT_SHOPIE):
        loyalty = (
            CustomerLoyaltyAccount.objects.require_tenant(tenant)
            .filter(business=business, customer=customer)
            .first()
        )
        if loyalty:
            lines.append(f"Loyalty points: {loyalty.points_balance}")
    if has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        order_count = (
            ShopOrder.objects.require_tenant(tenant).filter(business=business, customer=customer).count()
        )
        lines.append(f"Orders: {order_count}")
    if has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        booking_count = (
            Booking.objects.require_tenant(tenant)
            .filter(business=business, customer_id=customer.id)
            .count()
        )
        lines.append(f"Bookings: {booking_count}")
    return pack_reply(
        "\n".join(lines),
        links=[
            entity_link(
                kind="customer",
                id=str(customer.id),
                label=f"Open {_customer_label(customer)}",
                subtitle=customer.phone_number or "Full customer screen",
                action="open",
            )
        ],
        suggestions=[
            f"Orders for {_customer_label(customer)}",
            f"Upcoming bookings for {_customer_label(customer)}",
        ],
    )


def customer_borrow_balance(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    customer = _resolve_customer(tenant=tenant, business=business, query=query)
    if isinstance(customer, dict):
        return customer
    if customer is None:
        return f"No customer matching “{query}”."
    borrow = (
        CustomerBorrowAccount.objects.require_tenant(tenant)
        .filter(business=business, customer=customer)
        .first()
    )
    due = borrow.balance_due if borrow else Decimal("0")
    label = _customer_label(customer)
    link = entity_link(kind="customer", id=str(customer.id), label=label, subtitle=customer.phone_number or "")
    if due <= 0:
        return pack_reply(f"{label} has no borrow balance due.", links=[link])
    return pack_reply(f"{label} owes {_money(due)}.", links=[link])


def customer_upcoming_bookings(*, tenant: Tenant, business: Business, query: str) -> dict | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    customer = _resolve_customer(tenant=tenant, business=business, query=query)
    if isinstance(customer, dict):
        return customer
    if customer is None:
        return f"No customer matching “{query}”."
    now = timezone.now()
    rows = list(
        Booking.objects.require_tenant(tenant)
        .filter(business=business, customer_id=customer.id, start_at__gte=now)
        .exclude(
            status__in=[
                BookingStatus.CANCELLED,
                BookingStatus.REJECTED,
                BookingStatus.EXPIRED,
                BookingStatus.COMPLETED,
                BookingStatus.NO_SHOW,
            ]
        )
        .order_by("start_at")[:8]
    )
    if not rows:
        return f"No upcoming bookings for {_customer_label(customer)}."
    lines = [f"Upcoming bookings for {_customer_label(customer)}:"]
    links = [
        entity_link(
            kind="customer",
            id=str(customer.id),
            label=_customer_label(customer),
            subtitle="Customer",
        )
    ]
    for booking in rows:
        when = timezone.localtime(booking.start_at).strftime("%Y-%m-%d %H:%M")
        lines.append(f"• {booking.booking_number} — {when} — {booking.status}")
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=f"{when} · {booking.status}",
            )
        )
    return pack_reply("\n".join(lines), links=links)


def propose_set_product_price(
    *, tenant: Tenant, business: Business, query: str, price: Decimal
) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Products are not enabled on your Orbit Mart plan."})
    if price < 0:
        raise ValidationError({"detail": "Price cannot be negative."})
    product = (
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(sku__iexact=query) | Q(name__icontains=query))
        .order_by("name")
        .first()
    )
    if product is None:
        raise ValidationError({"detail": f"No product found for “{query}”."})
    return {
        "action_type": "product.set_price",
        "summary": f"Set price of {product.name} to {_money(price)} (now {_money(product.price)}).",
        "payload": {
            "product_id": str(product.id),
            "product_name": product.name,
            "from_price": str(product.price),
            "to_price": str(price),
        },
    }


def propose_order_payment(
    *, tenant: Tenant, business: Business, number: str, action: str
) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Online orders are not enabled on your Orbit Mart plan."})
    act = action.strip().lower()
    if act not in {"confirm", "reject"}:
        raise ValidationError({"detail": "Payment action must be confirm or reject."})
    order = (
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(order_number__iexact=number) | Q(order_number__icontains=number))
        .first()
    )
    if order is None:
        raise ValidationError({"detail": f"No order found for #{number}."})
    return {
        "action_type": "order.payment_action",
        "summary": f"{'Confirm' if act == 'confirm' else 'Reject'} payment for order {order.order_number} ({_money(order.total)}).",
        "payload": {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "action": act,
        },
    }


def propose_deactivate_coupon(*, tenant: Tenant, business: Business, query: str) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_COUPONS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Coupons are not enabled on your Orbit Mart plan."})
    coupon = (
        ShopCoupon.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(code__iexact=query) | Q(code__icontains=query) | Q(name__icontains=query))
        .first()
    )
    if coupon is None:
        raise ValidationError({"detail": f"No active coupon found for “{query}”."})
    return {
        "action_type": "coupon.deactivate",
        "summary": f"Deactivate coupon {coupon.code} ({coupon.name}).",
        "payload": {"coupon_id": str(coupon.id), "code": coupon.code},
    }


def execute_extra_action(
    *,
    tenant: Tenant,
    business: Business,
    action_type: str,
    payload: dict[str, Any],
    actor,
) -> dict[str, Any] | None:
    if action_type == "product.set_price":
        product = ShopProduct.objects.require_tenant(tenant).get(business=business, id=payload["product_id"])
        CatalogService().update_product(
            tenant=tenant,
            business=business,
            product=product,
            data={"price": Decimal(str(payload["to_price"]))},
        )
        product.refresh_from_db(fields=["price"])
        return {"product_name": product.name, "price": str(product.price)}
    if action_type == "order.payment_action":
        order = ShopOrder.objects.require_tenant(tenant).get(business=business, id=payload["order_id"])
        updated = OrderService().confirm_or_reject_payment(
            tenant=tenant,
            business=business,
            order=order,
            action=payload["action"],
            note="Business Assistant",
        )
        pos = updated.metadata.get("pos") if isinstance(updated.metadata, dict) else {}
        return {
            "order_number": updated.order_number,
            "payment_status": str((pos or {}).get("payment_status") or ""),
        }
    if action_type == "coupon.deactivate":
        coupon = ShopCoupon.objects.require_tenant(tenant).get(business=business, id=payload["coupon_id"])
        coupon.is_active = False
        coupon.save(update_fields=["is_active", "updated_at"])
        return {"code": coupon.code, "is_active": False}
    return None


def _resolve_customer(*, tenant: Tenant, business: Business, query: str) -> Customer | dict | None:
    q = query.strip()
    matches = list(
        Customer.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(
            Q(phone_number__icontains=q)
            | Q(display_name__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(email__icontains=q)
        )
        .order_by("display_name")[:8]
    )
    if not matches:
        return None
    exact = [
        c
        for c in matches
        if (c.phone_number or "").replace(" ", "") == q.replace(" ", "")
        or (c.display_name or "").lower() == q.lower()
        or f"{c.first_name} {c.last_name}".strip().lower() == q.lower()
    ]
    if len(exact) == 1:
        return exact[0]
    if len(matches) == 1:
        return matches[0]
    lines = [f"Several customers match “{q}”. Tap one or ask again with a phone number:"]
    links = []
    chips = []
    for customer in matches:
        phone = customer.phone_number or "—"
        label = _customer_label(customer)
        lines.append(f"• {label} — {phone}")
        links.append(entity_link(kind="customer", id=str(customer.id), label=label, subtitle=phone))
        chips.append(f"Customer details for {label}")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5])


def _resolve_staff(*, tenant: Tenant, business: Business, query: str) -> Staff | dict | None:
    q = query.strip()
    matches = list(
        Staff.objects.require_tenant(tenant)
        .filter(business=business, employment_status=EmploymentStatus.ACTIVE)
        .filter(
            Q(display_name__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(staff_code__icontains=q)
        )
        .order_by("display_name")[:8]
    )
    if not matches:
        return None
    exact = [s for s in matches if (s.display_name or "").lower() == q.lower() or (s.staff_code or "").lower() == q.lower()]
    if len(exact) == 1:
        return exact[0]
    if len(matches) == 1:
        return matches[0]
    lines = [f"Several staff match “{q}”. Tap one or ask again with the full name:"]
    links = []
    chips = []
    for member in matches:
        role = member.designation or ("Bookable" if member.is_bookable else "Non-bookable")
        lines.append(f"• {member.display_name} — {role}")
        links.append(
            entity_link(kind="staff", id=str(member.id), label=member.display_name, subtitle=role)
        )
        chips.append(f"{member.display_name}'s bookings today")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5])
