from __future__ import annotations

import logging
from decimal import Decimal

from apps.notifications.services.providers.email import (
    email_info_card,
    email_item_rows,
    email_progress_steps,
    email_totals_block,
    escape_email,
)
from apps.shopie.models import FulfillmentMode, OrderStatus, ShopOrder, ShopReturn, ShopShipment

logger = logging.getLogger("ie_orbit.shopie.notify")

ONLINE_FULFILLMENT = {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}
DELIVERY_METHOD_STANDARD = "standard"
DELIVERY_METHOD_INSTANT = "instant"

_DELIVERY_STEPS = ("Ordered", "Packed", "Out for delivery", "Delivered")
_PICKUP_STEPS = ("Ordered", "Confirmed", "Ready for pickup", "Picked up")


def _escape(value: object) -> str:
    return escape_email(value)


def _money(amount: object, currency: str) -> str:
    try:
        n = Decimal(str(amount or "0"))
    except Exception:
        return f"{currency} {amount}"
    code = (currency or "INR").strip() or "INR"
    if code.upper() == "INR":
        return f"₹{n.quantize(Decimal('0.01'))}"
    return f"{code} {n.quantize(Decimal('0.01'))}"


def _is_online(order: ShopOrder) -> bool:
    return str(order.fulfillment_mode or "").lower() in ONLINE_FULFILLMENT


def _customer_name(order: ShopOrder) -> str:
    customer = getattr(order, "customer", None)
    if customer is None:
        return "there"
    return str(getattr(customer, "display_name", "") or getattr(customer, "first_name", "") or "there")


def _delivery_method(order: ShopOrder) -> str:
    metadata = order.metadata if isinstance(order.metadata, dict) else {}
    return str(metadata.get("delivery_method") or DELIVERY_METHOD_STANDARD).lower()


def _is_standard_delivery(order: ShopOrder) -> bool:
    return (
        str(order.fulfillment_mode or "").lower() == FulfillmentMode.DELIVERY
        and _delivery_method(order) != DELIVERY_METHOD_INSTANT
    )


def _progress_index_for_status(order: ShopOrder, *, status: str, kicker: str) -> int:
    delivery = str(order.fulfillment_mode).lower() == "delivery"
    normalized = str(status or "").lower()
    kicker_l = str(kicker or "").lower()
    if normalized in {OrderStatus.COMPLETED, "delivered"} or "delivered" in kicker_l or "picked up" in kicker_l:
        return 3
    if normalized in {OrderStatus.OUT_FOR_DELIVERY, "picked_up", "nearby", "in_transit", "shipped"} or "on the way" in kicker_l or "shipped" in kicker_l or "out for delivery" in kicker_l:
        return 2
    if normalized in {OrderStatus.READY, "finding_rider", "rider_assigned", "at_pickup"} or "packed" in kicker_l or "ready" in kicker_l:
        return 2 if not delivery else 1
    if normalized == OrderStatus.CONFIRMED or "confirmed" in kicker_l:
        return 1
    return 0


def _order_extra_html(order: ShopOrder, *, kicker: str, shipment: ShopShipment | None = None, status: str = "") -> str:
    mode = "Delivery" if str(order.fulfillment_mode).lower() == "delivery" else "Pickup"
    address = str(order.delivery_address or "").strip()
    currency = order.currency or "INR"
    callout_lines = [f"Order #{order.order_number}", f"{mode}" + (f" · {address}" if address else "")]
    if shipment is not None:
        carrier = shipment.carrier_label or "Courier"
        awb = shipment.tracking_number or ""
        callout_lines.append(f"{carrier}" + (f" · AWB {awb}" if awb else ""))

    progress = email_progress_steps(
        _DELIVERY_STEPS if mode == "Delivery" else _PICKUP_STEPS,
        current_index=_progress_index_for_status(order, status=status or kicker, kicker=kicker),
    )

    item_rows = [
        {
            "name": line.product_name,
            "qty": line.quantity,
            "amount": _money(line.line_total, currency),
        }
        for line in list(order.lines.all())[:6]
    ]
    extra_count = max(0, order.lines.count() - 6)
    if extra_count:
        item_rows.append({"name": f"+{extra_count} more item{'s' if extra_count != 1 else ''}", "qty": "", "amount": ""})

    payment = str(getattr(order, "payment_status", "") or "").strip()
    totals = [("Order total", _money(order.total, currency))]
    if payment:
        totals.insert(0, ("Payment", payment.replace("_", " ").title()))

    return (
        email_info_card(title=kicker or "Order update", lines=callout_lines)
        + progress
        + email_item_rows(item_rows)
        + email_totals_block(totals)
    )


