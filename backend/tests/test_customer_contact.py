from __future__ import annotations

from apps.customers.services.contact import format_contact_phone, resolve_customer_phone
from apps.shopie.services.delivery.contact import porter_book_payload


def test_format_contact_phone_normalizes_india_numbers() -> None:
    assert format_contact_phone("+91 98765 43210") == "9876543210"
    assert format_contact_phone("919876543210") == "9876543210"
    assert format_contact_phone("+919876543210", e164=True) == "+919876543210"


def test_resolve_customer_phone_prefers_primary_number() -> None:
    class Customer:
        phone_number = "+91 90000 11111"
        alternate_phone = "9000011112"
        email = ""

    assert resolve_customer_phone(Customer()) == "9000011111"


def test_porter_book_payload_includes_customer_mobile() -> None:
    payload = porter_book_payload(
        {
            "request_id": "order-1",
            "quote_id": "quote-1",
            "pickup": {
                "latitude": 19.07,
                "longitude": 72.87,
                "address": "Shop",
                "contact": {"name": "Shop", "phone": "9000011111"},
            },
            "drop": {
                "latitude": 19.08,
                "longitude": 72.88,
                "address": "Home",
                "city": "Mumbai",
                "state": "MH",
                "postal_code": "400001",
                "contact": {"name": "Rupali", "phone": "9876543210"},
            },
            "customer": {"name": "Rupali", "phone": "9876543210"},
        }
    )

    assert payload["customer"]["mobile"]["number"] == "9876543210"
    assert payload["drop_details"]["address"]["contact_details"]["phone_number"] == "+919876543210"
