from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assistant.services.access import AssistantAccess
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services import BookingService
from apps.businesses.constants import (
    FEATURE_APPOINTIE_BOOKINGS,
    FEATURE_APPOINTIE_REVIEWS,
    FEATURE_APPOINTIE_SERVICES,
    FEATURE_APPOINTIE_STAFF,
    FEATURE_SHOPIE_BOOKS_CASH,
    FEATURE_SHOPIE_BOOKS_EXPENSE,
    FEATURE_SHOPIE_BOOKS_GODOWNS,
    FEATURE_SHOPIE_BOOKS_PURCHASE,
    FEATURE_SHOPIE_BOOKS_SALE,
    FEATURE_SHOPIE_COUPONS,
    FEATURE_SHOPIE_LOYALTY,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_PRODUCTS,
    FEATURE_SHOPIE_RETURNS,
    PRODUCT_APPOINTIE,
    PRODUCT_SHOPIE,
)
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.customers.models import Customer
from apps.services.models import Service, ServiceStatus
from apps.shopie.models import (
    DiscountType,
    FulfillmentMode,
    OrderStatus,
    ReturnStatus,
    ShopBooksVoucher,
    ShopCoupon,
    ShopOrder,
    ShopProduct,
    ShopReturn,
    StockMovementType,
    VoucherStatus,
    VoucherType,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.orders import OrderService
from apps.shopie.services.returns import ReturnService
from apps.staff.models import EmploymentStatus, Staff
from apps.assistant.services.links import (
    LIST_PAGE_SIZE,
    entity_link,
    pack_reply,
    slice_page,
    unpack_reply,
)
from apps.assistant.services.tools_ops import execute_extra_action
from apps.tenancy.models import Tenant

ORDER_STATUS_ALIASES = {
    "pending": OrderStatus.PENDING,
    "confirm": OrderStatus.CONFIRMED,
    "confirmed": OrderStatus.CONFIRMED,
    "ready": OrderStatus.READY,
    "packed": OrderStatus.READY,
    "out_for_delivery": OrderStatus.OUT_FOR_DELIVERY,
    "out for delivery": OrderStatus.OUT_FOR_DELIVERY,
    "deliver": OrderStatus.COMPLETED,
    "delivered": OrderStatus.COMPLETED,
    "complete": OrderStatus.COMPLETED,
    "completed": OrderStatus.COMPLETED,
    "cancel": OrderStatus.CANCELLED,
    "cancelled": OrderStatus.CANCELLED,
    "canceled": OrderStatus.CANCELLED,
    "failed": OrderStatus.DELIVERY_FAILED,
    "delivery failed": OrderStatus.DELIVERY_FAILED,
    "delivery_failed": OrderStatus.DELIVERY_FAILED,
}

BOOKING_STATUS_ALIASES = {
    "pending": BookingStatus.PENDING,
    "set pending": BookingStatus.PENDING,
    "confirm": BookingStatus.CONFIRMED,
    "confirmed": BookingStatus.CONFIRMED,
    "complete": BookingStatus.COMPLETED,
    "completed": BookingStatus.COMPLETED,
    "cancel": BookingStatus.CANCELLED,
    "cancelled": BookingStatus.CANCELLED,
    "canceled": BookingStatus.CANCELLED,
    "reject": BookingStatus.REJECTED,
    "rejected": BookingStatus.REJECTED,
    "no_show": BookingStatus.NO_SHOW,
    "no-show": BookingStatus.NO_SHOW,
    "noshow": BookingStatus.NO_SHOW,
    "no show": BookingStatus.NO_SHOW,
    "check_in": BookingStatus.CHECKED_IN,
    "checked_in": BookingStatus.CHECKED_IN,
    "checkin": BookingStatus.CHECKED_IN,
    "check in": BookingStatus.CHECKED_IN,
    "start": BookingStatus.IN_PROGRESS,
    "in_progress": BookingStatus.IN_PROGRESS,
    "in progress": BookingStatus.IN_PROGRESS,
}

RETURN_STATUS_ALIASES = {
    "complete": ReturnStatus.COMPLETED,
    "completed": ReturnStatus.COMPLETED,
    "approve": ReturnStatus.APPROVED,
    "approved": ReturnStatus.APPROVED,
    "reject": ReturnStatus.REJECTED,
    "rejected": ReturnStatus.REJECTED,
}


def _entitlements() -> EntitlementService:
    return EntitlementService()


def has_domain_feature(*, business: Business, feature: str, product_code: str) -> bool:
    return _entitlements().has_feature(business=business, feature=feature, product_code=product_code)


def suggestion_chips(*, access: AssistantAccess, business: Business) -> list[str]:
    chips: list[str] = []
    if access.mart_enabled:
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
            chips.extend(["Today overview", "Orders today", "Online orders", "Open orders", "Sales today"])
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
            chips.append("Low stock")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE):
            chips.append("Pending returns")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_CASH, product_code=PRODUCT_SHOPIE):
            chips.append("Cash balance")
    if access.appoint_enabled:
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE):
            chips.extend(["Bookings today", "Pending bookings", "Upcoming bookings", "Staff workload today"])
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_REVIEWS, product_code=PRODUCT_APPOINTIE):
            chips.append("Recent reviews")
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_STAFF, product_code=PRODUCT_APPOINTIE):
            chips.append("Who's working today")
    chips.extend(["Find customer", "What can you do?"])
    seen: set[str] = set()
    ordered: list[str] = []
    for chip in chips:
        if chip not in seen:
            seen.add(chip)
            ordered.append(chip)
    return ordered[:6]


def help_text(*, access: AssistantAccess, business: Business) -> str:
    lines = [
        "I work like your ops app — anything your plan unlocks here, I can help with.",
        "Ask naturally. Writes always need Confirm.",
        "",
    ]
    if access.mart_enabled:
        lines.append("Orbit Mart")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
            lines.append(
                "• Orders: today/yesterday/open/pending/ready/out for delivery/failed deliveries · "
                "order #123 · sales today · payments to confirm · confirm/reject payment for order 123 · "
                "orders for Riya · change order status · mark order 123 as delivered"
            )
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
            lines.append(
                "• Products: low/out of stock · find product · stock of · price of · "
                "set stock · add stock · set price of tea to 120"
            )
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE):
            lines.append("• Returns: pending returns · return R-123 · complete return R-123")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_COUPONS, product_code=PRODUCT_SHOPIE):
            lines.append("• Coupons: active coupons · find coupon SAVE10 · deactivate coupon SAVE10")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_CASH, product_code=PRODUCT_SHOPIE):
            lines.append("• Books cash: cash balance · list cash accounts · to collect / to pay")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_SALE, product_code=PRODUCT_SHOPIE):
            lines.append("• Books sale: books sales today")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_PURCHASE, product_code=PRODUCT_SHOPIE):
            lines.append("• Books purchase: purchases today")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_EXPENSE, product_code=PRODUCT_SHOPIE):
            lines.append("• Books expense: expenses today")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_GODOWNS, product_code=PRODUCT_SHOPIE):
            lines.append("• Godowns: list godowns · stock of tea in godown")
        if has_domain_feature(business=business, feature=FEATURE_SHOPIE_LOYALTY, product_code=PRODUCT_SHOPIE):
            lines.append("• Loyalty: loyalty points for Riya")
    else:
        lines.append("• Orbit Mart is off on your plan")
    if access.appoint_enabled:
        lines.append("Orbit Appoint")
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE):
            lines.append(
                "• Bookings: today/tomorrow/week · pending/upcoming · no-shows · "
                "booking B-123 · confirm/cancel/complete/check-in/no-show · "
                "Riya's bookings today · staff workload today · upcoming bookings for Riya"
            )
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_SERVICES, product_code=PRODUCT_APPOINTIE):
            lines.append("• Services: list services · price of haircut / find service facial")
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_STAFF, product_code=PRODUCT_APPOINTIE):
            lines.append("• Staff: list staff · find staff · who's working today")
        if has_domain_feature(business=business, feature=FEATURE_APPOINTIE_REVIEWS, product_code=PRODUCT_APPOINTIE):
            lines.append("• Reviews: recent reviews · review summary · low ratings")
    else:
        lines.append("• Orbit Appoint is off on your plan")
    lines.append("Customers")
    lines.append(
        "• find customer · customer details for Riya · new customers today · "
        "customer count · borrow balance for Riya"
    )
    lines.append("• today overview")
    return "\n".join(lines)


