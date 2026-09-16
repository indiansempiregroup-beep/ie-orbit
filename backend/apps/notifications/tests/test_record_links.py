from __future__ import annotations

from apps.notifications.services.record_links import record_cta, staff_record_path


def test_customer_cta_uses_open_trampoline(settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    settings.OPS_WEB_BASE_URL = "https://ops.ie-orbit.com"
    booking_id = "11111111-1111-1111-1111-111111111111"
    cta = record_cta(audience="customer", kind="booking", record_id=booking_id)
    assert cta["cta_label"] == "View appointment"
    assert cta["cta_url"] == f"https://ie-orbit.com/open/booking/{booking_id}"


def test_staff_cta_uses_ops_web(settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    settings.OPS_WEB_BASE_URL = "https://ops.ie-orbit.com"
    order_id = "22222222-2222-2222-2222-222222222222"
    cta = record_cta(audience="admin", kind="order", record_id=order_id)
    assert cta["cta_label"] == "View order"
    assert cta["cta_url"] == f"https://ops.ie-orbit.com/shop/orders/{order_id}"


def test_staff_pet_and_ticket_query_paths(settings) -> None:
    settings.OPS_WEB_BASE_URL = "https://ops.ie-orbit.com"
    pet_id = "33333333-3333-3333-3333-333333333333"
    ticket_id = "44444444-4444-4444-4444-444444444444"
    pet = record_cta(audience="admin", kind="pet", record_id=pet_id)
    ticket = record_cta(audience="admin", kind="ticket", record_id=ticket_id)
    platform = record_cta(
        audience="admin",
        kind="ticket",
        record_id=ticket_id,
        extra={"platform": True},
    )
    assert pet["cta_url"] == f"https://ops.ie-orbit.com/shop/pets?petId={pet_id}"
    assert ticket["cta_url"] == f"https://ops.ie-orbit.com/settings/support?ticket={ticket_id}"
    assert "?ticket=" in platform["cta_url"]
    assert "/admin/tickets" in platform["cta_url"]


def test_customer_return_includes_order_query(settings) -> None:
    settings.FRONTEND_BASE_URL = "https://ie-orbit.com"
    return_id = "55555555-5555-5555-5555-555555555555"
    order_id = "66666666-6666-6666-6666-666666666666"
    cta = record_cta(
        audience="customer",
        kind="return",
        record_id=return_id,
        extra={"order_id": order_id, "app_slug": "sunita-spa"},
    )
    assert "/open/return/" in cta["cta_url"]
    assert "order=" in cta["cta_url"]
    assert "app=sunita-spa" in cta["cta_url"]
    assert staff_record_path("return", return_id, {"order_id": order_id}) == f"/shop/orders/{order_id}"


def test_blank_record_id_skips_cta() -> None:
    assert record_cta(audience="customer", kind="order", record_id="") == {
        "cta_label": "",
        "cta_url": "",
    }
