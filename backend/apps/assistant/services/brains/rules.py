from __future__ import annotations

import logging
import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assistant.services.access import AssistantAccess
from apps.assistant.services.brains.base import AssistantBrain, BrainResult
from apps.assistant.services.friendly_errors import (
    GENERIC_FAIL_REPLY,
    UNKNOWN_REPLY,
    validation_message,
)
from apps.assistant.services.links import entity_link, unpack_reply
from apps.assistant.services import tools as toolset
from apps.businesses.models import Business
from apps.shopie.models import OrderStatus
from apps.tenancy.models import Tenant

logger = logging.getLogger(__name__)

def _ok(
    result: str | dict,
    suggestions: list[str],
    *,
    proposal: dict | None = None,
    flow: dict | None = None,
) -> BrainResult:
    text, links, extra_suggestions, page, packed_flow = unpack_reply(result)
    chips = list(extra_suggestions) if extra_suggestions is not None else suggestions
    metadata: dict[str, Any] = {}
    if links:
        metadata["links"] = links
    next_flow = flow or packed_flow
    if page and page.get("has_more"):
        page_flow = {
            "type": "list_page",
            "list": page.get("list"),
            "offset": page.get("next_offset", 0),
            "limit": page.get("limit"),
            **{
                k: v
                for k, v in page.items()
                if k
                not in {
                    "offset",
                    "limit",
                    "next_offset",
                    "has_more",
                    "shown",
                    "more_label",
                    "list",
                }
            },
        }
        if next_flow and next_flow.get("type") == "order_status" and next_flow.get("step") == "pick_order":
            next_flow = {**next_flow, **page_flow, "type": "order_status", "step": "pick_order"}
        elif next_flow is None:
            next_flow = page_flow
    if next_flow:
        metadata["flow"] = next_flow
    return BrainResult(reply=text, suggestions=chips, proposal=proposal, metadata=metadata)


def _links_from_proposal(proposal: dict) -> list[dict]:
    payload = proposal.get("payload") or {}
    links: list[dict] = []
    if payload.get("order_id"):
        links.append(
            entity_link(
                kind="order",
                id=str(payload["order_id"]),
                label=str(payload.get("order_number") or "Order"),
                subtitle="Open order",
                action="open",
            )
        )
    if payload.get("booking_id"):
        links.append(
            entity_link(
                kind="booking",
                id=str(payload["booking_id"]),
                label=str(payload.get("booking_number") or "Booking"),
                subtitle="Open booking",
                action="open",
            )
        )
    if payload.get("product_id"):
        links.append(
            entity_link(
                kind="product",
                id=str(payload["product_id"]),
                label=str(payload.get("product_name") or "Product"),
                subtitle="Open product",
                action="open",
            )
        )
    if payload.get("return_id"):
        links.append(
            entity_link(
                kind="return",
                id=str(payload["return_id"]),
                label=str(payload.get("return_number") or "Return"),
                subtitle="Open return",
                order_id=str(payload["order_id"]) if payload.get("order_id") else None,
                action="open",
            )
        )
    if payload.get("customer_id"):
        links.append(
            entity_link(
                kind="customer",
                id=str(payload["customer_id"]),
                label=str(payload.get("customer_name") or "Customer"),
                subtitle="Open customer",
                action="open",
            )
        )
    return links


def _propose(proposal: dict, suggestions: list[str]) -> BrainResult:
    links = _links_from_proposal(proposal)
    return BrainResult(
        reply=f"Proposed change: {proposal['summary']}\nConfirm to apply.",
        suggestions=suggestions,
        proposal=proposal,
        metadata={"links": links} if links else {},
    )


def _wants_change_order_status(lowered: str) -> bool:
    if re.search(
        r"\b(change|update|modify|edit)\b.*\b(order\s+)?status\b",
        lowered,
    ):
        return True
    if re.search(r"\b(order\s+status|status\s+of\s+(an?\s+)?order)\b", lowered):
        return True
    if lowered in {
        "change order status",
        "update order status",
        "change status",
        "update status",
        "i want to change order status",
        "i want to update order status",
        "help me change order status",
    }:
        return True
    return False