def _customer_label(customer: Customer | None) -> str:
    if customer is None:
        return "Guest"
    return (customer.display_name or f"{customer.first_name} {customer.last_name}".strip() or "Customer").strip()


def _money(amount) -> str:
    try:
        return f"₹{Decimal(str(amount)).quantize(Decimal('0.01'))}"
    except Exception:
        return f"₹{amount}"


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(str(value))
        return True
    except (TypeError, ValueError, AttributeError):
        return False


def _fulfillment_tag(order: ShopOrder) -> str:
    mode = str(getattr(order, "fulfillment_mode", "") or "").lower()
    if mode == "pos":
        return "Counter"
    if mode == "pickup":
        return "Pickup"
    if mode == "delivery":
        return "Delivery"
    return mode.replace("_", " ").title() if mode else "Order"


def _order_link(
    order: ShopOrder,
    *,
    action: str = "preview",
    select_text: str | None = None,
    open_label: bool = False,
) -> dict[str, Any]:
    customer = _customer_label(order.customer)
    tag = _fulfillment_tag(order)
    label = f"Open {order.order_number}" if open_label else order.order_number
    return entity_link(
        kind="order",
        id=str(order.id),
        label=label,
        subtitle=f"{customer} · {order.status} · {_money(order.total)}",
        action=action,
        select_text=select_text,
        badge=tag,
    )


# Short chip label → status alias (must match OrderService.transition).
_ORDER_STATUS_SHORT_LABELS = {
    "confirmed": "Confirm",
    "ready": "Ready",
    "out_for_delivery": "Out for delivery",
    "completed": "Complete",
    "cancelled": "Cancel",
    "delivery_failed": "Failed",
}

# Full transition map (same rules as OrderService.transition) — used to reject illegal moves.
_ORDER_SERVICE_ALLOWED: dict[str, set[str]] = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED},
    OrderStatus.READY: {
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERY_FAILED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.COMPLETED, OrderStatus.DELIVERY_FAILED},
    OrderStatus.DELIVERY_FAILED: {
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.COMPLETED: set(),
    OrderStatus.CANCELLED: set(),
}

# Forward next-steps only for suggestion chips (no going back to an earlier pipeline status).
_ORDER_FORWARD_TRANSITIONS: dict[str, tuple[str, ...]] = {
    OrderStatus.PENDING: (OrderStatus.CONFIRMED, OrderStatus.CANCELLED),
    OrderStatus.CONFIRMED: (OrderStatus.READY, OrderStatus.CANCELLED),
    OrderStatus.READY: (OrderStatus.COMPLETED, OrderStatus.CANCELLED),
    OrderStatus.OUT_FOR_DELIVERY: (OrderStatus.COMPLETED, OrderStatus.DELIVERY_FAILED),
    # Failed delivery: re-dispatch or finish — not “back to ready”.
    OrderStatus.DELIVERY_FAILED: (
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
    ),
    OrderStatus.COMPLETED: (),
    OrderStatus.CANCELLED: (),
}


def _allowed_next_statuses(order: ShopOrder) -> list[str]:
    """Next statuses the assistant may suggest (forward only, mode-aware)."""
    status = str(order.status or "")
    mode = str(order.fulfillment_mode or "").lower()
    allowed = list(_ORDER_FORWARD_TRANSITIONS.get(status, ()))
    if status == OrderStatus.CONFIRMED and mode == "pos":
        # Counter can complete without a separate ready step.
        if OrderStatus.COMPLETED not in allowed:
            allowed.insert(1, OrderStatus.COMPLETED)
    if status == OrderStatus.READY and mode == "delivery":
        # Delivery must go out before complete.
        allowed = [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED]
    elif status == OrderStatus.READY and mode != "delivery":
        allowed = [s for s in allowed if s != OrderStatus.OUT_FOR_DELIVERY]
    return allowed


def _next_order_status_chips(order: ShopOrder, *, short: bool = False) -> list[str]:
    """Suggestion chips for the next allowed status only (never prior statuses)."""
    number = order.order_number

    def mark(as_status: str) -> str:
        if short:
            return _ORDER_STATUS_SHORT_LABELS.get(as_status, as_status)
        return f"mark order {number} as {as_status}"

    return [mark(status) for status in _allowed_next_statuses(order)]


def _order_status_flow(order: ShopOrder) -> dict[str, Any]:
    return {
        "type": "order_status",
        "step": "pick_status",
        "order_number": order.order_number,
        "order_id": str(order.id),
    }


def count_orders_today(*, tenant: Tenant, business: Business, offset: int = 0) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    today = timezone.localdate()
    qs = ShopOrder.objects.require_tenant(tenant).filter(business=business, created_at__date=today)
    total = qs.count()
    if total == 0:
        return "No orders today."
    by_status: dict[str, int] = {}
    for row in qs.values_list("status", flat=True):
        by_status[row] = by_status.get(row, 0) + 1
    parts = ", ".join(f"{count} {status}" for status, count in sorted(by_status.items()))
    all_rows = list(qs.select_related("customer").order_by("-created_at")[:200])
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    lines = [
        f"You have {total} order{'s' if total != 1 else ''} today ({parts}) — "
        f"showing {start + 1}–{start + len(rows)}:"
    ]
    links = []
    for order in rows:
        customer = _customer_label(order.customer)
        tag = _fulfillment_tag(order)
        lines.append(
            f"• {order.order_number} — [{tag}] — {customer} — {order.status} — {_money(order.total)}"
        )
        links.append(_order_link(order, action="preview"))
    page.update({"list": "orders_today", "more_label": "Show more orders"})
    return pack_reply("\n".join(lines), links=links, page=page)


def _order_detail_pack(order: ShopOrder) -> dict[str, Any]:
    customer = _customer_label(order.customer)
    phone = getattr(order.customer, "phone_number", None) or "—"
    tag = _fulfillment_tag(order)
    chips = _next_order_status_chips(order, short=True)
    lines = [
        f"Order {order.order_number}",
        f"Type: {tag}",
        f"Customer: {customer} ({phone})",
        f"Status: {order.status}",
        f"Total: {_money(order.total)}",
        f"Created: {timezone.localtime(order.created_at).strftime('%Y-%m-%d %H:%M')}",
    ]
    if not chips:
        lines.append("No further status changes from here.")
    return pack_reply(
        "\n".join(lines),
        links=[_order_link(order, action="open", open_label=True)],
        suggestions=chips,
        flow=_order_status_flow(order) if chips else None,
    )


def get_order_by_number(*, tenant: Tenant, business: Business, number: str) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    order = find_order(tenant=tenant, business=business, number=number)
    if order is None:
        return f"No order found for #{number}."
    return _order_detail_pack(order)


