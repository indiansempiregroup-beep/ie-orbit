from __future__ import annotations

import logging
from decimal import Decimal

from apps.shopie.models import FulfillmentMode, OrderStatus, ShopOrder, ShopReturn, ShopShipment

logger = logging.getLogger("ie_orbit.shopie.notify")

ONLINE_FULFILLMENT = {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}
DELIVERY_METHOD_STANDARD = "standard"
DELIVERY_METHOD_INSTANT = "instant"


def _escape(value: object) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


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


def _item_rows_html(order: ShopOrder) -> str:
    rows = []
    for line in list(order.lines.all())[:6]:
        rows.append(
            "<tr>"
            f"<td style='padding:8px 0;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;'>{_escape(line.product_name)}</td>"
            f"<td style='padding:8px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;text-align:right;'>× {_escape(line.quantity)}</td>"
            f"<td style='padding:8px 0 8px 12px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:700;text-align:right;'>{_escape(_money(line.line_total, order.currency or 'INR'))}</td>"
            "</tr>"
        )
    extra = max(0, order.lines.count() - 6)
    if extra:
        rows.append(
            f"<tr><td colspan='3' style='padding:8px 0;color:#64748b;font-size:13px;'>+{extra} more item{'s' if extra != 1 else ''}</td></tr>"
        )
    return "".join(rows)


def _order_extra_html(order: ShopOrder, *, kicker: str, shipment: ShopShipment | None = None) -> str:
    mode = "Delivery" if str(order.fulfillment_mode).lower() == "delivery" else "Pickup"
    address = str(order.delivery_address or "").strip()
    address_html = (
        f"<p style='margin:10px 0 0;font-size:13px;color:#64748b;'><strong style='color:#0f172a;'>{mode}</strong>"
        f"{' · ' + _escape(address) if address else ''}</p>"
        if mode == "Delivery" or address
        else f"<p style='margin:10px 0 0;font-size:13px;color:#64748b;'><strong style='color:#0f172a;'>{mode}</strong></p>"
    )
    shipment_html = ""
    if shipment is not None:
        track = str(shipment.tracking_url or "").strip()
        track_link = (
            f" · <a href='{_escape(track)}'>Track shipment</a>" if track else ""
        )
        shipment_html = (
            "<p style='margin:12px 0 0;font-size:14px;color:#0f172a;'>"
            f"<strong>{_escape(shipment.carrier_label or 'Courier')}</strong>"
            f" · AWB {_escape(shipment.tracking_number)}"
            f"{track_link}"
            "</p>"
        )
    return (
        "<div style='margin-top:18px;padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;'>"
        f"<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;'>{_escape(kicker)}</div>"
        f"<div style='margin-top:4px;font-size:16px;font-weight:800;color:#0f172a;'>#{_escape(order.order_number)}</div>"
        "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='margin-top:10px;'>"
        f"{_item_rows_html(order)}"
        "<tr>"
        "<td colspan='2' style='padding-top:12px;font-size:14px;color:#64748b;'>Order total</td>"
        f"<td style='padding-top:12px;font-size:16px;font-weight:800;text-align:right;color:#0f172a;'>{_escape(_money(order.total, order.currency or 'INR'))}</td>"
        "</tr></table>"
        f"{address_html}"
        f"{shipment_html}"
        "</div>"
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
            extra_html=_order_extra_html(order, kicker=kicker),
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
            extra_html=_order_extra_html(order, kicker=kicker, shipment=shipment),
            cta_label="Track shipment" if shipment.tracking_url else "",
            cta_url=shipment.tracking_url or "",
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
    items = "".join(
        f"<tr><td style='padding:8px 0;border-bottom:1px solid #eef2f7;font-size:14px;'>{_escape(raw.get('name'))}</td>"
        f"<td style='padding:8px 0;border-bottom:1px solid #eef2f7;font-size:13px;color:#64748b;text-align:right;'>× {_escape(raw.get('quantity'))}</td></tr>"
        for raw in (shop_return.line_items or [])
        if isinstance(raw, dict)
    )
    extra = (
        "<div style='margin-top:18px;padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;'>"
        f"<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;'>{kicker}</div>"
        f"<div style='margin-top:4px;font-size:16px;font-weight:800;'>#{_escape(order.order_number)} · {_escape(shop_return.return_number)}</div>"
        f"<table role='presentation' width='100%' style='margin-top:10px;'>{items}</table>"
        f"<p style='margin:12px 0 0;font-size:15px;font-weight:800;'>Refund {_escape(refund)}</p>"
        "</div>"
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
        )
    except Exception:
        logger.exception("Online return notify failed", extra={"return_id": str(shop_return.id)})
