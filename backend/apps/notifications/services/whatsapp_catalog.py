from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WhatsAppCatalogEntry:
    code: str
    title: str
    group: str
    meta_name: str
    language: str
    body: str
    body_params: tuple[str, ...]
    sample_values: tuple[str, ...]
    event_type: str
    audience: str
    notification_template_code: str


WHATSAPP_CATALOG: tuple[WhatsAppCatalogEntry, ...] = (
    WhatsAppCatalogEntry(
        code="auth_otp",
        title="Sign-in code",
        group="auth",
        meta_name="ie_orbit_auth_otp",
        language="en",
        body="Your IE Orbit sign-in code is {{1}}. It expires in {{2}} minutes.",
        body_params=("code", "expiry_minutes"),
        sample_values=("123456", "10"),
        event_type="AuthOtp",
        audience="customer",
        notification_template_code="auth_otp",
    ),
    WhatsAppCatalogEntry(
        code="booking_created",
        title="Booking received",
        group="bookings",
        meta_name="ieo_booking_created",
        language="en",
        body="Hi {{1}}, we received your booking {{2}} for {{3}} at {{4}} on {{5}}.",
        body_params=("customer_name", "booking_number", "service_name", "business_name", "start_at"),
        sample_values=("Priya", "BK-1001", "Haircut", "Orbit Salon", "10 Apr, 10:00 AM"),
        event_type="BookingCreated",
        audience="customer",
        notification_template_code="booking_created",
    ),
    WhatsAppCatalogEntry(
        code="booking_confirmed",
        title="Booking confirmed",
        group="bookings",
        meta_name="ieo_booking_confirmed",
        language="en",
        body="Hi {{1}}, your booking {{2}} for {{3}} at {{4}} is confirmed for {{5}}.",
        body_params=("customer_name", "booking_number", "service_name", "business_name", "start_at"),
        sample_values=("Priya", "BK-1001", "Haircut", "Orbit Salon", "10 Apr, 10:00 AM"),
        event_type="BookingConfirmed",
        audience="customer",
        notification_template_code="booking_confirmed",
    ),
    WhatsAppCatalogEntry(
        code="booking_cancelled",
        title="Booking cancelled",
        group="bookings",
        meta_name="ieo_booking_cancelled",
        language="en",
        body="Hi {{1}}, your booking {{2}} for {{3}} at {{4}} on {{5}} has been cancelled.",
        body_params=("customer_name", "booking_number", "service_name", "business_name", "start_at"),
        sample_values=("Priya", "BK-1001", "Haircut", "Orbit Salon", "10 Apr, 10:00 AM"),
        event_type="BookingCancelled",
        audience="customer",
        notification_template_code="booking_cancelled",
    ),
    WhatsAppCatalogEntry(
        code="booking_reminder",
        title="Booking reminder",
        group="bookings",
        meta_name="ieo_booking_reminder",
        language="en",
        body="Hi {{1}}, reminder: {{2}} at {{3}} starts at {{4}} (booking {{5}}).",
        body_params=("customer_name", "service_name", "business_name", "start_at", "booking_number"),
        sample_values=("Priya", "Haircut", "Orbit Salon", "10 Apr, 10:00 AM", "BK-1001"),
        event_type="BookingReminder",
        audience="customer",
        notification_template_code="booking_reminder",
    ),
    WhatsAppCatalogEntry(
        code="order_confirmed",
        title="Order confirmed",
        group="orders",
        meta_name="ieo_order_confirmed",
        language="en",
        body="Hi {{1}}, {{2}} confirmed order {{3}}.",
        body_params=("customer_name", "business_name", "order_number"),
        sample_values=("Priya", "Orbit Mart", "#1042"),
        event_type="ShopOrderConfirmed",
        audience="customer",
        notification_template_code="order_confirmed",
    ),
    WhatsAppCatalogEntry(
        code="order_ready",
        title="Order ready",
        group="orders",
        meta_name="ieo_order_ready",
        language="en",
        body="Hi {{1}}, order {{2}} from {{3}} is ready.",
        body_params=("customer_name", "order_number", "business_name"),
        sample_values=("Priya", "#1042", "Orbit Mart"),
        event_type="ShopOrderReady",
        audience="customer",
        notification_template_code="order_ready",
    ),
    WhatsAppCatalogEntry(
        code="order_out_for_delivery",
        title="Out for delivery",
        group="orders",
        meta_name="ieo_order_out_for_delivery",
        language="en",
        body="Hi {{1}}, order {{2}} from {{3}} is out for delivery.",
        body_params=("customer_name", "order_number", "business_name"),
        sample_values=("Priya", "#1042", "Orbit Mart"),
        event_type="ShopOrderOut_For_Delivery",
        audience="customer",
        notification_template_code="order_out_for_delivery",
    ),
    WhatsAppCatalogEntry(
        code="order_completed",
        title="Order completed",
        group="orders",
        meta_name="ieo_order_completed",
        language="en",
        body="Hi {{1}}, order {{2}} from {{3}} is complete. Thank you.",
        body_params=("customer_name", "order_number", "business_name"),
        sample_values=("Priya", "#1042", "Orbit Mart"),
        event_type="ShopOrderCompleted",
        audience="customer",
        notification_template_code="order_completed",
    ),
    WhatsAppCatalogEntry(
        code="order_cancelled",
        title="Order cancelled",
        group="orders",
        meta_name="ieo_order_cancelled",
        language="en",
        body="Hi {{1}}, order {{2}} from {{3}} has been cancelled.",
        body_params=("customer_name", "order_number", "business_name"),
        sample_values=("Priya", "#1042", "Orbit Mart"),
        event_type="ShopOrderCancelled",
        audience="customer",
        notification_template_code="order_cancelled",
    ),
)

UNMAPPED_EVENTS: tuple[dict[str, str], ...] = (
    {"event_type": "BookingRescheduled", "audience": "customer", "note": "Email / in-app only"},
    {"event_type": "BookingCompleted", "audience": "customer", "note": "Email / in-app only"},
    {"event_type": "BookingReviewed", "audience": "admin", "note": "Email / in-app only"},
    {"event_type": "ShopOrderPending", "audience": "customer", "note": "Email / in-app only"},
    {"event_type": "ShopOrderPendingAdmin", "audience": "admin", "note": "Email / in-app only"},
)

_EVENT_ALIASES = {
    "ShopOrderOutForDelivery": "ShopOrderOut_For_Delivery",
    "ShopOrderOut_for_delivery": "ShopOrderOut_For_Delivery",
}


def catalog_by_code() -> dict[str, WhatsAppCatalogEntry]:
    return {entry.code: entry for entry in WHATSAPP_CATALOG}


def mapping_for_event(*, event_type: str, audience: str = "customer") -> WhatsAppCatalogEntry | None:
    normalized = _EVENT_ALIASES.get(str(event_type or ""), str(event_type or ""))
    for entry in WHATSAPP_CATALOG:
        if entry.event_type == normalized and entry.audience == audience:
            return entry
    return None


def phase1_event_types() -> tuple[str, ...]:
    return tuple(entry.event_type for entry in WHATSAPP_CATALOG)


def param_values(entry: WhatsAppCatalogEntry, context: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in entry.body_params:
        raw = context.get(key)
        if raw is None:
            raw = context.get(f"{{{{{key}}}}}")
        text = str(raw or "").strip() or "-"
        values.append(text[:1024])
    return values