def list_open_orders(*, tenant: Tenant, business: Business, offset: int = 0) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    open_statuses = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERY_FAILED,
    ]
    all_rows = list(
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business, status__in=open_statuses)
        .select_related("customer")
        .order_by("-created_at")[:200]
    )
    if not all_rows:
        return "No open orders right now."
    rows, page = slice_page(all_rows, offset=offset)
    total = len(all_rows)
    start = page["offset"]
    lines = [f"{total} open order{'s' if total != 1 else ''} — showing {start + 1}–{start + len(rows)}:"]
    links = []
    for order in rows:
        customer = _customer_label(order.customer)
        tag = _fulfillment_tag(order)
        lines.append(
            f"• {order.order_number} — [{tag}] — {customer} — {order.status} — {_money(order.total)}"
        )
        links.append(_order_link(order, action="preview"))
    page.update({"list": "open_orders", "more_label": "Show more open orders"})
    return pack_reply("\n".join(lines), links=links, page=page)


def list_online_orders(*, tenant: Tenant, business: Business, offset: int = 0) -> dict[str, Any] | str:
    """Open pickup/delivery orders (excludes counter/POS) — matches ops 'Online orders'."""
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    open_statuses = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERY_FAILED,
    ]
    all_rows = list(
        ShopOrder.objects.require_tenant(tenant)
        .filter(
            business=business,
            status__in=open_statuses,
            fulfillment_mode__in=[FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY],
        )
        .select_related("customer")
        .order_by("-created_at")[:200]
    )
    if not all_rows:
        return "No open online orders right now (pickup/delivery)."
    rows, page = slice_page(all_rows, offset=offset)
    total = len(all_rows)
    start = page["offset"]
    lines = [
        f"{total} open online order{'s' if total != 1 else ''} (pickup/delivery) — "
        f"showing {start + 1}–{start + len(rows)}:"
    ]
    links = []
    for order in rows:
        customer = _customer_label(order.customer)
        tag = _fulfillment_tag(order)
        lines.append(
            f"• {order.order_number} — [{tag}] — {customer} — {order.status} — {_money(order.total)}"
        )
        links.append(_order_link(order, action="preview"))
    page.update({"list": "online_orders", "more_label": "Show more online orders"})
    return pack_reply("\n".join(lines), links=links, page=page)


def find_order(*, tenant: Tenant, business: Business, number: str) -> ShopOrder | None:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return None
    q = (number or "").strip().lstrip("#")
    if not q:
        return None
    order = (
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(order_number__iexact=q) | Q(order_number__iexact=f"#{q}"))
        .select_related("customer")
        .first()
    )
    if order is not None:
        return order
    if _looks_like_uuid(q):
        by_id = (
            ShopOrder.objects.require_tenant(tenant)
            .filter(business=business, id=q)
            .select_related("customer")
            .first()
        )
        if by_id is not None:
            return by_id
    # Avoid matching every order that happens to contain a 1-char fragment like "s".
    if len(q) < 3:
        return None
    return (
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business, order_number__icontains=q)
        .select_related("customer")
        .order_by("-created_at")
        .first()
    )


def prompt_change_order_status(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    """Interactive kickoff: list open orders and ask which one to update."""
    listed = list_open_orders(tenant=tenant, business=business, offset=0)
    if isinstance(listed, str):
        return listed
    text, links, _chips, page, _flow = unpack_reply(listed)
    select_links = []
    for link in links:
        select_links.append(
            entity_link(
                kind=str(link.get("kind") or "order"),
                id=str(link.get("id") or ""),
                label=str(link.get("label") or ""),
                subtitle=str(link.get("subtitle") or ""),
                action="select",
                select_text=str(link.get("label") or ""),
                badge=str(link.get("badge") or "") or None,
            )
        )
    chips = [str(link.get("label") or "") for link in select_links if link.get("label")][:LIST_PAGE_SIZE]
    payload = pack_reply(
        f"{text}\n\nWhich order should I update? Tap an order below (or type the number).",
        links=select_links,
        suggestions=chips,
    )
    if page:
        payload["page"] = {
            **page,
            "list": "order_status_pick",
            "more_label": "Show more open orders",
        }
    return payload


def prompt_order_status_choice(*, order: ShopOrder) -> dict[str, Any]:
    customer = _customer_label(order.customer)
    tag = _fulfillment_tag(order)
    chips = _next_order_status_chips(order, short=True)
    if not chips:
        return pack_reply(
            f"Order {order.order_number} — [{tag}] — {customer} · currently {order.status}.\n"
            "This order has no further status steps.",
            links=[_order_link(order, action="open", open_label=True)],
            suggestions=["Online orders", "Open orders"],
        )
    return pack_reply(
        f"Order {order.order_number} — [{tag}] — {customer} · currently {order.status}.\n"
        "What should I do next? Tap a chip below.",
        links=[_order_link(order, action="open", open_label=True)],
        suggestions=chips,
        flow=_order_status_flow(order),
    )


def low_stock_products(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        return "Products are not enabled on your Orbit Mart plan."
    from django.db.models import F

    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(stock_on_hand__lte=F("low_stock_threshold"))
        .order_by("stock_on_hand")[:10]
    )
    if not products:
        products = list(
            ShopProduct.objects.require_tenant(tenant)
            .filter(business=business, is_active=True, stock_on_hand__lte=5)
            .order_by("stock_on_hand")[:10]
        )
    if not products:
        return "No low-stock products found."
    lines = ["Low stock:"]
    links = []
    for product in products:
        lines.append(f"• {product.name} — {product.stock_on_hand} on hand (SKU {product.sku or '—'})")
        links.append(
            entity_link(
                kind="product",
                id=str(product.id),
                label=product.name,
                subtitle=f"Stock {product.stock_on_hand}",
            )
        )
    return pack_reply("\n".join(lines), links=links)


def search_products(*, tenant: Tenant, business: Business, query: str) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        return "Products are not enabled on your Orbit Mart plan."
    q = query.strip()
    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(name__icontains=q) | Q(sku__icontains=q))
        .order_by("name")[:8]
    )
    if not products:
        return f"No products matching “{q}”."
    lines = [f"Products matching “{q}”. Tap one or ask for stock/price by exact name:"]
    links = []
    chips = []
    for product in products:
        lines.append(f"• {product.name} — stock {product.stock_on_hand} — SKU {product.sku or '—'}")
        links.append(
            entity_link(
                kind="product",
                id=str(product.id),
                label=product.name,
                subtitle=f"Stock {product.stock_on_hand} · {_money(product.price)}",
            )
        )
        chips.append(f"Stock of {product.name}")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5])


def count_bookings_for_date(
    *, tenant: Tenant, business: Business, day, offset: int = 0
) -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    qs = Booking.objects.require_tenant(tenant).filter(business=business, appointment_date=day).exclude(
        status__in=[BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED]
    )
    total = qs.count()
    label = "today" if day == timezone.localdate() else day.isoformat()
    if total == 0:
        return f"No bookings {label}."
    all_rows = list(qs.order_by("start_at")[:200])
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    lines = [f"{total} booking{'s' if total != 1 else ''} {label} — showing {start + 1}–{start + len(rows)}:"]
    links = []
    for booking in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
        when = timezone.localtime(booking.start_at).strftime("%H:%M")
        lines.append(f"• {booking.booking_number} — {_customer_label(customer)} — {when} — {booking.status}")
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=f"{_customer_label(customer)} · {when} · {booking.status}",
                action="preview",
            )
        )
    page.update(
        {
            "list": "bookings_for_date",
            "day": day.isoformat(),
            "more_label": f"Show more bookings {label}",
        }
    )
    return pack_reply("\n".join(lines), links=links, page=page)


