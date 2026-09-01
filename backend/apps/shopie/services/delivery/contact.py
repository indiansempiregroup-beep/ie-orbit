from __future__ import annotations

from typing import Any

from apps.customers.services.contact import format_contact_phone, resolve_customer_phone


def merge_location_contact(
    location: dict[str, Any] | None,
    *,
    name: str = "",
    phone: str = "",
) -> dict[str, Any]:
    merged = dict(location or {})
    contact = dict(merged.get("contact") or {}) if isinstance(merged.get("contact"), dict) else {}
    if name:
        contact["name"] = name
    normalized_phone = format_contact_phone(phone or contact.get("phone"))
    if normalized_phone:
        contact["phone"] = normalized_phone
    if contact:
        merged["contact"] = contact
    return merged


def resolve_order_delivery_contact(
    *,
    order: Any,
    delivery: dict[str, Any] | None = None,
) -> tuple[str, str]:
    delivery_meta = dict(delivery or {})
    drop = delivery_meta.get("drop") if isinstance(delivery_meta.get("drop"), dict) else {}
    drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}

    name = ""
    phone = ""
    customer = getattr(order, "customer", None)
    if customer is not None:
        name = str(getattr(customer, "display_name", "") or "").strip()
        phone = resolve_customer_phone(customer)

    if not phone:
        phone = format_contact_phone(drop_contact.get("phone"))
    if not name:
        name = str(drop_contact.get("name") or "").strip()
    if not name and customer is not None:
        name = str(getattr(customer, "display_name", "") or "Customer")
    return name or "Customer", phone


def porter_customer_payload(*, name: str, phone: str) -> dict[str, Any]:
    digits = format_contact_phone(phone)
    return {
        "name": name or "Customer",
        "mobile": {"country_code": "+91", "number": digits or ""},
    }


def porter_location_payload(location: dict[str, Any]) -> dict[str, Any]:
    contact = location.get("contact") if isinstance(location.get("contact"), dict) else {}
    name = str(contact.get("name") or "Contact")
    phone = format_contact_phone(contact.get("phone"), e164=True)
    return {
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
        "address": {
            "street_address1": str(location.get("address") or "Address"),
            "city": str(location.get("city") or ""),
            "state": str(location.get("state") or ""),
            "pincode": str(location.get("postal_code") or ""),
            "country": "India",
            "lat": location.get("latitude"),
            "lng": location.get("longitude"),
            "contact_details": {
                "name": name,
                "phone_number": phone,
            },
        },
    }


def porter_quote_payload(payload: dict[str, Any]) -> dict[str, Any]:
    pickup = payload.get("pickup") or {}
    drop = payload.get("drop") or {}
    customer = payload.get("customer") or {}
    drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
    name = str(customer.get("name") or drop_contact.get("name") or "Customer")
    phone = format_contact_phone(customer.get("phone") or drop_contact.get("phone"))
    return {
        "pickup_details": {"lat": pickup.get("latitude"), "lng": pickup.get("longitude")},
        "drop_details": {"lat": drop.get("latitude"), "lng": drop.get("longitude")},
        "customer": porter_customer_payload(name=name, phone=phone),
    }


def porter_book_payload(payload: dict[str, Any]) -> dict[str, Any]:
    pickup = payload.get("pickup") or {}
    drop = payload.get("drop") or {}
    customer = payload.get("customer") or {}
    drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
    name = str(customer.get("name") or drop_contact.get("name") or "Customer")
    phone = format_contact_phone(customer.get("phone") or drop_contact.get("phone"))
    merged_drop = merge_location_contact(drop, name=name, phone=phone)
    merged_pickup = merge_location_contact(pickup)
    return {
        "request_id": payload.get("request_id"),
        "quote_id": payload.get("quote_id"),
        "pickup_details": porter_location_payload(merged_pickup),
        "drop_details": porter_location_payload(merged_drop),
        "customer": porter_customer_payload(name=name, phone=phone),
    }
