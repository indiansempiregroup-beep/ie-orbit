from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import requests
from django.contrib.auth.models import AbstractBaseUser
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Business
from apps.tenancy.models import Tenant
from apps.workflow.models import WorkflowCreatedVia, WorkflowStatus, WorkflowUsage
from apps.workflow.services.definitions import WorkflowDefinitionService
from apps.workflow.services.registry import actions_for_product, known_conditions
from apps.workflow.services.schema import ALLOWED_TRIGGERS, validate_workflow_payload

logger = logging.getLogger("ie_orbit.workflow")

GEMINI_MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-3.5-flash-lite").strip() or "gemini-3.5-flash-lite"


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValidationError({"prompt": "AI returned an empty response. Try again."})
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise ValidationError({"prompt": "Could not parse AI response as JSON."}) from None
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValidationError({"prompt": "Could not parse AI response as JSON."}) from exc
    if not isinstance(data, dict):
        raise ValidationError({"prompt": "AI response must be a JSON object."})
    return data


def _merge_draft(prior: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    """Prefer AI updates, but keep prior fields when the model returns a partial draft."""
    base: dict[str, Any] = dict(prior or {})
    for key in ("name", "description"):
        value = incoming.get(key)
        if value is not None and str(value).strip():
            base[key] = value
    trigger = incoming.get("trigger")
    if isinstance(trigger, dict) and str(trigger.get("type") or "").strip():
        base["trigger"] = trigger
    conditions = incoming.get("conditions")
    if isinstance(conditions, list) and conditions:
        base["conditions"] = conditions
    actions = incoming.get("actions")
    if isinstance(actions, list) and actions:
        base["actions"] = actions
    if incoming.get("metadata") and isinstance(incoming.get("metadata"), dict):
        base["metadata"] = incoming["metadata"]
    return base


def _coerce_for_product(draft: dict[str, Any], *, product_code: str) -> dict[str, Any]:
    """Map cross-product action types so refine doesn't fail validation."""
    product = (product_code or "").strip().lower()
    allowed = set(actions_for_product(product))
    raw_actions = draft.get("actions") if isinstance(draft.get("actions"), list) else []
    coerced: list[dict[str, Any]] = []
    by_type: dict[str, dict[str, Any]] = {}

    def _keep(action: dict[str, Any]) -> None:
        atype = str(action.get("type") or "").strip()
        if atype not in allowed:
            return
        existing = by_type.get(atype)
        if existing is None:
            by_type[atype] = action
            return
        # Prefer the richer offer payload when refining remaps duplicates.
        existing_score = sum(1 for k in ("discount_value", "discount_type", "label") if existing.get(k))
        new_score = sum(1 for k in ("discount_value", "discount_type", "label") if action.get(k))
        if new_score >= existing_score:
            by_type[atype] = action

    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        action = {k: v for k, v in raw.items()}
        atype = str(action.get("type") or "").strip()
        if product == "appointie":
            if atype == "discount.offer":
                action["type"] = "offer.staff_hint"
                _keep(action)
                continue
            if atype == "coupon.ensure":
                # Appoint has no POS coupons — skip rather than overwrite the offer hint.
                continue
        elif product == "shopie" and atype == "offer.staff_hint":
            action["type"] = "discount.offer"
        _keep(action)

    # Preserve original order of first appearance.
    seen: set[str] = set()
    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        atype = str(raw.get("type") or "").strip()
        if product == "appointie" and atype in {"discount.offer", "coupon.ensure"}:
            atype = "offer.staff_hint" if atype == "discount.offer" else ""
        elif product == "shopie" and atype == "offer.staff_hint":
            atype = "discount.offer"
        if not atype or atype in seen or atype not in by_type:
            continue
        seen.add(atype)
        coerced.append(by_type[atype])
    for atype, action in by_type.items():
        if atype not in seen:
            coerced.append(action)

    out = dict(draft)
    out["actions"] = coerced
    out["product_code"] = product
    return out


def explain_workflow(draft: dict[str, Any], *, product_code: str) -> dict[str, Any]:
    """Build a shopkeeper-friendly explanation from a validated workflow draft."""
    name = str(draft.get("name") or "Automation").strip()
    trigger = draft.get("trigger") if isinstance(draft.get("trigger"), dict) else {}
    trigger_type = str(trigger.get("type") or "")
    conditions = draft.get("conditions") if isinstance(draft.get("conditions"), list) else []
    actions = draft.get("actions") if isinstance(draft.get("actions"), list) else []

    when_bits: list[str] = []
    if trigger_type == "checkout.quote":
        when_bits.append("When a customer is billed at the counter or places an online order")
    elif trigger_type == "booking.quote":
        when_bits.append("When staff select a customer while creating a booking")
    elif trigger_type == "schedule.daily":
        when_bits.append("Once a day in the morning")
    elif trigger_type == "calendar.date":
        when_bits.append("On the scheduled calendar day")
    else:
        when_bits.append("When the automation trigger fires")

    for raw in conditions:
        if not isinstance(raw, dict):
            continue
        ctype = str(raw.get("type") or "")
        if ctype == "pet.birthday_today":
            when_bits.append("and it is the pet’s birthday today")
        elif ctype == "customer.birthday_today":
            when_bits.append("and it is the customer’s birthday today")
        elif ctype == "customer.has_tag":
            tag = str(raw.get("tag") or raw.get("value") or "vip").strip() or "vip"
            when_bits.append(f"and the customer is tagged “{tag}”")
        elif ctype == "datetime.recurring_mmdd":
            mmdd = str(raw.get("mmdd") or raw.get("value") or "").strip()
            when_bits.append(f"and today’s date is {mmdd}" if mmdd else "and it is the special day each year")
        elif ctype == "pet.birthday_in_days":
            days = raw.get("days") or 0
            when_bits.append(f"and a pet birthday is within {days} days")

    then_bits: list[str] = []
    for raw in actions:
        if not isinstance(raw, dict):
            continue
        atype = str(raw.get("type") or "")
        if atype == "discount.offer":
            dtype = str(raw.get("discount_type") or "percent")
            value = str(raw.get("discount_value") or "")
            label = str(raw.get("label") or "Special offer")
            offer = f"{value}% off" if dtype == "percent" else f"₹{value} off"
            where = []
            if raw.get("applies_to_pos", True):
                where.append("POS")
            if raw.get("applies_to_online", True):
                where.append("online")
            place = " and ".join(where) if where else "checkout"
            then_bits.append(f"Show “{label}” ({offer}) at {place}")
        elif atype == "offer.staff_hint":
            dtype = str(raw.get("discount_type") or "percent")
            value = str(raw.get("discount_value") or "")
            label = str(raw.get("label") or "Special offer")
            offer = f"{value}% off" if dtype == "percent" else f"₹{value} off"
            then_bits.append(f"Show staff a hint: “{label}” ({offer})")
        elif atype == "notify.staff":
            then_bits.append("Notify staff / managers")
        elif atype == "notify.customer":
            then_bits.append("Notify the customer")
        elif atype == "coupon.ensure":
            then_bits.append(f"Keep coupon {raw.get('code') or ''} ready".strip())

    steps = [
        {"title": "When", "body": " ".join(when_bits).strip() + "."},
        {
            "title": "Then",
            "body": ("; ".join(then_bits) + ".") if then_bits else "Run the configured actions.",
        },
    ]
    product_note = (
        "Orbit Mart can apply this as a discount at checkout."
        if product_code == "shopie"
        else "Orbit Appoint shows this as a staff offer hint on booking."
    )
    return {
        "title": name,
        "summary": str(draft.get("description") or "").strip() or name,
        "steps": steps,
        "product_note": product_note,
        "how_it_works": " ".join(s["body"] for s in steps) + f" {product_note}",
    }


class GeminiAutomationCreator:
    def draft_from_prompt(
        self,
        *,
        tenant: Tenant,
        business: Business,
        prompt: str,
        product_code: str,
        user: AbstractBaseUser | None = None,
        save_draft: bool = False,
        prior_draft: dict[str, Any] | None = None,
        conversation: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        text = (prompt or "").strip()
        min_len = 3 if prior_draft else 8
        if len(text) < min_len:
            raise ValidationError({"prompt": "Describe the automation in a bit more detail."})
        product = (product_code or "").strip().lower()
        api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
        if not api_key:
            raise ValidationError(
                {"prompt": "Gemini is not configured on this server (GEMINI_API_KEY)."}
            )

        appoint_rules = (
            "This business is Orbit Appoint. NEVER use discount.offer or coupon.ensure. "
            "Use offer.staff_hint for discount-like offers, plus notify.staff / notify.customer. "
            "Prefer booking.quote trigger for birthday / VIP offers. "
        )
        mart_rules = (
            "This business is Orbit Mart. Use discount.offer (and optional coupon.ensure). "
            "Do not use offer.staff_hint. Prefer checkout.quote for occasion discounts. "
            "For POS and online bills set applies_to_pos and applies_to_online true on discount.offer, "
            "with discount_type percent|amount and discount_value. "
            "Do NOT attach notify.customer to checkout.quote (that spams on every bill preview). "
            "Birthday emails/alerts use schedule.daily + notify.customer with channels in_app,email. "
        )
        product_rules = appoint_rules if product == "appointie" else mart_rules

        system = (
            "You help Indian shop / salon owners create automation rules for IE Orbit. "
            "Return ONLY compact JSON with keys: "
            "name, description, trigger, conditions, actions, "
            "how_it_works (string, 2-4 short sentences in plain English for the owner), "
            "clarifying_questions (array of up to 3 short follow-up suggestions the owner might add). "
            "Put action fields FLAT on each action object (type, discount_type, discount_value, label, message). "
            "Do NOT nest fields under a parameters key. "
            f"product_code is fixed to {product}. "
            f"{product_rules}"
            f"trigger.type must be one of: {sorted(ALLOWED_TRIGGERS)}. "
            f"condition types allowed: {known_conditions()}. "
            f"action types allowed for this product: {actions_for_product(product)}. "
            "Do not invent action or condition types outside the allow-list. "
            "If the owner is refining a prior draft, return the FULL updated draft "
            "(keep unchanged fields from the prior draft)."
        )

        history_lines: list[str] = []
        for turn in conversation or []:
            role = str(turn.get("role") or "user").strip()
            content = str(turn.get("content") or "").strip()
            if content:
                history_lines.append(f"{role}: {content}")

        parts = [
            f"Business product: {product}",
            f"Owner request:\n{text}",
        ]
        if prior_draft:
            parts.append(f"Prior draft JSON to refine:\n{json.dumps(prior_draft, ensure_ascii=False)}")
        if history_lines:
            parts.append("Conversation so far:\n" + "\n".join(history_lines))
        user_prompt = "\n\n".join(parts)

        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        body = {
            "contents": [{"role": "user", "parts": [{"text": f"{system}\n\n{user_prompt}"}]}],
            "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
        }
        try:
            response = requests.post(endpoint, json=body, timeout=45)
        except requests.RequestException as exc:
            logger.warning("gemini automation draft failed: %s", exc)
            raise ValidationError({"prompt": "Could not reach Gemini. Try again shortly."}) from exc

        if response.status_code >= 400:
            logger.warning("gemini automation HTTP %s: %s", response.status_code, response.text[:400])
            raise ValidationError({"prompt": "Gemini rejected the request. Try a simpler description."})

        payload = response.json()
        candidates = payload.get("candidates") or []
        parts_out = (((candidates[0] or {}).get("content") or {}).get("parts") or []) if candidates else []
        text_out = ""
        for part in parts_out:
            if isinstance(part, dict) and part.get("text"):
                text_out += str(part["text"])
        draft_raw = _extract_json(text_out)
        how_it_works_ai = str(draft_raw.pop("how_it_works", "") or "").strip()
        clarifying = draft_raw.pop("clarifying_questions", None)
        if not isinstance(clarifying, list):
            clarifying = []
        clarifying = [str(item).strip() for item in clarifying if str(item).strip()][:3]

        draft_raw = _merge_draft(prior_draft, draft_raw)
        draft_raw = _coerce_for_product(draft_raw, product_code=product)

        try:
            validated = validate_workflow_payload(data=draft_raw, product_code=product)
        except ValidationError as exc:
            logger.warning(
                "gemini automation draft failed validation product=%s refined=%s detail=%s draft=%s",
                product,
                bool(prior_draft),
                getattr(exc, "detail", None),
                {k: draft_raw.get(k) for k in ("name", "trigger", "conditions", "actions")},
            )
            # Keep the conversation usable: if refine broke the draft, fall back to prior.
            if prior_draft:
                try:
                    validated = validate_workflow_payload(
                        data=_coerce_for_product(dict(prior_draft), product_code=product),
                        product_code=product,
                    )
                    how_it_works_ai = (
                        how_it_works_ai
                        or "We kept your previous plan because that change wasn’t clear enough. "
                        "Try a shorter tweak (for example: “make it 10%” or “also notify staff”)."
                    )
                    if not clarifying:
                        clarifying = [
                            "Make it 10% off",
                            "Also notify the customer",
                            "Only remind staff, no customer message",
                        ]
                except ValidationError:
                    raise ValidationError(
                        {
                            "prompt": (
                                "Couldn’t apply that change. Try a simpler suggestion "
                                "(for example: “make it 10%” or “also notify staff”)."
                            )
                        }
                    ) from exc
            else:
                raise ValidationError(
                    {
                        "prompt": (
                            "Couldn’t turn that into an automation yet. "
                            "Try mentioning the occasion, the offer, and who should be notified."
                        )
                    }
                ) from exc

        explanation = explain_workflow(validated, product_code=product)
        if how_it_works_ai:
            explanation["how_it_works"] = how_it_works_ai
            explanation["summary"] = how_it_works_ai

        usage_meta = payload.get("usageMetadata") or {}
        prompt_tokens = int(usage_meta.get("promptTokenCount") or 0)
        completion_tokens = int(usage_meta.get("candidatesTokenCount") or 0)
        total_tokens = int(usage_meta.get("totalTokenCount") or (prompt_tokens + completion_tokens))
        WorkflowUsage.objects.create(
            tenant=tenant,
            business=business,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
            model=GEMINI_MODEL,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            source_prompt=text,
            metadata={"product_code": product, "refined": bool(prior_draft)},
        )

        definition = None
        if save_draft:
            definition = WorkflowDefinitionService().create(
                tenant=tenant,
                business=business,
                data=validated,
                user=user,
                created_via=WorkflowCreatedVia.GEMINI,
                source_prompt=text,
                status=WorkflowStatus.DRAFT,
            )

        default_suggestions = (
            [
                "Make it 10% off",
                "Also notify the customer",
                "Only remind staff, no customer message",
            ]
            if product == "appointie"
            else [
                "Make the discount smaller",
                "Only at the counter (POS)",
                "Also notify the customer",
            ]
        )

        return {
            "draft": validated,
            "explanation": explanation,
            "suggestions": clarifying or default_suggestions,
            "definition": definition,
            "usage": {
                "model": GEMINI_MODEL,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
            },
        }