def get_booking(*, tenant: Tenant, business: Business, number: str) -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    booking = find_booking(tenant=tenant, business=business, number=number)
    if booking is None:
        return f"No booking found for {number}."
    return _booking_detail_pack(tenant=tenant, booking=booking)


def find_booking(*, tenant: Tenant, business: Business, number: str) -> Booking | None:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return None
    q = (number or "").strip().lstrip("#")
    if not q:
        return None
    booking = (
        Booking.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(booking_number__iexact=q) | Q(booking_number__iexact=f"#{q}"))
        .first()
    )
    if booking is not None:
        return booking
    if _looks_like_uuid(q):
        booking = Booking.objects.require_tenant(tenant).filter(business=business, id=q).first()
        if booking is not None:
            return booking
    if len(q) < 3:
        return None
    return (
        Booking.objects.require_tenant(tenant)
        .filter(business=business, booking_number__icontains=q)
        .order_by("-start_at")
        .first()
    )


_BOOKING_STATUS_SHORT_LABELS = {
    "pending": "Set pending",
    "confirmed": "Confirm",
    "cancelled": "Cancel",
    "rejected": "Reject",
    "checked_in": "Check in",
    "in_progress": "Start",
    "completed": "Complete",
    "no_show": "No-show",
}

# Staff-facing forward next steps (subset of ALLOWED_TRANSITIONS — no prior statuses).
_BOOKING_FORWARD_TRANSITIONS: dict[str, tuple[str, ...]] = {
    BookingStatus.DRAFT: (BookingStatus.PENDING, BookingStatus.CANCELLED),
    BookingStatus.PENDING: (BookingStatus.CONFIRMED, BookingStatus.CANCELLED),
    BookingStatus.CONFIRMED: (
        BookingStatus.CHECKED_IN,
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
        BookingStatus.CANCELLED,
    ),
    BookingStatus.CHECKED_IN: (
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
    ),
    BookingStatus.IN_PROGRESS: (BookingStatus.COMPLETED, BookingStatus.CANCELLED),
    BookingStatus.RESCHEDULED: (BookingStatus.CONFIRMED, BookingStatus.CANCELLED),
    BookingStatus.COMPLETED: (),
    BookingStatus.CANCELLED: (),
    BookingStatus.REJECTED: (),
    BookingStatus.NO_SHOW: (),
    BookingStatus.EXPIRED: (),
}


def _allowed_next_booking_statuses(booking: Booking) -> list[str]:
    return list(_BOOKING_FORWARD_TRANSITIONS.get(str(booking.status or ""), ()))


def _next_booking_status_chips(booking: Booking, *, short: bool = False) -> list[str]:
    number = booking.booking_number

    def mark(as_status: str) -> str:
        if short:
            return _BOOKING_STATUS_SHORT_LABELS.get(as_status, as_status)
        return f"mark booking {number} as {as_status}"

    return [mark(status) for status in _allowed_next_booking_statuses(booking)]


def _booking_status_flow(booking: Booking) -> dict[str, Any]:
    return {
        "type": "booking_status",
        "step": "pick_status",
        "booking_number": booking.booking_number,
        "booking_id": str(booking.id),
    }


def _booking_detail_pack(*, tenant: Tenant, booking: Booking) -> dict[str, Any]:
    customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
    when = timezone.localtime(booking.start_at).strftime("%Y-%m-%d %H:%M")
    chips = _next_booking_status_chips(booking, short=True)
    lines = [
        f"Booking {booking.booking_number}",
        f"Customer: {_customer_label(customer)}",
        f"When: {when}",
        f"Status: {booking.status}",
    ]
    if not chips:
        lines.append("No further status changes from here.")
    return pack_reply(
        "\n".join(lines),
        links=[
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=f"Open {booking.booking_number}",
                subtitle=f"{_customer_label(customer)} · {booking.status}",
                action="open",
            )
        ],
        suggestions=chips,
        flow=_booking_status_flow(booking) if chips else None,
    )


def prompt_booking_status_choice(*, tenant: Tenant, booking: Booking) -> dict[str, Any]:
    customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
    chips = _next_booking_status_chips(booking, short=True)
    if not chips:
        return pack_reply(
            f"Booking {booking.booking_number} — {_customer_label(customer)} · currently {booking.status}.\n"
            "This booking has no further status steps.",
            links=[
                entity_link(
                    kind="booking",
                    id=str(booking.id),
                    label=f"Open {booking.booking_number}",
                    subtitle=f"{_customer_label(customer)} · {booking.status}",
                    action="open",
                )
            ],
            suggestions=["Pending bookings", "Bookings today"],
        )
    return pack_reply(
        f"Booking {booking.booking_number} — {_customer_label(customer)} · currently {booking.status}.\n"
        "What should I do next? Tap a chip below.",
        links=[
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=f"Open {booking.booking_number}",
                subtitle=f"{_customer_label(customer)} · {booking.status}",
                action="open",
            )
        ],
        suggestions=chips,
        flow=_booking_status_flow(booking),
    )


def find_customer(*, tenant: Tenant, business: Business, query: str, offset: int = 0) -> dict[str, Any] | str:
    q = query.strip()
    all_rows = list(
        Customer.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(
            Q(phone_number__icontains=q)
            | Q(display_name__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(email__icontains=q)
        )
        .order_by("display_name")[:200]
    )
    if not all_rows:
        return f"No customers matching “{q}”."
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    total = len(all_rows)
    lines = [
        f"{total} customer{'s' if total != 1 else ''} matching “{q}” — "
        f"showing {start + 1}–{start + len(rows)}. Tap one for details:"
    ]
    links = []
    for customer in rows:
        phone = customer.phone_number or "—"
        label = _customer_label(customer)
        lines.append(f"• {label} — {phone}")
        links.append(
            entity_link(kind="customer", id=str(customer.id), label=label, subtitle=phone, action="preview")
        )
    page.update({"list": "find_customer", "query": q, "more_label": "Show more customers"})
    return pack_reply("\n".join(lines), links=links, page=page)


def sales_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    today = timezone.localdate()
    qs = (
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business, created_at__date=today)
        .exclude(status=OrderStatus.CANCELLED)
    )
    total = qs.count()
    revenue = qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
    completed = qs.filter(status=OrderStatus.COMPLETED).count()
    return (
        f"Sales today: {total} order{'s' if total != 1 else ''} · "
        f"{_money(revenue)} total · {completed} completed."
    )


def orders_for_date(*, tenant: Tenant, business: Business, day, offset: int = 0) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    qs = ShopOrder.objects.require_tenant(tenant).filter(business=business, created_at__date=day)
    total = qs.count()
    label = "yesterday" if day == timezone.localdate() - timedelta(days=1) else day.isoformat()
    if total == 0:
        return f"No orders {label}."
    revenue = (
        qs.exclude(status=OrderStatus.CANCELLED).aggregate(s=Sum("total"))["s"] or Decimal("0")
    )
    all_rows = list(qs.select_related("customer").order_by("-created_at")[:200])
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    lines = [
        f"{total} order{'s' if total != 1 else ''} {label} · {_money(revenue)} (ex-cancelled) — "
        f"showing {start + 1}–{start + len(rows)}:"
    ]
    links = []
    for order in rows:
        customer = _customer_label(order.customer)
        tag = _fulfillment_tag(order)
        lines.append(
            f"• {order.order_number} — [{tag}] — {customer} — {order.status} — {_money(order.total)}"
        )
        links.append(_order_link(order, action="preview"))
    page.update(
        {
            "list": "orders_for_date",
            "day": day.isoformat(),
            "more_label": f"Show more orders {label}",
        }
    )
    return pack_reply("\n".join(lines), links=links, page=page)