def _continue_order_status_flow(
    *,
    lowered: str,
    raw: str,
    flow: dict,
    tenant,
    business,
    suggestions: list[str],
) -> BrainResult | None:
    if flow.get("type") != "order_status":
        return None
    # Abort the guided flow — but not when the user is picking "Cancel" as the
    # next order status (pending → cancelled).
    if lowered in {"nevermind", "never mind", "stop", "abort"}:
        return BrainResult(
            reply="Okay — cancelled the status change.",
            suggestions=suggestions,
        )
    if lowered in {"cancel", "cancelled", "canceled"} and flow.get("step") != "pick_status":
        return BrainResult(
            reply="Okay — cancelled the status change.",
            suggestions=suggestions,
        )

    if flow.get("step") == "pick_order" and (
        re.search(r"\b(show\s+more|more|next(\s+page)?)\b", lowered) or lowered.startswith("show more")
    ):
        page_flow = {
            "type": "list_page",
            "list": flow.get("list") or "order_status_pick",
            "offset": int(flow.get("offset") or 0),
            "limit": flow.get("limit"),
        }
        return _ok(
            toolset.continue_paged_list(tenant=tenant, business=business, flow=page_flow),
            suggestions,
            flow={"type": "order_status", "step": "pick_order"},
        )

    step = flow.get("step")
    # Full phrase always wins even mid-flow.
    m = re.search(
        r"\b(?:mark|set)\s+order\s*#?\s*([A-Za-z0-9\-]+)\s+(?:as\s+)?([a-z_ \-]+)\b",
        lowered,
    )
    if m:
        try:
            proposal = toolset.propose_order_status(
                tenant=tenant,
                business=business,
                number=m.group(1),
                status_raw=m.group(2).strip(),
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    if step == "pick_order":
        number = raw.strip().lstrip("#")
        m_num = re.search(r"\b(?:order\s*#?\s*)?([A-Za-z0-9][A-Za-z0-9\-]{3,})\b", lowered)
        if m_num:
            number = m_num.group(1)
        order = toolset.find_order(tenant=tenant, business=business, number=number)
        if order is None:
            listed = toolset.prompt_change_order_status(tenant=tenant, business=business)
            if isinstance(listed, str):
                return BrainResult(
                    reply=f"I couldn’t find an order matching “{raw}”. {listed}",
                    suggestions=suggestions,
                    metadata={"flow": {"type": "order_status", "step": "pick_order"}},
                )
            text, links, chips, _page, _flow = unpack_reply(listed)
            return BrainResult(
                reply=f"I couldn’t find an order matching “{raw}”.\n\n{text}",
                suggestions=list(chips) if chips else suggestions,
                metadata={
                    "links": links,
                    "flow": {"type": "order_status", "step": "pick_order"},
                },
            )
        return _ok(
            toolset.prompt_order_status_choice(order=order),
            suggestions,
            flow={
                "type": "order_status",
                "step": "pick_status",
                "order_number": order.order_number,
                "order_id": str(order.id),
            },
        )

    if step == "pick_status":
        order_number = str(flow.get("order_number") or "").strip()
        if not order_number:
            return _ok(
                toolset.prompt_change_order_status(tenant=tenant, business=business),
                suggestions,
                flow={"type": "order_status", "step": "pick_order"},
            )
        status_raw = lowered
        m_as = re.search(r"\bas\s+([a-z_ \-]+)$", lowered)
        if m_as:
            status_raw = m_as.group(1).strip()
        try:
            proposal = toolset.propose_order_status(
                tenant=tenant,
                business=business,
                number=order_number,
                status_raw=status_raw,
            )
        except ValidationError as exc:
            order = toolset.find_order(tenant=tenant, business=business, number=order_number)
            if order is None:
                return BrainResult(reply=validation_message(exc), suggestions=suggestions)
            return _ok(
                toolset.prompt_order_status_choice(order=order),
                suggestions,
                flow={
                    "type": "order_status",
                    "step": "pick_status",
                    "order_number": order.order_number,
                    "order_id": str(order.id),
                },
            )
        return _propose(proposal, suggestions)

    return None


def _continue_booking_status_flow(
    *,
    lowered: str,
    raw: str,
    flow: dict,
    tenant,
    business,
    suggestions: list[str],
) -> BrainResult | None:
    if flow.get("type") != "booking_status":
        return None
    if lowered in {"nevermind", "never mind", "stop", "abort"}:
        return BrainResult(reply="Okay — cancelled the status change.", suggestions=suggestions)
    if lowered in {"cancel", "cancelled", "canceled"} and flow.get("step") != "pick_status":
        return BrainResult(reply="Okay — cancelled the status change.", suggestions=suggestions)

    m = re.search(
        r"\b(?:mark|set|confirm|cancel|complete|check[\s-]?in)\s+booking\s*#?\s*([A-Za-z0-9\-]+)"
        r"(?:\s+(?:as\s+)?([a-z_ \-]+))?\b",
        lowered,
    )
    if m:
        status_raw = (m.group(2) or "").strip()
        if not status_raw:
            verb = lowered.split()[0]
            if "check" in verb:
                status_raw = "checked_in"
            else:
                status_raw = verb if verb in {"confirm", "cancel", "complete"} else "confirmed"
        try:
            proposal = toolset.propose_booking_status(
                tenant=tenant,
                business=business,
                number=m.group(1),
                status_raw=status_raw,
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    if flow.get("step") == "pick_status":
        booking_number = str(flow.get("booking_number") or "").strip()
        if not booking_number:
            return BrainResult(
                reply="Which booking should I update? Try “booking BK-123”.",
                suggestions=suggestions,
            )
        status_raw = lowered
        m_as = re.search(r"\bas\s+([a-z_ \-]+)$", lowered)
        if m_as:
            status_raw = m_as.group(1).strip()
        try:
            proposal = toolset.propose_booking_status(
                tenant=tenant,
                business=business,
                number=booking_number,
                status_raw=status_raw,
            )
        except ValidationError as exc:
            booking = toolset.find_booking(tenant=tenant, business=business, number=booking_number)
            if booking is None:
                return BrainResult(reply=validation_message(exc), suggestions=suggestions)
            return _ok(
                toolset.prompt_booking_status_choice(tenant=tenant, booking=booking),
                suggestions,
                flow={
                    "type": "booking_status",
                    "step": "pick_status",
                    "booking_number": booking.booking_number,
                    "booking_id": str(booking.id),
                },
            )
        return _propose(proposal, suggestions)

    return None


class RulesBrain(AssistantBrain):
    name = "rules"

    def handle(self, *, text: str, context: dict[str, Any]) -> BrainResult:
        access: AssistantAccess = context["access"]
        business: Business = context["business"]
        suggestions: list[str] = []
        try:
            suggestions = toolset.suggestion_chips(access=access, business=business)
            return self._handle_body(text=text, context=context, suggestions=suggestions)
        except (ValidationError, DjangoValidationError) as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions or ["What can you do?"])
        except Exception:
            logger.exception("Assistant rules brain failed")
            return BrainResult(
                reply=GENERIC_FAIL_REPLY,
                suggestions=suggestions or ["What can you do?"],
            )

    def _handle_body(
        self, *, text: str, context: dict[str, Any], suggestions: list[str]
    ) -> BrainResult:
        tenant: Tenant = context["tenant"]
        business: Business = context["business"]
        access: AssistantAccess = context["access"]
        raw = (text or "").strip()
        lowered = raw.lower().strip()
        flow = context.get("flow") if isinstance(context.get("flow"), dict) else {}

        if not lowered or lowered in {
            "help",
            "what can you do?",
            "what can you do",
            "?",
            "commands",
            "show commands",
        }:
            return BrainResult(reply=toolset.help_text(access=access, business=business), suggestions=suggestions)

        if flow:
            if flow.get("type") == "list_page" and (
                re.search(r"\b(show\s+more|more|next(\s+page)?)\b", lowered) or lowered.startswith("show more")
            ):
                return _ok(
                    toolset.continue_paged_list(tenant=tenant, business=business, flow=flow),
                    suggestions,
                )
            continued = _continue_order_status_flow(
                lowered=lowered,
                raw=raw,
                flow=flow,
                tenant=tenant,
                business=business,
                suggestions=suggestions,
            )
            if continued is not None:
                return continued
            continued = _continue_booking_status_flow(
                lowered=lowered,
                raw=raw,
                flow=flow,
                tenant=tenant,
                business=business,
                suggestions=suggestions,
            )
            if continued is not None:
                return continued

        m_preview = re.search(
            r"\bpreview\s+(order|booking|customer|product|service|staff|return)\s+([A-Za-z0-9\-]+)\b",
            lowered,
        )
        if m_preview:
            return _ok(
                toolset.preview_record(
                    tenant=tenant,
                    business=business,
                    kind=m_preview.group(1),
                    record_id=m_preview.group(2),
                ),
                suggestions,
            )

        if re.search(r"\b(today'?s?\s+overview|overview\s+today|daily\s+summary|summary\s+today)\b", lowered) or lowered in {
            "today overview",
            "overview",
            "daily summary",
        }:
            return _ok(toolset.today_overview(tenant=tenant, business=business, access=access), suggestions)

        if access.mart_enabled:
            mart = _handle_mart(
                lowered=lowered,
                tenant=tenant,
                business=business,
                suggestions=suggestions,
            )
            if mart is not None:
                return mart

        if access.appoint_enabled:
            appoint = _handle_appoint(
                lowered=lowered,
                tenant=tenant,
                business=business,
                suggestions=suggestions,
            )
            if appoint is not None:
                return appoint

        shared = _handle_shared(
            lowered=lowered,
            tenant=tenant,
            business=business,
            suggestions=suggestions,
        )
        if shared is not None:
            return shared

        if not access.mart_enabled and re.search(
            r"\b(order|orders|stock|product|products|return|returns|coupon|sales|inventory)\b",
            lowered,
        ):
            return BrainResult(
                reply="Business Assistant isn’t enabled for Orbit Mart on your plan.",
                suggestions=suggestions,
            )
        if not access.appoint_enabled and re.search(
            r"\b(booking|bookings|appointment|appointments|staff|service|services|no-?show)\b",
            lowered,
        ):
            return BrainResult(
                reply="Business Assistant isn’t enabled for Orbit Appoint on your plan.",
                suggestions=suggestions,
            )

        return BrainResult(reply=UNKNOWN_REPLY, suggestions=suggestions)

def _handle_mart(*, lowered: str, tenant, business, suggestions: list[str]) -> BrainResult | None:
    if _wants_change_order_status(lowered) and not re.search(r"\b(?:mark|set)\s+order\b", lowered):
        return _ok(
            toolset.prompt_change_order_status(tenant=tenant, business=business),
            suggestions,
            flow={"type": "order_status", "step": "pick_order"},
        )

    if re.search(r"\b(cash\s+balance|bank\s+balance|how\s+much\s+cash|books?\s+cash|to\s+collect|to\s+pay|customer\s+dues|supplier\s+dues)\b", lowered):
        return _ok(toolset.books_cash_summary(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(list\s+cash\s+accounts?|cash\s+accounts?|bank\s+accounts?)\b", lowered):
        return _ok(toolset.list_cash_accounts(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(purchases?\s+today|today'?s?\s+purchases?)\b", lowered):
        return _ok(toolset.books_purchases_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(expenses?\s+today|today'?s?\s+expenses?)\b", lowered):
        return _ok(toolset.books_expenses_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(payments?\s+to\s+confirm|orders?\s+awaiting\s+payment|awaiting\s+payment|unconfirmed\s+payments?)\b", lowered):
        return _ok(toolset.list_orders_awaiting_payment(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(failed\s+deliver(?:y|ies)|delivery\s+failed)\b", lowered):
        return _ok(toolset.list_orders_by_status(
                tenant=tenant, business=business, status=OrderStatus.DELIVERY_FAILED
            ), suggestions)
    if re.search(r"\b(list\s+godowns?|godowns?|warehouses?)\b", lowered) and "stock" not in lowered:
        return _ok(toolset.list_godowns(tenant=tenant, business=business), suggestions)
    m = re.search(r"\b(?:godown\s+stock\s+(?:of\s+)?|stock\s+(?:of\s+)?(.+?)\s+in\s+godown)\b", lowered)
    if m is None:
        m = re.search(r"\bstock\s+of\s+(.+?)\s+in\s+(?:godown|warehouse)\b", lowered)
    if m:
        query = (m.group(1) or "").strip()
        if query:
            return _ok(toolset.godown_stock_of_product(tenant=tenant, business=business, query=query), suggestions)
    m = re.search(r"\b(?:orders?\s+for|find\s+orders?\s+for)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.orders_for_customer(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\b(?:confirm|reject)\s+payment\s+(?:for\s+|on\s+)?(?:order\s+)?#?\s*([A-Za-z0-9\-]+)\b", lowered)
    if m:
        action = "confirm" if lowered.startswith("confirm") or "confirm payment" in lowered else "reject"
        if "reject" in lowered:
            action = "reject"
        try:
            proposal = toolset.propose_order_payment(
                tenant=tenant, business=business, number=m.group(1), action=action
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)
    m = re.search(r"\b(?:price\s+of|how\s+much\s+is|what(?:'?s| is)\s+the\s+price\s+of)\s+(.+)$", lowered)
    if m and "service" not in lowered and "haircut" not in lowered:
        # Prefer product price unless clearly a service ask handled later
        return _ok(toolset.price_of_product(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\bset\s+price\s+of\s+(.+?)\s+to\s+(\d+(?:\.\d+)?)\b", lowered)
    if m:
        try:
            proposal = toolset.propose_set_product_price(
                tenant=tenant,
                business=business,
                query=m.group(1).strip(),
                price=Decimal(m.group(2)),
            )
        except (InvalidOperation, ValidationError) as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)
    m = re.search(r"\b(?:find|search)\s+coupon\s+(.+)$", lowered)
    if m:
        return _ok(toolset.find_coupon(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\b(?:deactivate|disable)\s+coupon\s+(.+)$", lowered)
    if m:
        try:
            proposal = toolset.propose_deactivate_coupon(
                tenant=tenant, business=business, query=m.group(1).strip()
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)
    m = re.search(r"\b(?:loyalty\s+points?(?:\s+for)?|points\s+for)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.loyalty_points_for_customer(
                tenant=tenant, business=business, query=m.group(1).strip()
            ), suggestions)

    if re.search(r"\b(sales?\s+today|today'?s?\s+sales?|revenue\s+today|today'?s?\s+revenue)\b", lowered):
        return _ok(toolset.sales_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(books?\s+sales?\s+today|today'?s?\s+books?\s+sales?)\b", lowered):
        return _ok(toolset.books_sales_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\borders?\s+today\b", lowered) or lowered in {
        "orders today",
        "today's orders",
        "todays orders",
    }:
        return _ok(toolset.count_orders_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\borders?\s+yesterday\b", lowered) or lowered in {
        "orders yesterday",
        "yesterday's orders",
        "yesterdays orders",
    }:
        return _ok(toolset.orders_for_date(
                tenant=tenant,
                business=business,
                day=timezone.localdate() - timedelta(days=1),
            ), suggestions)
    if re.search(r"\bonline\s+orders?\b", lowered):
        return _ok(toolset.list_online_orders(tenant=tenant, business=business), suggestions)
    if re.search(r"\bopen\s+orders?\b", lowered):
        return _ok(toolset.list_open_orders(tenant=tenant, business=business), suggestions)
    if re.search(r"\bpending\s+orders?\b", lowered):
        return _ok(toolset.list_orders_by_status(
                tenant=tenant, business=business, status=OrderStatus.PENDING
            ), suggestions)
    if re.search(r"\b(ready\s+orders?|orders?\s+ready)\b", lowered):
        return _ok(toolset.list_orders_by_status(
                tenant=tenant, business=business, status=OrderStatus.READY
            ), suggestions)
    if re.search(r"\b(out\s+for\s+delivery|ofd)\b", lowered):
        return _ok(toolset.list_orders_by_status(
                tenant=tenant, business=business, status=OrderStatus.OUT_FOR_DELIVERY
            ), suggestions)
    if re.search(r"\blow\s+stock\b", lowered):
        return _ok(toolset.low_stock_products(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(out\s+of\s+stock|zero\s+stock)\b", lowered):
        return _ok(toolset.out_of_stock_products(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(pending\s+returns?|returns?\s+pending)\b", lowered):
        return _ok(toolset.pending_returns(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(active\s+coupons?|list\s+coupons?)\b", lowered):
        return _ok(toolset.active_coupons(tenant=tenant, business=business), suggestions)

    m = re.search(r"\b(?:complete|finish)\s+return\s*#?\s*([A-Za-z0-9\-]+)\b", lowered)
    if m:
        try:
            proposal = toolset.propose_return_complete(
                tenant=tenant, business=business, number=m.group(1)
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    m = re.search(r"\breturn\s*#?\s*([A-Za-z0-9\-]+)\b", lowered)
    if m and not re.search(r"\bcomplete\b|\bfinish\b|\bmark\b", lowered):
        return _ok(toolset.get_return(tenant=tenant, business=business, number=m.group(1)), suggestions)

    m = re.search(r"\border(?:\s*#\s*|\s+)([A-Za-z0-9\-]+)\b", lowered)
    if m and not re.search(r"\bmark\b|\bas\b|\bset\b|\bpayment\b|\bstatus\b", lowered):
        return _ok(toolset.get_order_by_number(tenant=tenant, business=business, number=m.group(1)), suggestions)

    # Incomplete: "mark order 123" / "mark order 123 as" → ask for status
    m = re.search(
        r"\b(?:mark|set)\s+order\s*#?\s*([A-Za-z0-9\-]+)(?:\s+as)?\s*$",
        lowered,
    )
    if m:
        order = toolset.find_order(tenant=tenant, business=business, number=m.group(1))
        if order is None:
            return BrainResult(
                reply=f"No order found for #{m.group(1)}.",
                suggestions=suggestions,
            )
        return _ok(
            toolset.prompt_order_status_choice(order=order),
            suggestions,
            flow={
                "type": "order_status",
                "step": "pick_status",
                "order_number": order.order_number,
                "order_id": str(order.id),
            },
        )

    m = re.search(
        r"\b(?:mark|set)\s+order\s*#?\s*([A-Za-z0-9\-]+)\s+(?:as\s+)?([a-z_ \-]+)\b",
        lowered,
    )
    if m:
        try:
            proposal = toolset.propose_order_status(
                tenant=tenant,
                business=business,
                number=m.group(1),
                status_raw=m.group(2).strip(),
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    m = re.search(r"\b(?:find|search)\s+product\s+(.+)$", lowered)
    if m:
        return _ok(toolset.search_products(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)

    m = re.search(r"\b(?:stock\s+of|how\s+much\s+stock(?:\s+of)?|check\s+stock(?:\s+of)?)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.stock_of_product(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)

    m = re.search(
        r"\b(?:add|receive)\s+(\d+(?:\.\d+)?)\s+(?:stock\s+)?(?:to|for|of)\s+(.+)$",
        lowered,
    )
    if m:
        try:
            qty = Decimal(m.group(1))
            proposal = toolset.propose_stock_add(
                tenant=tenant,
                business=business,
                query=m.group(2).strip(),
                quantity=qty,
            )
        except (InvalidOperation, ValidationError) as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    m = re.search(
        r"\b(?:set\s+stock\s+(?:of\s+)?(.+?)\s+to\s+(\d+(?:\.\d+)?))\b",
        lowered,
    )
    if m:
        try:
            qty = Decimal(m.group(2))
            proposal = toolset.propose_stock_set(
                tenant=tenant,
                business=business,
                query=m.group(1).strip(),
                quantity=qty,
            )
        except (InvalidOperation, ValidationError) as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    return None


def _handle_appoint(*, lowered: str, tenant, business, suggestions: list[str]) -> BrainResult | None:
    if re.search(r"\b(recent\s+reviews?|latest\s+reviews?|reviews?)\b", lowered) and "summary" not in lowered and "low" not in lowered and "average" not in lowered:
        if lowered in {"reviews", "recent reviews", "latest reviews"} or "recent review" in lowered or "latest review" in lowered:
            return _ok(toolset.list_recent_reviews(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(review\s+summary|average\s+rating|ratings?\s+summary)\b", lowered):
        return _ok(toolset.reviews_summary(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(low\s+ratings?|bad\s+reviews?|1[-\s]?star|2[-\s]?star)\b", lowered):
        return _ok(toolset.low_rating_reviews(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(staff\s+workload(?:\s+today)?|how\s+busy\s+is\s+(?:the\s+)?team)\b", lowered):
        return _ok(toolset.staff_workload_today(tenant=tenant, business=business), suggestions)
    if re.search(
        r"\b(who(?:'?s| is)\s+working\s+today|staff\s+(?:on\s+duty|schedule)\s+today|on\s+duty\s+today)\b",
        lowered,
    ):
        return _ok(toolset.staff_on_duty_today(tenant=tenant, business=business), suggestions)
    m2 = re.search(r"\bbookings?\s+for\s+(.+?)(?:\s+today)?$", lowered)
    m3 = re.search(r"^(.+?)(?:'|’)?s\s+bookings?\s+today$", lowered)
    if m2 or m3:
        query = (m2.group(1) if m2 else m3.group(1)).strip()
        if query and query not in {"pending", "upcoming", "open"}:
            return _ok(toolset.bookings_for_staff_today(
                    tenant=tenant, business=business, query=query
                ), suggestions)
    m = re.search(r"\b(?:price\s+of|how\s+long\s+is|duration\s+of)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.get_service_detail(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\b(?:upcoming\s+bookings?\s+for)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.customer_upcoming_bookings(
                tenant=tenant, business=business, query=m.group(1).strip()
            ), suggestions)

    if re.search(r"\bbookings?\s+today\b", lowered) or lowered in {
        "bookings today",
        "today's bookings",
        "todays bookings",
        "appointments today",
    }:
        return _ok(toolset.count_bookings_for_date(
                tenant=tenant, business=business, day=timezone.localdate()
            ), suggestions)
    if re.search(r"\b(?:tomorrow'?s?\s+bookings?|bookings?\s+tomorrow)\b", lowered):
        return _ok(toolset.count_bookings_for_date(
                tenant=tenant,
                business=business,
                day=timezone.localdate() + timedelta(days=1),
            ), suggestions)
    if re.search(r"\b(bookings?\s+this\s+week|this\s+week'?s?\s+bookings?)\b", lowered):
        return _ok(toolset.bookings_this_week(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(pending\s+bookings?|bookings?\s+pending)\b", lowered):
        return _ok(toolset.pending_bookings(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(upcoming\s+bookings?|next\s+bookings?)\b", lowered):
        return _ok(toolset.upcoming_bookings(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(no[-\s]?shows?\s+today|today'?s?\s+no[-\s]?shows?)\b", lowered):
        return _ok(toolset.no_shows_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(list\s+services?|services?\s+list|show\s+services?)\b", lowered) or lowered in {
        "services",
        "list services",
    }:
        return _ok(toolset.list_services(tenant=tenant, business=business), suggestions)
    m = re.search(r"\b(?:find|search)\s+service\s+(.+)$", lowered)
    if m:
        return _ok(toolset.list_services(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    if re.search(r"\b(list\s+staff|staff\s+list|show\s+staff)\b", lowered) or lowered in {
        "staff",
        "list staff",
    }:
        return _ok(toolset.list_staff(tenant=tenant, business=business), suggestions)
    m = re.search(r"\b(?:find|search)\s+staff\s+(.+)$", lowered)
    if m:
        return _ok(toolset.list_staff(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)

    m = re.search(r"\b(?:no[-\s]?show)\s+booking\s*#?\s*([A-Za-z0-9\-]+)\b", lowered)
    if m:
        try:
            proposal = toolset.propose_booking_status(
                tenant=tenant,
                business=business,
                number=m.group(1),
                status_raw="no_show",
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)

    m = re.search(r"\bbooking\s+#?\s*([A-Za-z0-9\-]+)\b", lowered)
    if m and not re.search(r"\bmark\b|\bconfirm\b|\bcancel\b|\bcomplete\b|\bcheck\b|\bno", lowered):
        return _ok(toolset.get_booking(tenant=tenant, business=business, number=m.group(1)), suggestions)
    m = re.search(
        r"\b(?:mark|set|confirm|cancel|complete|check[\s-]?in)\s+booking\s*#?\s*([A-Za-z0-9\-]+)"
        r"(?:\s+(?:as\s+)?([a-z_ \-]+))?\b",
        lowered,
    )
    if m:
        status_raw = (m.group(2) or "").strip()
        if not status_raw:
            verb = lowered.split()[0]
            if "check" in verb:
                status_raw = "checked_in"
            else:
                status_raw = verb if verb in {"confirm", "cancel", "complete"} else "confirmed"
        try:
            proposal = toolset.propose_booking_status(
                tenant=tenant,
                business=business,
                number=m.group(1),
                status_raw=status_raw,
            )
        except ValidationError as exc:
            return BrainResult(reply=validation_message(exc), suggestions=suggestions)
        return _propose(proposal, suggestions)
    return None


def _handle_shared(*, lowered: str, tenant, business, suggestions: list[str]) -> BrainResult | None:
    if re.search(r"\b(new\s+customers?\s+today|customers?\s+today)\b", lowered):
        return _ok(toolset.new_customers_today(tenant=tenant, business=business), suggestions)
    if re.search(r"\b(customer\s+count|how\s+many\s+customers?|total\s+customers?)\b", lowered):
        return _ok(toolset.customer_count(tenant=tenant, business=business), suggestions)
    m = re.search(r"\b(?:borrow\s+balance(?:\s+for)?|owes?(?:\s+anything)?(?:\s+for)?)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.customer_borrow_balance(
                tenant=tenant, business=business, query=m.group(1).strip()
            ), suggestions)
    m = re.search(r"\b(?:customer\s+details?(?:\s+for)?|details?\s+for)\s+(.+)$", lowered)
    if m:
        return _ok(toolset.get_customer_detail(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\b(?:find|search)\s+customer\s+(.+)$", lowered)
    if m:
        return _ok(toolset.find_customer(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    m = re.search(r"\bcustomer\s+(.+)$", lowered)
    if m and len(m.group(1).strip()) >= 3 and not re.search(r"\bcount\b|\btoday\b|\bdetails?\b", m.group(1)):
        return _ok(toolset.get_customer_detail(tenant=tenant, business=business, query=m.group(1).strip()), suggestions)
    return None
