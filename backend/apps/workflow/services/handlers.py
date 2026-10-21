"""Built-in condition and action handlers."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.workflow.services.registry import register_action, register_condition


def _today(context: dict[str, Any]) -> date:
    raw = context.get("today")
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, str) and raw:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            pass
    business = context.get("business")
    tz_name = str(getattr(business, "timezone", "") or "").strip()
    if tz_name:
        try:
            from zoneinfo import ZoneInfo

            return timezone.now().astimezone(ZoneInfo(tz_name)).date()
        except Exception:  # noqa: BLE001
            pass
    return timezone.localdate()


def _customer(context: dict[str, Any]):
    return context.get("customer")


def _pet(context: dict[str, Any]):
    return context.get("pet")


def _as_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value is not None else "0"))
    except Exception:  # noqa: BLE001
        return Decimal("0")


def _fill(text: str, context: dict[str, Any]) -> str:
    """Replace owner-facing placeholders in notification copy."""
    customer = _customer(context)
    pet = _pet(context)
    product = context.get("product")
    order = context.get("order")
    quotation = context.get("quotation")
    booking = context.get("booking")
    customer_name = str(
        getattr(customer, "display_name", None)
        or getattr(customer, "full_name", None)
        or context.get("party_name")
        or "customer"
    )
    replacements = {
        "{customer}": customer_name,
        "{pet}": str(getattr(pet, "name", None) or "pet"),
        "{product}": str(getattr(product, "name", None) or context.get("product_name") or "a product"),
        "{stock}": str(context.get("stock_on_hand") if context.get("stock_on_hand") is not None else ""),
        "{order}": str(getattr(order, "order_number", None) or context.get("order_number") or "the order"),
        "{balance}": str(context.get("balance") or ""),
        "{points}": str(context.get("points_after") or context.get("points") or ""),
        "{quotation}": str(
            getattr(quotation, "quotation_number", None) or context.get("quotation_number") or "the quotation"
        ),
        "{booking}": str(getattr(booking, "booking_number", None) or context.get("booking_number") or "the booking"),
        "{party}": str(context.get("party_name") or customer_name),
        "{age}": str(context.get("age_days") if context.get("age_days") is not None else ""),
    }
    rendered = text
    for token, value in replacements.items():
        if token in rendered:
            rendered = rendered.replace(token, value)
    return rendered


_OCCASION_TRIGGERS = {"checkout.quote", "booking.quote", "schedule.daily", "calendar.date"}


def _birthday_matches(dob: date | None, today: date) -> bool:
    if dob is None:
        return False
    return dob.month == today.month and dob.day == today.day


def _birthday_in_days(dob: date | None, today: date, days: int) -> bool:
    if dob is None:
        return False
    try:
        target = date(today.year, dob.month, dob.day)
    except ValueError:
        # Feb 29 → Feb 28 non-leap
        target = date(today.year, dob.month, min(dob.day, 28))
    if target < today:
        try:
            target = date(today.year + 1, dob.month, dob.day)
        except ValueError:
            target = date(today.year + 1, dob.month, min(dob.day, 28))
    return 0 <= (target - today).days <= max(0, days)


@register_condition("customer.birthday_today")
def customer_birthday_today(params: dict[str, Any], context: dict[str, Any]) -> bool:
    customer = _customer(context)
    dob = getattr(customer, "date_of_birth", None) if customer is not None else None
    return _birthday_matches(dob, _today(context))


@register_condition("customer.has_tag")
def customer_has_tag(params: dict[str, Any], context: dict[str, Any]) -> bool:
    customer = _customer(context)
    if customer is None:
        return False
    wanted = str(params.get("tag") or params.get("value") or "").strip().lower()
    if not wanted:
        return False
    tags = getattr(customer, "tags", None) or []
    return any(str(t).strip().lower() == wanted for t in tags)


@register_condition("pet.birthday_today")
def pet_birthday_today(params: dict[str, Any], context: dict[str, Any]) -> bool:
    pet = _pet(context)
    dob = getattr(pet, "birthday", None) if pet is not None else None
    if dob is not None:
        return _birthday_matches(dob, _today(context))
    pets = context.get("pets") or []
    today = _today(context)
    return any(_birthday_matches(getattr(p, "birthday", None), today) for p in pets)


@register_condition("pet.birthday_in_days")
def pet_birthday_in_days(params: dict[str, Any], context: dict[str, Any]) -> bool:
    days = int(params.get("days") or 0)
    pet = _pet(context)
    today = _today(context)
    if pet is not None:
        return _birthday_in_days(getattr(pet, "birthday", None), today, days)
    pets = context.get("pets") or []
    return any(_birthday_in_days(getattr(p, "birthday", None), today, days) for p in pets)


@register_condition("datetime.in_window")
def datetime_in_window(params: dict[str, Any], context: dict[str, Any]) -> bool:
    now = timezone.now()
    starts = params.get("starts_at")
    ends = params.get("ends_at")
    if starts:
        try:
            start_dt = datetime.fromisoformat(str(starts).replace("Z", "+00:00"))
            if now < start_dt:
                return False
        except ValueError:
            return False
    if ends:
        try:
            end_dt = datetime.fromisoformat(str(ends).replace("Z", "+00:00"))
            if now > end_dt:
                return False
        except ValueError:
            return False
    return True


@register_condition("datetime.is_weekday")
def datetime_is_weekday(params: dict[str, Any], context: dict[str, Any]) -> bool:
    wanted = params.get("weekdays") or params.get("days") or []
    if not isinstance(wanted, list) or not wanted:
        return True
    today = _today(context)
    # Monday=0 … Sunday=6
    return today.weekday() in {int(d) for d in wanted}


@register_condition("datetime.recurring_mmdd")
def datetime_recurring_mmdd(params: dict[str, Any], context: dict[str, Any]) -> bool:
    mmdd = str(params.get("mmdd") or params.get("value") or "").strip()
    if len(mmdd) != 5 or mmdd[2] != "-":
        return False
    today = _today(context)
    return today.strftime("%m-%d") == mmdd


@register_action("notify.staff")
def notify_staff(params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    if context.get("dry_run"):
        return {"ok": True, "skipped": True, "reason": "dry_run"}
    business = context.get("business")
    tenant = context.get("tenant")
    if business is None or tenant is None:
        return {"ok": False, "reason": "missing_business"}
    subject = _fill(str(params.get("subject") or "Automation alert").strip() or "Automation alert", context)
    body = _fill(str(params.get("body") or params.get("message") or subject).strip(), context)
    try:
        from apps.notifications.services.staff_direct import StaffDirectNotifier

        StaffDirectNotifier().notify_managers(
            tenant=tenant,
            business=business,
            subject=subject,
            body=body,
            event_type="WorkflowAutomation",
            metadata={
                "workflow_id": str(context.get("workflow_id") or ""),
                "trigger_key": str(context.get("trigger_key") or ""),
            },
        )
        return {"ok": True, "channel": "staff"}
    except Exception as exc:  # noqa: BLE001 — action should not crash the run
        return {"ok": False, "reason": str(exc)}


@register_action("notify.customer")
def notify_customer(params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    if context.get("dry_run"):
        return {"ok": True, "skipped": True, "reason": "dry_run"}
    business = context.get("business")
    tenant = context.get("tenant")
    customer = _customer(context)
    if business is None or tenant is None or customer is None:
        return {"ok": False, "reason": "missing_customer"}

    pet = _pet(context)
    pet_name = str(getattr(pet, "name", None) or params.get("pet_name") or "your pet").strip()
    cust_name = str(
        getattr(customer, "display_name", None)
        or getattr(customer, "full_name", None)
        or "there"
    ).strip()
    offer_label = str(params.get("offer_label") or params.get("label") or "").strip()
    discount_type = str(params.get("discount_type") or "percent").strip().lower()
    discount_value = str(params.get("discount_value") or "").strip()
    if discount_type == "percent" and discount_value:
        offer_text = f"{discount_value.rstrip('0').rstrip('.') if '.' in discount_value else discount_value}% off"
    elif discount_value:
        offer_text = f"₹{discount_value} off"
    else:
        offer_text = offer_label or "a special birthday treat"

    trigger_key = str(context.get("trigger_key") or "")
    occasion = trigger_key in _OCCASION_TRIGGERS or pet is not None or bool(discount_value)
    shop_name = str(
        getattr(business, "display_name", None) or getattr(business, "business_name", None) or "us"
    ).strip()
    if occasion:
        default_subject = (
            f"Happy birthday, {pet_name}! {offer_text} today" if pet else f"A special offer for you — {offer_text}"
        )
        default_body = (
            f"Hi {cust_name}, today is {pet_name}'s birthday! Enjoy {offer_text} "
            f"on POS and online orders today from {shop_name}."
            if pet
            else f"Hi {cust_name}, you have a special offer today: {offer_text}."
        )
    else:
        default_subject = "Update from " + shop_name
        default_body = f"Hi {cust_name}, there is an update from {shop_name}."
    subject = _fill(str(params.get("subject") or default_subject).strip(), context)
    body = _fill(str(params.get("body") or params.get("message") or default_body).strip(), context)

    raw_channels = params.get("channels") or params.get("channel") or "in_app,email"
    if isinstance(raw_channels, str):
        channels = [c.strip().lower() for c in raw_channels.split(",") if c.strip()]
    elif isinstance(raw_channels, list):
        channels = [str(c).strip().lower() for c in raw_channels if str(c).strip()]
    else:
        channels = ["in_app", "email"]
    if not channels:
        channels = ["in_app", "email"]

    headline = _fill(
        str(
            params.get("headline")
            or (f"Happy birthday, {pet_name}!" if pet and occasion else subject)
        ).strip(),
        context,
    )
    try:
        from apps.notifications.services.customer_direct import CustomerDirectNotifier
        from apps.notifications.services.providers.email import email_info_card

        if occasion:
            card_lines = [
                f"Offer: {offer_text}",
                "Valid today at the counter (POS) and on online orders",
                f"From {shop_name}",
            ]
            card_title = offer_label or "Today's birthday offer"
        else:
            card_lines = [body, f"From {shop_name}"]
            card_title = subject
        extra_html = email_info_card(title=card_title, lines=card_lines)
        CustomerDirectNotifier().notify_customer(
            tenant=tenant,
            business=business,
            customer=customer,
            subject=subject,
            body=body,
            channels=channels,
            event_type="WorkflowAutomation",
            headline=headline,
            extra_html=extra_html,
            cta_label=str(params.get("cta_label") or "Shop now").strip(),
            cta_url=str(params.get("cta_url") or "").strip(),
            metadata={
                "workflow_id": str(context.get("workflow_id") or ""),
                "trigger_key": str(context.get("trigger_key") or ""),
                "pet_id": str(getattr(pet, "id", "") or ""),
                "offer_label": offer_label,
                "discount_value": discount_value,
            },
        )
        # Mirror a staff alert so Ops Alerts can show the same event.
        try:
            from apps.notifications.services.staff_direct import StaffDirectNotifier

            StaffDirectNotifier().notify_managers(
                tenant=tenant,
                business=business,
                subject=(
                    f"Birthday offer sent · {pet_name}"
                    if pet and occasion
                    else f"Customer notified · {cust_name}"
                ),
                body=f"{cust_name} was notified. {body}",
                event_type="WorkflowAutomation",
                channels=["in_app"],
                headline="Automation alert",
                metadata={
                    "workflow_id": str(context.get("workflow_id") or ""),
                    "trigger_key": str(context.get("trigger_key") or ""),
                    "customer_id": str(getattr(customer, "id", "") or ""),
                    "pet_id": str(getattr(pet, "id", "") or ""),
                },
            )
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "channel": ",".join(channels)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": str(exc)}


@register_action("discount.offer")
def discount_offer(params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    discount_type = str(params.get("discount_type") or "percent").strip().lower()
    if discount_type not in {"percent", "amount"}:
        discount_type = "percent"
    try:
        value = Decimal(str(params.get("discount_value") or params.get("value") or "0"))
    except Exception:  # noqa: BLE001
        value = Decimal("0")
    if value <= 0:
        return {"ok": False, "reason": "invalid_discount"}
    label = str(params.get("label") or params.get("name") or "Special offer").strip()
    offer = {
        "ok": True,
        "kind": "discount",
        "label": label,
        "discount_type": discount_type,
        "discount_value": str(value.quantize(Decimal("0.01"))),
        "applies_to_pos": bool(params.get("applies_to_pos", True)),
        "applies_to_online": bool(params.get("applies_to_online", True)),
        "workflow_id": str(context.get("workflow_id") or ""),
        "workflow_name": str(context.get("workflow_name") or ""),
        "source": "automation",
    }
    offers = context.setdefault("offers", [])
    if isinstance(offers, list):
        offers.append(offer)
    return offer


@register_action("coupon.ensure")
def coupon_ensure(params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    business = context.get("business")
    tenant = context.get("tenant")
    if business is None or tenant is None:
        return {"ok": False, "reason": "missing_business"}
    from apps.shopie.models import DiscountType, ShopCoupon
    from apps.shopie.services.coupons import CouponService, normalize_coupon_code

    code = normalize_coupon_code(str(params.get("code") or f"AUTO{str(context.get('workflow_id') or '')[:8]}"))
    discount_type = str(params.get("discount_type") or DiscountType.PERCENT).strip().lower()
    try:
        value = Decimal(str(params.get("discount_value") or "10"))
    except Exception:  # noqa: BLE001
        value = Decimal("10")
    eligibility: dict[str, Any] = {}
    if params.get("pet_birthday"):
        eligibility["pet_birthday"] = True
    if params.get("customer_birthday"):
        eligibility["customer_birthday"] = True
    tag = str(params.get("tag") or "").strip()
    if tag:
        eligibility["tags"] = [tag]
    mmdd = str(params.get("recurring_mmdd") or "").strip()
    if mmdd:
        eligibility["recurring_mmdd"] = mmdd

    existing = ShopCoupon.objects.filter(tenant=tenant, business=business, code=code).first()
    payload = {
        "code": code,
        "name": str(params.get("name") or params.get("label") or code).strip() or code,
        "description": str(params.get("description") or "").strip(),
        "discount_type": discount_type,
        "discount_value": value,
        "applies_to_pos": bool(params.get("applies_to_pos", True)),
        "applies_to_online": bool(params.get("applies_to_online", True)),
        "eligibility": eligibility,
        "first_order_only": False,
        "is_active": True,
        "max_redemptions_per_customer": params.get("max_redemptions_per_customer", 1),
    }
    service = CouponService()
    try:
        if existing is None:
            coupon = service.create_coupon(tenant=tenant, business=business, data=payload)
        else:
            coupon = service.update_coupon(coupon=existing, data=payload)
        meta = dict(coupon.metadata or {})
        meta["workflow_id"] = str(context.get("workflow_id") or "")
        coupon.metadata = meta
        coupon.save(update_fields=["metadata", "updated_at"])
        return {"ok": True, "coupon_id": str(coupon.id), "code": coupon.code}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": str(exc)}


@register_action("offer.staff_hint")
def offer_staff_hint(params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    discount_type = str(params.get("discount_type") or "percent").strip().lower()
    try:
        value = Decimal(str(params.get("discount_value") or params.get("value") or "0"))
    except Exception:  # noqa: BLE001
        value = Decimal("0")
    hint = {
        "ok": True,
        "kind": "staff_hint",
        "label": str(params.get("label") or "Special offer").strip(),
        "discount_type": discount_type,
        "discount_value": str(value.quantize(Decimal("0.01"))) if value > 0 else "0.00",
        "message": str(params.get("message") or params.get("body") or "").strip(),
        "workflow_id": str(context.get("workflow_id") or ""),
        "workflow_name": str(context.get("workflow_name") or ""),
        "source": "automation",
    }
    hints = context.setdefault("staff_hints", [])
    if isinstance(hints, list):
        hints.append(hint)
    return hint


@register_condition("inventory.out_of_stock")
def inventory_out_of_stock(params: dict[str, Any], context: dict[str, Any]) -> bool:
    return _as_decimal(context.get("stock_on_hand")) <= 0


@register_condition("inventory.below_threshold")
def inventory_below_threshold(params: dict[str, Any], context: dict[str, Any]) -> bool:
    stock = _as_decimal(context.get("stock_on_hand"))
    raw_threshold = params.get("threshold")
    if raw_threshold is None:
        raw_threshold = context.get("threshold")
    return stock <= _as_decimal(raw_threshold)


@register_condition("party.balance_due")
def party_balance_due(params: dict[str, Any], context: dict[str, Any]) -> bool:
    balance = _as_decimal(context.get("balance"))
    minimum = _as_decimal(params.get("min_amount") if params.get("min_amount") is not None else params.get("amount") or "0")
    min_days = int(params.get("min_days") or params.get("days") or 0)
    age = int(context.get("age_days") or 0)
    if balance <= minimum:
        return False
    return age >= max(0, min_days)


@register_condition("quotation.older_than_days")
def quotation_older_than_days(params: dict[str, Any], context: dict[str, Any]) -> bool:
    days = int(params.get("days") or 3)
    return int(context.get("age_days") or 0) >= max(0, days)


@register_condition("loyalty.crossed_points")
def loyalty_crossed_points(params: dict[str, Any], context: dict[str, Any]) -> bool:
    try:
        target = int(params.get("points") or params.get("value") or 0)
        before = int(context.get("points_before") or 0)
        after = int(context.get("points_after") or context.get("points") or 0)
    except (TypeError, ValueError):
        return False
    if target <= 0:
        return False
    return before < target <= after