def list_orders_by_status(
    *, tenant: Tenant, business: Business, status: str, offset: int = 0
) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        return "Online orders are not enabled on your Orbit Mart plan."
    all_rows = list(
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business, status=status)
        .select_related("customer")
        .order_by("-created_at")[:200]
    )
    label = status.replace("_", " ")
    if not all_rows:
        return f"No {label} orders."
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    total = len(all_rows)
    lines = [f"{total} {label} order{'s' if total != 1 else ''} — showing {start + 1}–{start + len(rows)}:"]
    links = []
    for order in rows:
        customer = _customer_label(order.customer)
        tag = _fulfillment_tag(order)
        lines.append(f"• {order.order_number} — [{tag}] — {customer} — {_money(order.total)}")
        links.append(_order_link(order, action="preview"))
    page.update(
        {
            "list": "orders_by_status",
            "status": status,
            "more_label": f"Show more {label} orders",
        }
    )
    return pack_reply("\n".join(lines), links=links, page=page)


def out_of_stock_products(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        return "Products are not enabled on your Orbit Mart plan."
    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True, stock_on_hand__lte=0)
        .order_by("name")[:12]
    )
    if not products:
        return "No out-of-stock products."
    lines = ["Out of stock:"]
    links = []
    for product in products:
        lines.append(f"• {product.name} — SKU {product.sku or '—'}")
        links.append(entity_link(kind="product", id=str(product.id), label=product.name, subtitle="Out of stock"))
    return pack_reply("\n".join(lines), links=links)


def stock_of_product(*, tenant: Tenant, business: Business, query: str) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        return "Products are not enabled on your Orbit Mart plan."
    q = query.strip()
    products = list(
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(name__icontains=q) | Q(sku__icontains=q))
        .order_by("name")[:8]
    )
    if not products:
        return f"No products matching “{q}”."
    lines = [f"Stock for “{q}”:"]
    links = []
    for product in products:
        lines.append(f"• {product.name} — {product.stock_on_hand} on hand — SKU {product.sku or '—'}")
        links.append(
            entity_link(
                kind="product",
                id=str(product.id),
                label=product.name,
                subtitle=f"Stock {product.stock_on_hand}",
            )
        )
    return pack_reply("\n".join(lines), links=links)


def pending_returns(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE):
        return "Returns are not enabled on your Orbit Mart plan."
    rows = list(
        ShopReturn.objects.require_tenant(tenant)
        .filter(business=business, status=ReturnStatus.PENDING)
        .select_related("order", "customer")
        .order_by("-created_at")[:10]
    )
    if not rows:
        return "No pending returns."
    lines = [f"{len(rows)} pending return{'s' if len(rows) != 1 else ''}:"]
    links = []
    for item in rows:
        order_no = item.order.order_number if item.order_id else "—"
        lines.append(
            f"• {item.return_number} — order {order_no} — {_customer_label(item.customer)} — "
            f"{_money(item.refund_total)}"
        )
        links.append(
            entity_link(
                kind="return",
                id=str(item.id),
                label=item.return_number,
                subtitle=f"Order {order_no}",
                order_id=str(item.order_id) if item.order_id else None,
            )
        )
    return pack_reply("\n".join(lines), links=links)


def get_return(*, tenant: Tenant, business: Business, number: str) -> dict[str, Any] | str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE):
        return "Returns are not enabled on your Orbit Mart plan."
    item = (
        ShopReturn.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(return_number__iexact=number) | Q(return_number__icontains=number))
        .select_related("order", "customer")
        .first()
    )
    if item is None and _looks_like_uuid(number):
        item = (
            ShopReturn.objects.require_tenant(tenant)
            .filter(business=business, id=number)
            .select_related("order", "customer")
            .first()
        )
    if item is None:
        return f"No return found for {number}."
    order_no = item.order.order_number if item.order_id else "—"
    text = "\n".join(
        [
            f"Return {item.return_number}",
            f"Order: {order_no}",
            f"Customer: {_customer_label(item.customer)}",
            f"Status: {item.status}",
            f"Refund: {_money(item.refund_total)}",
        ]
        + ([f"Reason: {item.reason}"] if item.reason else [])
    )
    return pack_reply(
        text,
        links=[
            entity_link(
                kind="return",
                id=str(item.id),
                label=f"Open {item.return_number}",
                subtitle=f"Order {order_no}",
                order_id=str(item.order_id) if item.order_id else None,
                action="open",
            )
        ],
    )


def active_coupons(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_COUPONS, product_code=PRODUCT_SHOPIE):
        return "Coupons are not enabled on your Orbit Mart plan."
    now = timezone.now()
    qs = ShopCoupon.objects.require_tenant(tenant).filter(business=business, is_active=True)
    qs = qs.filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
    qs = qs.filter(Q(ends_at__isnull=True) | Q(ends_at__gte=now))
    coupons = list(qs.order_by("-created_at")[:10])
    if not coupons:
        return "No active coupons."
    lines = ["Active coupons:"]
    for coupon in coupons:
        if coupon.discount_type == DiscountType.PERCENT:
            deal = f"{coupon.discount_value}% off"
        else:
            deal = f"{_money(coupon.discount_value)} off"
        lines.append(f"• {coupon.code} — {coupon.name} — {deal}")
    return "\n".join(lines)


def books_sales_today(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_BOOKS_SALE, product_code=PRODUCT_SHOPIE):
        return "Books sales are not enabled on your Orbit Mart plan."
    today = timezone.localdate()
    qs = ShopBooksVoucher.objects.require_tenant(tenant).filter(
        business=business,
        voucher_type=VoucherType.SALE,
        voucher_date=today,
    ).exclude(status=VoucherStatus.CANCELLED)
    total = qs.count()
    revenue = qs.aggregate(s=Sum("total"))["s"] or Decimal("0")
    if total == 0:
        return "No books sales today."
    return f"Books sales today: {total} voucher{'s' if total != 1 else ''} · {_money(revenue)}."


def pending_bookings(*, tenant: Tenant, business: Business, offset: int = 0) -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    all_rows = list(
        Booking.objects.require_tenant(tenant)
        .filter(business=business, status=BookingStatus.PENDING)
        .order_by("start_at")[:200]
    )
    if not all_rows:
        return "No pending bookings waiting for confirm."
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    total = len(all_rows)
    lines = [f"{total} pending booking{'s' if total != 1 else ''} — showing {start + 1}–{start + len(rows)}:"]
    links = []
    for booking in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
        when = timezone.localtime(booking.start_at).strftime("%Y-%m-%d %H:%M")
        lines.append(f"• {booking.booking_number} — {_customer_label(customer)} — {when}")
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=f"{_customer_label(customer)} · pending · {when}",
                action="preview",
            )
        )
    page.update({"list": "pending_bookings", "more_label": "Show more pending bookings"})
    return pack_reply("\n".join(lines), links=links, page=page)


