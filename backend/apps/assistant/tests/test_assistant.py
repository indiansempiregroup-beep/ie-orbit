from __future__ import annotations

from types import SimpleNamespace

import pytest
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.assistant.services.access import (
    AssistantAccess,
    consume_message_quota,
    ensure_assistant_access,
    ensure_message_quota,
    resolve_assistant_access,
)
from apps.assistant.services.brains.rules import RulesBrain
from apps.assistant.services import tools as toolset


def test_resolve_assistant_access_respects_features(monkeypatch):
    business = SimpleNamespace(tenant=SimpleNamespace())

    monkeypatch.setattr(
        "apps.assistant.services.access.tenant_feature_enabled",
        lambda **kwargs: True,
    )

    def fake_has_feature(self, *, business, feature, product_code=None):
        return feature == "shopie_ai_assistant"

    monkeypatch.setattr(
        "apps.businesses.services.entitlements.EntitlementService.has_feature",
        fake_has_feature,
    )
    access = resolve_assistant_access(business=business)
    assert access.mart_enabled is True
    assert access.appoint_enabled is False
    assert access.any_enabled is True


def test_ensure_assistant_access_denied_when_disabled(monkeypatch):
    business = SimpleNamespace(tenant=SimpleNamespace())
    monkeypatch.setattr(
        "apps.assistant.services.access.tenant_feature_enabled",
        lambda **kwargs: True,
    )
    monkeypatch.setattr(
        "apps.businesses.services.entitlements.EntitlementService.has_feature",
        lambda self, **kwargs: False,
    )
    with pytest.raises(PermissionDenied):
        ensure_assistant_access(business=business)


def test_message_quota_blocks_when_exhausted():
    with pytest.raises(ValidationError):
        ensure_message_quota(business=SimpleNamespace(), used=50)


def test_consume_message_quota_blocks_without_wallet(monkeypatch):
    tenant = SimpleNamespace()
    business = SimpleNamespace()

    class FakeWallet:
        def platform_overage_enabled(self):
            return True

        def message_price_paise(self):
            return 50

        def ensure_wallet(self, *, tenant, business):
            return SimpleNamespace(balance_paise=0)

        def debit_wallet(self, **kwargs):
            raise AssertionError("should not debit")

    monkeypatch.setattr(
        "apps.assistant.services.access.AssistantWalletService",
        FakeWallet,
    )
    with pytest.raises(ValidationError) as exc:
        consume_message_quota(tenant=tenant, business=business, used=50)
    assert exc.value.detail["code"] == "assistant_no_balance"


def test_consume_message_quota_debits_wallet(monkeypatch):
    tenant = SimpleNamespace()
    business = SimpleNamespace()
    debits = []

    class FakeWallet:
        def platform_overage_enabled(self):
            return True

        def message_price_paise(self):
            return 50

        def ensure_wallet(self, *, tenant, business):
            return SimpleNamespace(balance_paise=200)

        def debit_wallet(self, **kwargs):
            debits.append(kwargs)
            return SimpleNamespace(balance_paise=150)

    monkeypatch.setattr(
        "apps.assistant.services.access.AssistantWalletService",
        FakeWallet,
    )
    path = consume_message_quota(tenant=tenant, business=business, used=50)
    assert path == "wallet"
    assert len(debits) == 1
    assert debits[0]["amount_paise"] == 50
    assert debits[0]["source"] == "message"


def test_consume_message_quota_free_path(monkeypatch):
    path = consume_message_quota(
        tenant=SimpleNamespace(),
        business=SimpleNamespace(),
        used=10,
    )
    assert path == "free"


def test_wallet_credit_idempotency_flag():
    """Checkout credit helper skips when wallet_credited is already set."""
    from apps.billing.services.checkout import CheckoutService

    session = SimpleNamespace(
        metadata={"wallet_credited": True, "kind": "assistant_top_up"},
        amount_paise=5000,
        tenant=SimpleNamespace(),
        business=SimpleNamespace(),
        razorpay_order_id="upi_as_test",
    )
    calls = []

    class FakeWalletService:
        def credit_wallet(self, **kwargs):
            calls.append(kwargs)

    import apps.assistant.services.wallet as wallet_mod

    original = wallet_mod.AssistantWalletService
    wallet_mod.AssistantWalletService = FakeWalletService
    try:
        CheckoutService()._credit_assistant_wallet(session)
    finally:
        wallet_mod.AssistantWalletService = original
    assert calls == []


def test_rules_brain_help_and_unknown(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    context = {
        "tenant": SimpleNamespace(),
        "business": SimpleNamespace(),
        "access": access,
        "user": None,
    }
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: ["Orders today"])
    monkeypatch.setattr(
        toolset,
        "help_text",
        lambda **kwargs: "I can help with orders.\nChanges always need your Confirm.",
    )

    help_result = brain.handle(text="What can you do?", context=context)
    assert "Confirm" in help_result.reply

    unknown = brain.handle(text="invent a marketing strategy", context=context)
    assert "not able to help" in unknown.reply.lower() or "what can you do" in unknown.reply.lower()