def _copy_for_status(order: ShopOrder, *, status: str) -> tuple[str, str, str]:
    name = _customer_name(order)
    shop = str(getattr(order.business, "display_name", "") or "the shop")
    number = order.order_number
    delivery = str(order.fulfillment_mode).lower() == "delivery"
    standard = _is_standard_delivery(order)
    if status == OrderStatus.PENDING:
        return (
            f"We've received your order · #{number}",
            f"Hi {name},\n\nThanks for shopping with {shop}. Order #{number} is in — we'll confirm it shortly and keep you posted here and by email.",
            "Order received",
        )
    if status == OrderStatus.CONFIRMED:
        return (
            f"Your order is confirmed · #{number}",
            f"Great news, {name}!\n\n{shop} confirmed order #{number} and is getting it ready.",
            "Confirmed",
        )
    if status == OrderStatus.READY:
        if delivery and standard:
            return (
                f"Packed and ready · #{number}",
                f"Hi {name},\n\nOrder #{number} is packed. {shop} will ship it soon and share tracking details here.",
                "Packed",
            )
        if delivery:
            return (
                f"Packed and ready · #{number}",
                f"Hi {name},\n\nOrder #{number} is packed. {shop} will request your rider when it is ready to hand over.",
                "Packed",
            )
        return (
            f"Ready for pickup · #{number}",
            f"Hi {name},\n\nOrder #{number} is ready. You can collect it from {shop} whenever you're nearby.",
            "Ready for pickup",
        )
    if status in {"finding_rider", "rider_assigned", "at_pickup"}:
        labels = {
            "finding_rider": "Finding your rider",
            "rider_assigned": "Rider assigned",
            "at_pickup": "Rider at the shop",
        }
        label = labels[status]
        return (
            f"{label} · #{number}",
            f"Hi {name},\n\n{label} for order #{number}. Open the order to see the latest ETA and rider details.",
            label,
        )
    if status in {OrderStatus.OUT_FOR_DELIVERY, "picked_up", "nearby"}:
        if standard:
            shipment = getattr(order, "shipment", None)
            carrier = getattr(shipment, "carrier_label", None) or "your courier"
            awb = getattr(shipment, "tracking_number", None) or ""
            body = (
                f"Hi {name},\n\nOrder #{number} has been shipped via {carrier}."
                f"{f' AWB {awb}.' if awb else ''} Open the order to track your shipment."
            )
            return (f"Shipped · #{number}", body, "Shipped")
        label = "Your delivery is nearby" if status == "nearby" else "Your order is on the way"
        return (
            f"{label} · #{number}",
            f"Hi {name},\n\nOrder #{number} is with your rider. Open the order for live delivery updates.",
            "On the way",
        )
    if status in {OrderStatus.DELIVERY_FAILED, "failed", "cancelled"} and delivery:
        return (
            f"Delivery update needed · #{number}",
            f"Hi {name},\n\nThe delivery for order #{number} needs attention. {shop} will contact you with the next step.",
            "Delivery issue",
        )
    if status in {OrderStatus.COMPLETED, "delivered"}:
        if delivery:
            return (
                f"Delivered · #{number}",
                f"Hi {name},\n\nOrder #{number} has been delivered. We hope you love it — thanks for choosing {shop}.",
                "Delivered",
            )
        return (
            f"Picked up · #{number}",
            f"Hi {name},\n\nOrder #{number} has been collected. Thanks for visiting {shop}.",
            "Picked up",
        )
    if status == OrderStatus.CANCELLED:
        return (
            f"Order cancelled · #{number}",
            f"Hi {name},\n\nOrder #{number} has been cancelled. If this was a surprise, reply to {shop} and we'll help.",
            "Cancelled",
        )
    return (
        f"Order update · #{number}",
        f"Hi {name},\n\nThere's an update on order #{number} from {shop}.",
        "Update",
    )