def upcoming_bookings(*, tenant: Tenant, business: Business, offset: int = 0) -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    now = timezone.now()
    all_rows = list(
        Booking.objects.require_tenant(tenant)
        .filter(business=business, start_at__gte=now)
        .exclude(
            status__in=[
                BookingStatus.CANCELLED,
                BookingStatus.REJECTED,
                BookingStatus.EXPIRED,
                BookingStatus.COMPLETED,
                BookingStatus.NO_SHOW,
            ]
        )
        .order_by("start_at")[:200]
    )
    if not all_rows:
        return "No upcoming bookings."
    rows, page = slice_page(all_rows, offset=offset)
    start = page["offset"]
    total = len(all_rows)
    lines = [f"{total} upcoming booking{'s' if total != 1 else ''} — showing {start + 1}–{start + len(rows)}:"]
    links = []
    for booking in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
        when = timezone.localtime(booking.start_at).strftime("%a %H:%M")
        lines.append(
            f"• {booking.booking_number} — {_customer_label(customer)} — {when} — {booking.status}"
        )
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=f"{_customer_label(customer)} · {when}",
                action="preview",
            )
        )
    page.update({"list": "upcoming_bookings", "more_label": "Show more upcoming bookings"})
    return pack_reply("\n".join(lines), links=links, page=page)


def bookings_this_week(*, tenant: Tenant, business: Business) -> str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    today = timezone.localdate()
    week_end = today + timedelta(days=6)
    qs = (
        Booking.objects.require_tenant(tenant)
        .filter(business=business, appointment_date__gte=today, appointment_date__lte=week_end)
        .exclude(
            status__in=[BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED]
        )
    )
    total = qs.count()
    if total == 0:
        return "No bookings in the next 7 days."
    by_status: dict[str, int] = {}
    for row in qs.values_list("status", flat=True):
        by_status[row] = by_status.get(row, 0) + 1
    parts = ", ".join(f"{count} {status}" for status, count in sorted(by_status.items()))
    return f"{total} booking{'s' if total != 1 else ''} over the next 7 days ({parts})."


def no_shows_today(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        return "Bookings are not enabled on your Orbit Appoint plan."
    today = timezone.localdate()
    rows = list(
        Booking.objects.require_tenant(tenant)
        .filter(business=business, appointment_date=today, status=BookingStatus.NO_SHOW)
        .order_by("start_at")[:10]
    )
    if not rows:
        return "No no-shows today."
    lines = [f"{len(rows)} no-show{'s' if len(rows) != 1 else ''} today:"]
    links = []
    for booking in rows:
        customer = Customer.objects.require_tenant(tenant).filter(id=booking.customer_id).first()
        lines.append(f"• {booking.booking_number} — {_customer_label(customer)}")
        links.append(
            entity_link(
                kind="booking",
                id=str(booking.id),
                label=booking.booking_number,
                subtitle=_customer_label(customer),
            )
        )
    return pack_reply("\n".join(lines), links=links)


def list_services(*, tenant: Tenant, business: Business, query: str = "") -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_SERVICES, product_code=PRODUCT_APPOINTIE
    ):
        return "Services are not enabled on your Orbit Appoint plan."
    qs = Service.objects.require_tenant(tenant).filter(business=business, status=ServiceStatus.ACTIVE)
    q = (query or "").strip()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(display_name__icontains=q) | Q(service_code__icontains=q))
    services = list(qs.order_by("display_name")[:12])
    if not services:
        return f"No services matching “{q}”." if q else "No active services."
    title = f"Services matching “{q}”:" if q else "Active services:"
    lines = [title]
    links = []
    chips = []
    for service in services:
        name = service.display_name or service.name
        lines.append(f"• {name}")
        links.append(entity_link(kind="service", id=str(service.id), label=name, subtitle="Service"))
        chips.append(f"Service details for {name}")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5] if q else None)


def list_staff(*, tenant: Tenant, business: Business, query: str = "") -> dict[str, Any] | str:
    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_STAFF, product_code=PRODUCT_APPOINTIE
    ):
        return "Staff is not enabled on your Orbit Appoint plan."
    qs = Staff.objects.require_tenant(tenant).filter(
        business=business, employment_status=EmploymentStatus.ACTIVE
    )
    q = (query or "").strip()
    if q:
        qs = qs.filter(
            Q(display_name__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
            | Q(staff_code__icontains=q)
        )
    staff = list(qs.order_by("display_name")[:12])
    if not staff:
        return f"No staff matching “{q}”." if q else "No active staff."
    title = f"Staff matching “{q}”:" if q else "Active staff:"
    lines = [title]
    links = []
    chips = []
    for member in staff:
        role = member.designation or ("Bookable" if member.is_bookable else "Non-bookable")
        lines.append(f"• {member.display_name} — {role}")
        links.append(
            entity_link(kind="staff", id=str(member.id), label=member.display_name, subtitle=role)
        )
        chips.append(f"{member.display_name}'s bookings today")
    return pack_reply("\n".join(lines), links=links, suggestions=chips[:5] if q else None)


def new_customers_today(*, tenant: Tenant, business: Business) -> dict[str, Any] | str:
    today = timezone.localdate()
    qs = Customer.objects.require_tenant(tenant).filter(business=business, created_at__date=today)
    total = qs.count()
    if total == 0:
        return "No new customers today."
    rows = list(qs.order_by("-created_at")[:8])
    lines = [f"{total} new customer{'s' if total != 1 else ''} today:"]
    links = []
    for customer in rows:
        label = _customer_label(customer)
        phone = customer.phone_number or "—"
        lines.append(f"• {label} — {phone}")
        links.append(entity_link(kind="customer", id=str(customer.id), label=label, subtitle=phone))
    return pack_reply("\n".join(lines), links=links)


def customer_count(*, tenant: Tenant, business: Business) -> str:
    total = Customer.objects.require_tenant(tenant).filter(business=business).count()
    return f"You have {total} customer{'s' if total != 1 else ''} in this business."


def today_overview(*, tenant: Tenant, business: Business, access: AssistantAccess) -> str:
    parts: list[str] = ["Today overview:"]
    if access.mart_enabled and has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE
    ):
        parts.append(sales_today(tenant=tenant, business=business))
        open_count = (
            ShopOrder.objects.require_tenant(tenant)
            .filter(
                business=business,
                status__in=[
                    OrderStatus.PENDING,
                    OrderStatus.CONFIRMED,
                    OrderStatus.READY,
                    OrderStatus.OUT_FOR_DELIVERY,
                ],
            )
            .count()
        )
        parts.append(f"{open_count} open order{'s' if open_count != 1 else ''}.")
    if access.mart_enabled and has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE
    ):
        pending = (
            ShopReturn.objects.require_tenant(tenant)
            .filter(business=business, status=ReturnStatus.PENDING)
            .count()
        )
        parts.append(f"{pending} pending return{'s' if pending != 1 else ''}.")
    if access.mart_enabled and has_domain_feature(
        business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE
    ):
        low = (
            ShopProduct.objects.require_tenant(tenant)
            .filter(business=business, is_active=True, stock_on_hand__lte=5)
            .count()
        )
        parts.append(f"{low} product{'s' if low != 1 else ''} at ≤5 stock.")
    if access.appoint_enabled and has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        parts.append(
            count_bookings_for_date(tenant=tenant, business=business, day=timezone.localdate())
        )
        pending = (
            Booking.objects.require_tenant(tenant)
            .filter(business=business, status=BookingStatus.PENDING)
            .count()
        )
        parts.append(f"{pending} booking{'s' if pending != 1 else ''} awaiting confirm.")
    if len(parts) == 1:
        return "Nothing to summarize for enabled products today."
    return "\n".join(parts)