def test_rules_brain_tool_validation_becomes_reply(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def boom(*, tenant, business, offset=0):
        raise ValidationError({"id": ['“s” is not a valid UUID.']})

    monkeypatch.setattr(toolset, "list_online_orders", boom)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: ["Online orders"])
    result = brain.handle(
        text="Online Orders",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "couldn’t find" in result.reply.lower() or "could not find" in result.reply.lower() or "what can you do" in result.reply.lower()
    assert "valid uuid" not in result.reply.lower()
    assert "one or more request fields" not in result.reply.lower()


def test_rules_brain_unexpected_error_becomes_reply(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def boom(*, tenant, business, offset=0):
        raise RuntimeError("db blew up")

    monkeypatch.setattr(toolset, "list_open_orders", boom)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: ["Open orders"])
    result = brain.handle(
        text="Open orders",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "couldn’t complete" in result.reply.lower() or "could not complete" in result.reply.lower()


def test_rules_brain_orders_today_calls_tool(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    called = {"ok": False}

    def fake_count(*, tenant, business):
        called["ok"] = True
        return "You have 2 orders today."

    monkeypatch.setattr(toolset, "count_orders_today", fake_count)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: ["Orders today"])
    result = brain.handle(
        text="Orders today",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert called["ok"] is True
    assert "2 orders" in result.reply


def test_rules_brain_blocks_appoint_when_only_mart(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="bookings today",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "Orbit Appoint" in result.reply


def test_rules_brain_propose_order_status(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def fake_propose(*, tenant, business, number, status_raw):
        return {
            "action_type": "order.update_status",
            "summary": f"Mark order {number} as delivered.",
            "payload": {"order_number": number, "to_status": "completed"},
        }

    monkeypatch.setattr(toolset, "propose_order_status", fake_propose)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="mark order 1042 as delivered",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert result.proposal is not None
    assert result.proposal["action_type"] == "order.update_status"
    assert "Confirm" in result.reply


def test_rules_brain_sales_today(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    monkeypatch.setattr(toolset, "sales_today", lambda **kwargs: "Sales today: 3 orders · ₹1200.00 total · 2 completed.")
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="sales today",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "₹1200" in result.reply


def test_rules_brain_pending_returns(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    monkeypatch.setattr(toolset, "pending_returns", lambda **kwargs: "No pending returns.")
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="pending returns",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "pending returns" in result.reply.lower()


def test_rules_brain_upcoming_bookings(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=False, appoint_enabled=True)
    monkeypatch.setattr(toolset, "upcoming_bookings", lambda **kwargs: "Upcoming bookings:\n• B-1")
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="upcoming bookings",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "B-1" in result.reply


def test_rules_brain_add_stock_proposal(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def fake_add(*, tenant, business, query, quantity):
        return {
            "action_type": "product.add_stock",
            "summary": f"Add {quantity} to {query}.",
            "payload": {"delta": str(quantity)},
        }

    monkeypatch.setattr(toolset, "propose_stock_add", fake_add)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="add 10 stock to green tea",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert result.proposal is not None
    assert result.proposal["action_type"] == "product.add_stock"


def test_rules_brain_cash_balance(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    monkeypatch.setattr(toolset, "books_cash_summary", lambda **kwargs: "Cash: ₹100.00")
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="cash balance",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "₹100" in result.reply


def test_rules_brain_confirm_payment_proposal(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def fake_pay(*, tenant, business, number, action):
        return {
            "action_type": "order.payment_action",
            "summary": f"Confirm payment for order {number}.",
            "payload": {"action": action, "order_number": number},
        }

    monkeypatch.setattr(toolset, "propose_order_payment", fake_pay)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="confirm payment for order 55",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert result.proposal is not None
    assert result.proposal["action_type"] == "order.payment_action"


def test_rules_brain_staff_workload(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=False, appoint_enabled=True)
    monkeypatch.setattr(toolset, "staff_workload_today", lambda **kwargs: "Staff workload today:\n• Riya — 3")
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="staff workload today",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "Riya" in result.reply


def test_rules_brain_today_overview(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=True)
    monkeypatch.setattr(
        toolset,
        "today_overview",
        lambda **kwargs: "Today overview:\nSales today: 1 order",
    )
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="today overview",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "Today overview" in result.reply


def test_rules_brain_change_order_status_asks_for_order(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def fake_prompt(*, tenant, business):
        return {
            "text": "2 open orders:\n\nWhich order should I update?",
            "links": [{"kind": "order", "id": "1", "label": "SO-100", "subtitle": "confirmed"}],
            "suggestions": ["SO-100"],
        }

    monkeypatch.setattr(toolset, "prompt_change_order_status", fake_prompt)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="I want to change order status",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "Which order" in result.reply
    assert result.metadata.get("flow", {}).get("step") == "pick_order"
    assert result.suggestions == ["SO-100"]


def test_rules_brain_order_status_flow_pick_status(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    order = SimpleNamespace(
        id="oid-1",
        order_number="SO-100",
        status="confirmed",
        total="10.00",
        customer=SimpleNamespace(display_name="Sanket", first_name="", last_name="", phone_number=""),
    )

    monkeypatch.setattr(toolset, "find_order", lambda **kwargs: order)
    monkeypatch.setattr(
        toolset,
        "prompt_order_status_choice",
        lambda **kwargs: {
            "text": f"Order {order.order_number} — what status?",
            "links": [],
            "suggestions": ["delivered", "cancelled"],
        },
    )
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="SO-100",
        context={
            "tenant": SimpleNamespace(),
            "business": SimpleNamespace(),
            "access": access,
            "flow": {"type": "order_status", "step": "pick_order"},
        },
    )
    assert "what status" in result.reply.lower() or "status" in result.reply.lower()
    assert result.metadata.get("flow", {}).get("step") == "pick_status"

    def fake_propose(*, tenant, business, number, status_raw):
        return {
            "action_type": "order.update_status",
            "summary": f"Mark order {number} as {status_raw}.",
            "payload": {"order_number": number, "order_id": "oid-1", "to_status": "completed"},
        }

    monkeypatch.setattr(toolset, "propose_order_status", fake_propose)
    proposed = brain.handle(
        text="delivered",
        context={
            "tenant": SimpleNamespace(),
            "business": SimpleNamespace(),
            "access": access,
            "flow": {
                "type": "order_status",
                "step": "pick_status",
                "order_number": "SO-100",
                "order_id": "oid-1",
            },
        },
    )
    assert proposed.proposal is not None
    assert proposed.proposal["action_type"] == "order.update_status"


def test_rules_brain_preview_order(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)

    def fake_preview(*, tenant, business, kind, record_id):
        return {
            "text": f"Order details for {record_id}",
            "links": [
                {
                    "kind": "order",
                    "id": record_id,
                    "label": "Open order",
                    "action": "open",
                }
            ],
        }

    monkeypatch.setattr(toolset, "preview_record", fake_preview)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="preview order abc-123",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert "Order details" in result.reply
    assert result.metadata["links"][0]["action"] == "open"


def test_rules_brain_show_more_list_page(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    called = {"offset": None}

    def fake_continue(*, tenant, business, flow):
        called["offset"] = flow.get("offset")
        return {
            "text": "More orders — showing 6–10:",
            "links": [],
            "page": {
                "list": "open_orders",
                "offset": 5,
                "next_offset": 10,
                "limit": 5,
                "has_more": True,
                "more_label": "Show more open orders",
            },
            "suggestions": ["Show more open orders"],
        }

    monkeypatch.setattr(toolset, "continue_paged_list", fake_continue)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="Show more",
        context={
            "tenant": SimpleNamespace(),
            "business": SimpleNamespace(),
            "access": access,
            "flow": {"type": "list_page", "list": "open_orders", "offset": 5},
        },
    )
    assert called["offset"] == 5
    assert "More orders" in result.reply
    assert result.metadata.get("flow", {}).get("type") == "list_page"


def test_rules_brain_online_orders_not_order_lookup(monkeypatch):
    brain = RulesBrain()
    access = AssistantAccess(mart_enabled=True, appoint_enabled=False)
    called = {"online": False, "lookup": False}

    def fake_online(*, tenant, business, offset=0):
        called["online"] = True
        return {
            "text": "1 open online order (pickup/delivery) — showing 1–1:",
            "links": [
                {
                    "kind": "order",
                    "id": "oid-1",
                    "label": "SO-100",
                    "badge": "Pickup",
                    "action": "preview",
                }
            ],
        }

    def fake_lookup(*, tenant, business, number):
        called["lookup"] = True
        return f"looked up {number}"

    monkeypatch.setattr(toolset, "list_online_orders", fake_online)
    monkeypatch.setattr(toolset, "get_order_by_number", fake_lookup)
    monkeypatch.setattr(toolset, "suggestion_chips", lambda **kwargs: [])
    result = brain.handle(
        text="Online Orders",
        context={"tenant": SimpleNamespace(), "business": SimpleNamespace(), "access": access},
    )
    assert called["online"] is True
    assert called["lookup"] is False
    assert "online order" in result.reply.lower()
    assert result.metadata["links"][0]["badge"] == "Pickup"