def _copy_for_shipment(
    order: ShopOrder,
    *,
    shipment: ShopShipment,
    status: str,
) -> tuple[str, str, str]:
    name = _customer_name(order)
    number = order.order_number
    carrier = shipment.carrier_label or "Courier"
    awb = shipment.tracking_number or ""
    awb_text = f" AWB {awb}." if awb else ""
    normalized = str(status or "").strip().lower()
    if normalized == "shipped":
        return (
            f"Shipped · #{number}",
            f"Hi {name},\n\nYour order has been shipped via {carrier}.{awb_text} Tap to track your shipment.",
            "Shipped",
        )
    if normalized == "in_transit":
        return (
            f"On the way · #{number}",
            f"Hi {name},\n\nYour package is in transit via {carrier}.{awb_text}",
            "In transit",
        )
    if normalized == "out_for_delivery":
        return (
            f"Arriving today · #{number}",
            f"Hi {name},\n\nYour package is out for delivery via {carrier}.{awb_text}",
            "Out for delivery",
        )
    if normalized == "delivered":
        shop = str(getattr(order.business, "display_name", "") or "the shop")
        return (
            f"Delivered · #{number}",
            f"Hi {name},\n\nOrder #{number} has been delivered. Thanks for shopping with {shop}.",
            "Delivered",
        )
    return (
        f"Shipment update · #{number}",
        f"Hi {name},\n\nThere's a shipment update on order #{number}.{awb_text}",
        "Shipment update",
    )


def notify_online_order(*, order: ShopOrder, status: str | None = None) -> None:
    if not _is_online(order) or not order.customer_id:
        return
    customer = getattr(order, "customer", None)
    if customer is None:
        return
    status_value = str(status or order.status or "").lower()
    subject, body, kicker = _copy_for_status(order, status=status_value)
    try:
        from apps.notifications.services.customer_direct import CustomerDirectNotifier

        CustomerDirectNotifier().notify_customer(
            tenant=order.tenant,
            business=order.business,
            customer=customer,
            subject=subject,
            body=body,
            channels=["in_app", "email"],
            event_type=f"ShopOrder{status_value.title()}",
            metadata={
                "order_id": str(order.id),
                "order_number": order.order_number,
                "status": status_value,
                "fulfillment_mode": order.fulfillment_mode,
            },
            extra_html=_order_extra_html(order, kicker=kicker, status=status_value),
            headline=kicker,
        )
    except Exception:
        logger.exception("Online order notify failed", extra={"order_id": str(order.id), "status": status_value})

    if status_value != OrderStatus.PENDING:
        return

    mode = "Delivery" if str(order.fulfillment_mode).lower() == "delivery" else "Pickup"
    try:
        from apps.notifications.services.staff_direct import StaffDirectNotifier

        StaffDirectNotifier().notify_managers(
            tenant=order.tenant,
            business=order.business,
            subject=f"New online order · #{order.order_number}",
            body=(
                f"{_customer_name(order)} placed order #{order.order_number} "
                f"({_money(order.total, order.currency or 'INR')}, {mode})."
            ),
            event_type="ShopOrderPendingAdmin",
            metadata={
                "order_id": str(order.id),
                "order_number": order.order_number,
                "status": status_value,
                "fulfillment_mode": order.fulfillment_mode,
            },
            channels=["in_app", "email"],
            headline="New online order",
            extra_html=_order_extra_html(order, kicker="New order", status=status_value),
        )
    except Exception:
        logger.exception(
            "Online order staff notify failed",
            extra={"order_id": str(order.id), "status": status_value},
        )