def propose_stock_add(*, tenant: Tenant, business: Business, query: str, quantity: Decimal) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Products are not enabled on your Orbit Mart plan."})
    if quantity <= 0:
        raise ValidationError({"detail": "Add quantity must be greater than zero."})
    product = (
        ShopProduct.objects.require_tenant(tenant)
        .filter(business=business, is_active=True)
        .filter(Q(sku__iexact=query) | Q(name__icontains=query))
        .order_by("name")
        .first()
    )
    if product is None:
        raise ValidationError({"detail": f"No product found for “{query}”."})
    target = product.stock_on_hand + quantity
    return {
        "action_type": "product.add_stock",
        "summary": f"Add {quantity} to {product.name} (now {product.stock_on_hand} → {target}).",
        "payload": {
            "product_id": str(product.id),
            "product_name": product.name,
            "sku": product.sku,
            "delta": str(quantity),
            "from_qty": str(product.stock_on_hand),
            "to_qty": str(target),
        },
    }


def propose_return_complete(*, tenant: Tenant, business: Business, number: str) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_RETURNS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Returns are not enabled on your Orbit Mart plan."})
    item = (
        ShopReturn.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(return_number__iexact=number) | Q(return_number__icontains=number))
        .first()
    )
    if item is None:
        raise ValidationError({"detail": f"No return found for {number}."})
    if item.status == ReturnStatus.COMPLETED:
        raise ValidationError({"detail": f"Return {item.return_number} is already completed."})
    if item.status == ReturnStatus.REJECTED:
        raise ValidationError({"detail": f"Return {item.return_number} was rejected."})
    return {
        "action_type": "return.complete",
        "summary": f"Complete return {item.return_number} (refund {_money(item.refund_total)}).",
        "payload": {
            "return_id": str(item.id),
            "return_number": item.return_number,
            "from_status": item.status,
        },
    }


def preview_record(*, tenant: Tenant, business: Business, kind: str, record_id: str) -> dict[str, Any] | str:
    """Fetch important details for a record without leaving chat."""
    kind_key = (kind or "").strip().lower()
    rid = (record_id or "").strip()
    if not rid:
        return "Missing record id."

    if kind_key == "order":
        order = (
            ShopOrder.objects.require_tenant(tenant)
            .filter(business=business, id=rid)
            .select_related("customer")
            .first()
        )
        if order is None:
            order = find_order(tenant=tenant, business=business, number=rid)
        if order is None:
            return "Order not found."
        return _order_detail_pack(order)

    if kind_key == "booking":
        booking = find_booking(tenant=tenant, business=business, number=rid)
        if booking is None:
            return "Booking not found."
        return _booking_detail_pack(tenant=tenant, booking=booking)

    if kind_key == "customer":
        return toolset_get_customer_detail(tenant=tenant, business=business, query=rid)

    if kind_key == "return":
        return get_return(tenant=tenant, business=business, number=rid)

    if kind_key == "product":
        product = (
            ShopProduct.objects.require_tenant(tenant)
            .filter(business=business, id=rid)
            .first()
        )
        if product is None:
            return "Product not found."
        text = "\n".join(
            [
                f"Product {product.name}",
                f"SKU: {product.sku or '—'}",
                f"Price: {_money(product.price)}",
                f"Stock on hand: {product.stock_on_hand}",
            ]
        )
        return pack_reply(
            text,
            links=[
                entity_link(
                    kind="product",
                    id=str(product.id),
                    label=f"Open {product.name}",
                    subtitle="Full product screen",
                    action="open",
                )
            ],
            suggestions=[f"Stock of {product.name}", f"Set stock of {product.name} to {product.stock_on_hand}"],
        )

    if kind_key == "service":
        from apps.assistant.services import tools_ops as ops

        return ops.get_service_detail(tenant=tenant, business=business, query=rid)

    if kind_key == "staff":
        staff = Staff.objects.require_tenant(tenant).filter(business=business, id=rid).first()
        if staff is None:
            return "Staff not found."
        role = staff.designation or ("Bookable" if staff.is_bookable else "Non-bookable")
        text = "\n".join(
            [
                f"Staff {staff.display_name}",
                f"Role: {role}",
                f"Code: {staff.staff_code or '—'}",
                f"Status: {staff.employment_status}",
            ]
        )
        return pack_reply(
            text,
            links=[
                entity_link(
                    kind="staff",
                    id=str(staff.id),
                    label=f"Open {staff.display_name}",
                    subtitle="Full staff screen",
                    action="open",
                )
            ],
            suggestions=[f"{staff.display_name}'s bookings today"],
        )

    return f"I can’t preview “{kind_key}” yet."


def toolset_get_customer_detail(*, tenant: Tenant, business: Business, query: str) -> dict[str, Any] | str:
    from apps.assistant.services import tools_ops as ops

    return ops.get_customer_detail(tenant=tenant, business=business, query=query)


def continue_paged_list(*, tenant: Tenant, business: Business, flow: dict[str, Any]) -> dict[str, Any] | str:
    """Resume a paginated list from assistant flow metadata."""
    list_key = str(flow.get("list") or "")
    offset = int(flow.get("offset") or 0)
    if list_key in {"open_orders", "order_status_pick"}:
        result = list_open_orders(tenant=tenant, business=business, offset=offset)
        if list_key == "order_status_pick" and isinstance(result, dict):
            text, links, _chips, page, _flow = unpack_reply(result)
            select_links = [
                entity_link(
                    kind=str(link.get("kind") or "order"),
                    id=str(link.get("id") or ""),
                    label=str(link.get("label") or ""),
                    subtitle=str(link.get("subtitle") or ""),
                    action="select",
                    select_text=str(link.get("label") or ""),
                    badge=str(link.get("badge") or "") or None,
                )
                for link in links
            ]
            chips = [str(link.get("label") or "") for link in select_links if link.get("label")]
            payload = pack_reply(
                f"{text}\n\nWhich order should I update? Tap an order below.",
                links=select_links,
                suggestions=chips,
            )
            if page:
                payload["page"] = {**page, "list": "order_status_pick", "more_label": "Show more open orders"}
            return payload
        return result
    if list_key == "online_orders":
        return list_online_orders(tenant=tenant, business=business, offset=offset)
    if list_key == "orders_today":
        return count_orders_today(tenant=tenant, business=business, offset=offset)
    if list_key == "orders_by_status":
        status = str(flow.get("status") or OrderStatus.PENDING)
        return list_orders_by_status(tenant=tenant, business=business, status=status, offset=offset)
    if list_key == "orders_for_date":
        day_raw = str(flow.get("day") or "")
        try:
            day = timezone.datetime.fromisoformat(day_raw).date()
        except Exception:
            day = timezone.localdate() - timedelta(days=1)
        return orders_for_date(tenant=tenant, business=business, day=day, offset=offset)
    if list_key == "pending_bookings":
        return pending_bookings(tenant=tenant, business=business, offset=offset)
    if list_key == "upcoming_bookings":
        return upcoming_bookings(tenant=tenant, business=business, offset=offset)
    if list_key == "bookings_for_date":
        day_raw = str(flow.get("day") or "")
        try:
            day = timezone.datetime.fromisoformat(day_raw).date()
        except Exception:
            day = timezone.localdate()
        return count_bookings_for_date(tenant=tenant, business=business, day=day, offset=offset)
    if list_key == "find_customer":
        return find_customer(
            tenant=tenant,
            business=business,
            query=str(flow.get("query") or ""),
            offset=offset,
        )
    return "Nothing more to show."