def notify_shipment_milestone(*, order: ShopOrder, shipment: ShopShipment, status: str) -> None:
    if not _is_online(order) or not order.customer_id:
        return
    customer = getattr(order, "customer", None)
    if customer is None:
        return
    status_value = str(status or "").strip().lower()
    subject, body, kicker = _copy_for_shipment(order, shipment=shipment, status=status_value)
    try:
        from apps.notifications.services.customer_direct import CustomerDirectNotifier

        CustomerDirectNotifier().notify_customer(
            tenant=order.tenant,
            business=order.business,
            customer=customer,
            subject=subject,
            body=body,
            channels=["in_app", "email"],
            event_type=f"ShopShipment{status_value.title()}",
            metadata={
                "order_id": str(order.id),
                "order_number": order.order_number,
                "shipment_status": status_value,
                "carrier_label": shipment.carrier_label,
                "tracking_number": shipment.tracking_number,
                "tracking_url": shipment.tracking_url,
                "fulfillment_mode": order.fulfillment_mode,
            },
            extra_html=_order_extra_html(
                order, kicker=kicker, shipment=shipment, status=status_value
            ),
            cta_label="Track shipment" if shipment.tracking_url else "",
            cta_url=shipment.tracking_url or "",
            headline=kicker,
        )
    except Exception:
        logger.exception(
            "Shipment notify failed",
            extra={"order_id": str(order.id), "shipment_status": status_value},
        )


def notify_online_return(*, shop_return: ShopReturn, completed: bool) -> None:
    order = getattr(shop_return, "order", None)
    if order is None or not _is_online(order) or not shop_return.customer_id:
        return
    customer = getattr(shop_return, "customer", None) or getattr(order, "customer", None)
    if customer is None:
        return
    shop = str(getattr(order.business, "display_name", "") or "the shop")
    name = str(getattr(customer, "display_name", "") or "there")
    refund = _money(shop_return.refund_total, shop_return.currency or order.currency or "INR")
    if completed:
        subject = f"Return complete · {shop_return.return_number}"
        body = (
            f"Hi {name},\n\nYour return {shop_return.return_number} for order #{order.order_number} "
            f"is complete. Refund value {refund} has been applied, and sellable items are back in stock."
        )
        event = "ShopReturnCompleted"
        kicker = "Return complete"
    else:
        subject = f"Return requested · {shop_return.return_number}"
        body = (
            f"Hi {name},\n\nWe've received your return request {shop_return.return_number} "
            f"for order #{order.order_number} ({refund}). {shop} will process it shortly."
        )
        event = "ShopReturnRequested"
        kicker = "Return requested"
    item_rows = [
        {"name": raw.get("name"), "qty": raw.get("quantity"), "amount": ""}
        for raw in (shop_return.line_items or [])
        if isinstance(raw, dict)
    ]
    refund_title = "Refund issued" if completed else "Refund requested"
    extra = (
        email_info_card(
            title=kicker,
            lines=[
                f"Order #{order.order_number}",
                f"Return {shop_return.return_number}",
            ],
        )
        + email_item_rows(item_rows)
        + email_info_card(
            title=refund_title,
            lines=[
                f"{refund}" + (" refunded" if completed else " pending review"),
                "Usually shows in 1–3 business days" if completed else "We’ll update you when it’s processed.",
            ],
        )
    )
    try:
        from apps.notifications.services.customer_direct import CustomerDirectNotifier

        CustomerDirectNotifier().notify_customer(
            tenant=shop_return.tenant,
            business=shop_return.business,
            customer=customer,
            subject=subject,
            body=body,
            channels=["in_app", "email"],
            event_type=event,
            metadata={
                "order_id": str(order.id),
                "return_id": str(shop_return.id),
                "return_number": shop_return.return_number,
            },
            extra_html=extra,
            headline=kicker,
        )
    except Exception:
        logger.exception("Online return notify failed", extra={"return_id": str(shop_return.id)})