def propose_order_status(*, tenant: Tenant, business: Business, number: str, status_raw: str) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_ORDERS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Online orders are not enabled on your Orbit Mart plan."})
    status_key = status_raw.strip().lower().replace("-", "_")
    new_status = ORDER_STATUS_ALIASES.get(status_key) or ORDER_STATUS_ALIASES.get(status_key.replace("_", " "))
    if not new_status:
        raise ValidationError({"detail": f"Unknown order status “{status_raw}”."})
    order = (
        ShopOrder.objects.require_tenant(tenant)
        .filter(business=business)
        .filter(Q(order_number__iexact=number) | Q(order_number__icontains=number))
        .select_related("customer")
        .first()
    )
    if order is None:
        raise ValidationError({"detail": f"No order found for #{number}."})
    allowed = _ORDER_SERVICE_ALLOWED.get(order.status, set())
    if new_status not in allowed:
        next_labels = _next_order_status_chips(order, short=True)
        if next_labels:
            hint = f" From {order.status}, next options are: {', '.join(next_labels)}."
        else:
            hint = f" Order {order.order_number} is already {order.status} — no further status changes."
        raise ValidationError(
            {
                "detail": (
                    f"Can’t move order {order.order_number} from {order.status} to {new_status}.{hint}"
                )
            }
        )
    return {
        "action_type": "order.update_status",
        "summary": f"Mark order {order.order_number} as {new_status} (now {order.status}).",
        "payload": {
            "order_id": str(order.id),
            "order_number": order.order_number,
            "from_status": order.status,
            "to_status": new_status,
        },
    }


def propose_booking_status(*, tenant: Tenant, business: Business, number: str, status_raw: str) -> dict[str, Any]:
    from apps.bookings.validators.booking import ALLOWED_TRANSITIONS

    if not has_domain_feature(
        business=business, feature=FEATURE_APPOINTIE_BOOKINGS, product_code=PRODUCT_APPOINTIE
    ):
        raise ValidationError({"detail": "Bookings are not enabled on your Orbit Appoint plan."})
    status_key = status_raw.strip().lower().replace("-", "_")
    new_status = (
        BOOKING_STATUS_ALIASES.get(status_key)
        or BOOKING_STATUS_ALIASES.get(status_key.replace("_", " "))
        or BOOKING_STATUS_ALIASES.get(status_raw.strip().lower())
    )
    if not new_status:
        raise ValidationError({"detail": f"Unknown booking status “{status_raw}”."})
    booking = find_booking(tenant=tenant, business=business, number=number)
    if booking is None:
        raise ValidationError({"detail": f"No booking found for {number}."})
    if new_status != booking.status:
        allowed = ALLOWED_TRANSITIONS.get(booking.status, set())
        if new_status not in allowed:
            next_labels = _next_booking_status_chips(booking, short=True)
            if next_labels:
                hint = f" From {booking.status}, next options are: {', '.join(next_labels)}."
            else:
                hint = (
                    f" Booking {booking.booking_number} is already {booking.status} — "
                    "no further status changes."
                )
            raise ValidationError(
                {
                    "detail": (
                        f"Can’t move booking {booking.booking_number} from {booking.status} "
                        f"to {new_status}.{hint}"
                    )
                }
            )
    return {
        "action_type": "booking.update_status",
        "summary": f"Mark booking {booking.booking_number} as {new_status} (now {booking.status}).",
        "payload": {
            "booking_id": str(booking.id),
            "booking_number": booking.booking_number,
            "from_status": booking.status,
            "to_status": new_status,
        },
    }


def propose_stock_set(*, tenant: Tenant, business: Business, query: str, quantity: Decimal) -> dict[str, Any]:
    if not has_domain_feature(business=business, feature=FEATURE_SHOPIE_PRODUCTS, product_code=PRODUCT_SHOPIE):
        raise ValidationError({"detail": "Products are not enabled on your Orbit Mart plan."})
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
        "action_type": "product.set_stock",
        "summary": f"Set stock of {product.name} to {quantity} (now {product.stock_on_hand}).",
        "payload": {
            "product_id": str(product.id),
            "product_name": product.name,
            "sku": product.sku,
            "from_qty": str(product.stock_on_hand),
            "to_qty": str(quantity),
        },
    }


def execute_proposed_action(
    *,
    tenant: Tenant,
    business: Business,
    action_type: str,
    payload: dict[str, Any],
    actor,
) -> dict[str, Any]:
    if action_type == "order.update_status":
        order = ShopOrder.objects.require_tenant(tenant).get(business=business, id=payload["order_id"])
        OrderService().transition(
            tenant=tenant,
            business=business,
            order=order,
            status=payload["to_status"],
        )
        return {"order_number": order.order_number, "status": payload["to_status"]}
    if action_type == "booking.update_status":
        booking = Booking.objects.require_tenant(tenant).get(business=business, id=payload["booking_id"])
        BookingService().transition(
            booking=booking,
            to_status=payload["to_status"],
            actor=actor,
            reason="Business Assistant",
        )
        return {"booking_number": booking.booking_number, "status": payload["to_status"]}
    if action_type == "product.set_stock":
        product = ShopProduct.objects.require_tenant(tenant).get(business=business, id=payload["product_id"])
        target = Decimal(str(payload["to_qty"]))
        delta = target - product.stock_on_hand
        CatalogService().adjust_stock(
            tenant=tenant,
            business=business,
            product=product,
            quantity_delta=delta,
            movement_type=StockMovementType.ADJUST,
            reason="Business Assistant",
        )
        product.refresh_from_db(fields=["stock_on_hand"])
        return {"product_name": product.name, "stock_on_hand": str(product.stock_on_hand)}
    if action_type == "product.add_stock":
        product = ShopProduct.objects.require_tenant(tenant).get(business=business, id=payload["product_id"])
        delta = Decimal(str(payload["delta"]))
        CatalogService().adjust_stock(
            tenant=tenant,
            business=business,
            product=product,
            quantity_delta=delta,
            movement_type=StockMovementType.RECEIVE,
            reason="Business Assistant",
        )
        product.refresh_from_db(fields=["stock_on_hand"])
        return {"product_name": product.name, "stock_on_hand": str(product.stock_on_hand)}
    if action_type == "return.complete":
        shop_return = ShopReturn.objects.require_tenant(tenant).get(
            business=business, id=payload["return_id"]
        )
        completed = ReturnService().complete_return(
            tenant=tenant, business=business, shop_return=shop_return
        )
        return {"return_number": completed.return_number, "status": completed.status}
    extra = execute_extra_action(
        tenant=tenant,
        business=business,
        action_type=action_type,
        payload=payload,
        actor=actor,
    )
    if extra is not None:
        return extra
    raise ValidationError({"detail": f"Unknown action type {action_type}."})


# Re-export ops tools so RulesBrain and tests can use apps.assistant.services.tools.*
from apps.assistant.services.tools_ops import (  # noqa: E402
    books_cash_summary,
    books_expenses_today,
    books_purchases_today,
    bookings_for_staff_today,
    customer_borrow_balance,
    customer_upcoming_bookings,
    find_coupon,
    get_customer_detail,
    get_service_detail,
    godown_stock_of_product,
    list_cash_accounts,
    list_godowns,
    list_orders_awaiting_payment,
    list_recent_reviews,
    low_rating_reviews,
    loyalty_points_for_customer,
    orders_for_customer,
    price_of_product,
    propose_deactivate_coupon,
    propose_order_payment,
    propose_set_product_price,
    reviews_summary,
    staff_on_duty_today,
    staff_workload_today,
)
