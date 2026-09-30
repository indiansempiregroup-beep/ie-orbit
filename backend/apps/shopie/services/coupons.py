from __future__ import annotations

import re
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.constants import FEATURE_SHOPIE_COUPONS, PRODUCT_SHOPIE
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.customers.models import Customer
from apps.shopie.models import (
    DiscountType,
    FulfillmentMode,
    OrderStatus,
    ShopCoupon,
    ShopCouponRedemption,
    ShopOrder,
    ShopProduct,
)
from apps.tenancy.models import Tenant

_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,39}$")
ONLINE_FULFILLMENT = {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}


def normalize_coupon_code(code: str) -> str:
    return str(code or "").strip().upper()


class CouponService:
    def list_coupons(
        self,
        *,
        tenant: Tenant,
        business: Business,
        active_only: bool = False,
    ) -> QuerySet[ShopCoupon]:
        qs = ShopCoupon.objects.filter(tenant=tenant, business=business).order_by("-created_at")
        if active_only:
            now = timezone.now()
            qs = qs.filter(is_active=True)
            qs = qs.exclude(starts_at__gt=now).exclude(ends_at__lt=now)
        return qs

    def get_coupon(self, *, tenant: Tenant, coupon_id: UUID) -> ShopCoupon:
        return ShopCoupon.objects.get(tenant=tenant, id=coupon_id)

    def _validate_payload(
        self, data: dict[str, Any], *, existing: ShopCoupon | None = None
    ) -> dict[str, Any]:
        payload = dict(data)
        if "code" in payload or existing is None:
            code = normalize_coupon_code(
                str(payload.get("code") or (existing.code if existing else ""))
            )
            if not _CODE_RE.match(code):
                raise ValidationError(
                    {"code": "Use 2–40 characters: letters, numbers, hyphen, or underscore."}
                )
            payload["code"] = code
        if "name" in payload or existing is None:
            name = str(payload.get("name") or (existing.name if existing else "")).strip()
            if not name:
                raise ValidationError({"name": "Name is required."})
            payload["name"] = name
        discount_type = (
            str(
                payload.get("discount_type")
                if "discount_type" in payload
                else (existing.discount_type if existing else DiscountType.PERCENT)
            )
            .strip()
            .lower()
        )
        if discount_type not in {DiscountType.PERCENT, DiscountType.AMOUNT}:
            raise ValidationError({"discount_type": "discount_type must be percent or amount."})
        payload["discount_type"] = discount_type
        value = Decimal(
            str(
                payload.get("discount_value")
                if "discount_value" in payload
                else (existing.discount_value if existing else "0")
            )
        )
        if value <= 0:
            raise ValidationError({"discount_value": "Discount must be greater than zero."})
        if discount_type == DiscountType.PERCENT and value > Decimal("100"):
            raise ValidationError({"discount_value": "Percent discount cannot exceed 100."})
        payload["discount_value"] = value.quantize(Decimal("0.01"))
        min_order = Decimal(
            str(
                payload.get("min_order_total")
                if "min_order_total" in payload
                else (existing.min_order_total if existing else "0")
            )
            or "0"
        )
        if min_order < 0:
            raise ValidationError({"min_order_total": "Minimum order cannot be negative."})
        payload["min_order_total"] = min_order.quantize(Decimal("0.01"))
        if "max_discount_amount" in payload:
            raw_cap = payload.get("max_discount_amount")
            if raw_cap in (None, ""):
                payload["max_discount_amount"] = None
            else:
                cap = Decimal(str(raw_cap))
                if cap <= 0:
                    raise ValidationError(
                        {"max_discount_amount": "Max discount must be greater than zero."}
                    )
                payload["max_discount_amount"] = cap.quantize(Decimal("0.01"))
        starts_at = (
            payload.get("starts_at")
            if "starts_at" in payload
            else (existing.starts_at if existing else None)
        )
        ends_at = (
            payload.get("ends_at")
            if "ends_at" in payload
            else (existing.ends_at if existing else None)
        )
        if starts_at and ends_at and ends_at < starts_at:
            raise ValidationError({"ends_at": "End date must be on or after the start date."})
        if "max_redemptions_per_customer" in payload:
            raw_per_customer = payload.get("max_redemptions_per_customer")
            if raw_per_customer in (None, ""):
                payload["max_redemptions_per_customer"] = None
            else:
                per_customer = int(raw_per_customer)
                if per_customer < 1:
                    raise ValidationError(
                        {
                            "max_redemptions_per_customer": (
                                "Must be at least 1, or left blank for unlimited."
                            )
                        }
                    )
                payload["max_redemptions_per_customer"] = per_customer
        if "applies_to_online" in payload or existing is None:
            if "applies_to_online" in payload:
                payload["applies_to_online"] = bool(payload.get("applies_to_online"))
            elif existing is None:
                payload["applies_to_online"] = True
        if "applies_to_pos" in payload or existing is None:
            if "applies_to_pos" in payload:
                payload["applies_to_pos"] = bool(payload.get("applies_to_pos"))
            elif existing is None:
                payload["applies_to_pos"] = False
        if "eligibility" in payload:
            elig = payload.get("eligibility")
            if elig in (None, ""):
                payload["eligibility"] = {}
            elif not isinstance(elig, dict):
                raise ValidationError({"eligibility": "eligibility must be an object."})
            else:
                payload["eligibility"] = elig
        elif existing is None:
            payload["eligibility"] = {}
        return payload

    @transaction.atomic
    def create_coupon(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopCoupon:
        payload = self._validate_payload(data)
        try:
            return ShopCoupon.objects.create(
                tenant=tenant,
                business=business,
                code=payload["code"],
                name=payload["name"],
                description=str(payload.get("description") or ""),
                discount_type=payload["discount_type"],
                discount_value=payload["discount_value"],
                min_order_total=payload["min_order_total"],
                max_discount_amount=payload.get("max_discount_amount"),
                starts_at=payload.get("starts_at"),
                ends_at=payload.get("ends_at"),
                max_redemptions=payload.get("max_redemptions"),
                max_redemptions_per_customer=payload.get("max_redemptions_per_customer"),
                first_order_only=bool(payload.get("first_order_only", False)),
                applies_to_online=bool(payload.get("applies_to_online", True)),
                applies_to_pos=bool(payload.get("applies_to_pos", False)),
                eligibility=payload.get("eligibility") or {},
                is_active=bool(payload.get("is_active", True)),
            )
        except IntegrityError as exc:
            raise ValidationError({"code": "A coupon with this code already exists."}) from exc

    @transaction.atomic
    def update_coupon(self, *, coupon: ShopCoupon, data: dict[str, Any]) -> ShopCoupon:
        payload = self._validate_payload(data, existing=coupon)
        for field in (
            "code",
            "name",
            "description",
            "discount_type",
            "discount_value",
            "min_order_total",
            "max_discount_amount",
            "starts_at",
            "ends_at",
            "max_redemptions",
            "max_redemptions_per_customer",
            "first_order_only",
            "applies_to_online",
            "applies_to_pos",
            "eligibility",
            "is_active",
        ):
            if field in payload:
                setattr(coupon, field, payload[field])
        try:
            coupon.save()
        except IntegrityError as exc:
            raise ValidationError({"code": "A coupon with this code already exists."}) from exc
        return coupon

    def delete_coupon(self, *, coupon: ShopCoupon) -> None:
        coupon.delete()

    def merchandise_subtotal_for_lines(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
    ) -> Decimal:
        return self.totals_for_lines(tenant=tenant, business=business, lines=lines)["merchandise"]

    def totals_for_lines(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
    ) -> dict[str, Decimal]:
        merchandise = Decimal("0.00")
        tax_total = Decimal("0.00")
        payable = Decimal("0.00")
        for raw in lines:
            product = ShopProduct.objects.get(
                tenant=tenant, business=business, id=raw["product_id"]
            )
            qty = Decimal(str(raw.get("quantity") or "1"))
            if qty <= 0:
                raise ValidationError({"lines": "Quantity must be positive."})
            unit_price = Decimal(
                str(raw.get("unit_price") if raw.get("unit_price") is not None else product.price)
            )
            tax_rate = Decimal(
                str(raw.get("tax_rate") if raw.get("tax_rate") is not None else product.tax_rate)
            )
            product_meta = product.metadata if isinstance(product.metadata, dict) else {}
            if "tax_inclusive" in raw and raw.get("tax_inclusive") is not None:
                tax_inclusive = bool(raw.get("tax_inclusive"))
            else:
                tax_inclusive = bool(product_meta.get("tax_inclusive"))
            line_gross = (unit_price * qty).quantize(Decimal("0.01"))
            if tax_inclusive and tax_rate > 0:
                line_subtotal = (
                    line_gross * Decimal("100") / (Decimal("100") + tax_rate)
                ).quantize(Decimal("0.01"))
                line_tax = (line_gross - line_subtotal).quantize(Decimal("0.01"))
                line_total = line_gross
            else:
                line_subtotal = line_gross
                line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
                line_total = (line_subtotal + line_tax).quantize(Decimal("0.01"))
            merchandise += line_subtotal
            tax_total += line_tax
            payable += line_total
        return {
            "merchandise": merchandise.quantize(Decimal("0.01")),
            "tax": tax_total.quantize(Decimal("0.01")),
            "payable": payable.quantize(Decimal("0.01")),
        }

    def _discount_amount(self, *, coupon: ShopCoupon, payable_total: Decimal) -> Decimal:
        if coupon.discount_type == DiscountType.PERCENT:
            amount = (payable_total * coupon.discount_value / Decimal("100")).quantize(
                Decimal("0.01")
            )
            if coupon.max_discount_amount is not None:
                amount = min(amount, coupon.max_discount_amount)
            return min(payable_total, amount).quantize(Decimal("0.01"))
        return min(payable_total, coupon.discount_value).quantize(Decimal("0.01"))

    def _customer_order_count(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        exclude_order_id: UUID | None = None,
    ) -> int:
        qs = ShopOrder.objects.filter(
            tenant=tenant,
            business=business,
            customer=customer,
        ).exclude(status=OrderStatus.CANCELLED)
        if exclude_order_id:
            qs = qs.exclude(id=exclude_order_id)
        return qs.count()

    def quote(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str,
        merchandise_subtotal: Decimal,
        fulfillment_mode: str,
        customer: Customer | None = None,
        coupon: ShopCoupon | None = None,
        exclude_order_id: UUID | None = None,
        payable_total: Decimal | None = None,
    ) -> dict[str, Any]:
        mode = (fulfillment_mode or "").strip().lower()
        if mode == FulfillmentMode.POS:
            if not getattr(coupon, "applies_to_pos", False):
                raise ValidationError(
                    {"coupon_code": "This coupon does not apply to counter / POS sales."}
                )
        elif mode in ONLINE_FULFILLMENT:
            if not getattr(coupon, "applies_to_online", True):
                raise ValidationError(
                    {"coupon_code": "This coupon does not apply to online orders."}
                )
        else:
            raise ValidationError(
                {"coupon_code": "Coupons apply to POS, pickup, or delivery orders only."}
            )
        if not EntitlementService().has_feature(
            business=business,
            feature=FEATURE_SHOPIE_COUPONS,
            product_code=PRODUCT_SHOPIE,
        ):
            raise ValidationError({"coupon_code": "Coupons are not enabled for this shop."})
        normalized = normalize_coupon_code(code)
        if not normalized:
            raise ValidationError({"coupon_code": "Enter a coupon code."})
        if coupon is None:
            coupon = ShopCoupon.objects.filter(
                tenant=tenant, business=business, code=normalized
            ).first()
        if coupon is None or coupon.code != normalized:
            raise ValidationError({"coupon_code": "This coupon code is not valid."})
        check = self._evaluate_coupon(
            coupon=coupon,
            payable_total=(
                payable_total if payable_total is not None else merchandise_subtotal
            ),
            customer=customer,
            exclude_order_id=exclude_order_id,
            fulfillment_mode=mode,
        )
        if not check["applicable"]:
            raise ValidationError({"coupon_code": check["reason"]})
        return {
            "coupon": coupon,
            "discount_amount": check["discount_amount"],
            "code": coupon.code,
            "name": coupon.name,
            "discount_type": coupon.discount_type,
            "discount_value": coupon.discount_value,
        }

    def _evaluate_coupon(
        self,
        *,
        coupon: ShopCoupon,
        payable_total: Decimal,
        customer: Customer | None = None,
        exclude_order_id: UUID | None = None,
        fulfillment_mode: str | None = None,
        pet=None,
        pets: list | None = None,
    ) -> dict[str, Any]:
        now = timezone.now()
        mode = (fulfillment_mode or "").strip().lower()
        if mode == FulfillmentMode.POS and not getattr(coupon, "applies_to_pos", False):
            return self._eval_result(False, hide=True, reason="Not available at the counter.")
        if mode in ONLINE_FULFILLMENT and not getattr(coupon, "applies_to_online", True):
            return self._eval_result(False, hide=True, reason="Not available for online orders.")
        if not coupon.is_active:
            return self._eval_result(False, hide=True, reason="This coupon is no longer active.")
        if coupon.starts_at and coupon.starts_at > now:
            return self._eval_result(False, hide=True, reason="This coupon is not active yet.")
        if coupon.ends_at and coupon.ends_at < now:
            return self._eval_result(False, hide=True, reason="This coupon has expired.")
        if coupon.max_redemptions is not None and coupon.redemption_count >= coupon.max_redemptions:
            return self._eval_result(
                False, hide=True, reason="This coupon has reached its redemption limit."
            )
        elig = getattr(coupon, "eligibility", None) or {}
        if isinstance(elig, dict) and elig:
            today = timezone.localdate()
            if elig.get("customer_birthday"):
                dob = getattr(customer, "date_of_birth", None) if customer else None
                if dob is None or dob.month != today.month or dob.day != today.day:
                    return self._eval_result(
                        False, hide=True, reason="This offer is for birthdays only."
                    )
            if elig.get("pet_birthday"):
                pet_list = list(pets or [])
                if pet is not None:
                    pet_list = [pet, *pet_list]
                matched = False
                for item in pet_list:
                    bday = getattr(item, "birthday", None)
                    if bday and bday.month == today.month and bday.day == today.day:
                        matched = True
                        break
                if not matched and customer is not None:
                    try:
                        from apps.shopie.models import ShopPet

                        for item in ShopPet.objects.filter(
                            tenant=coupon.tenant,
                            business=coupon.business,
                            customer=customer,
                            is_active=True,
                        ):
                            bday = item.birthday
                            if bday and bday.month == today.month and bday.day == today.day:
                                matched = True
                                break
                    except Exception:  # noqa: BLE001
                        matched = False
                if not matched:
                    return self._eval_result(
                        False, hide=True, reason="This offer is for pet birthdays only."
                    )
            tags_needed = elig.get("tags") or []
            if tags_needed:
                customer_tags = {
                    str(t).strip().lower()
                    for t in (getattr(customer, "tags", None) or [])
                }
                wanted = {str(t).strip().lower() for t in tags_needed if str(t).strip()}
                if not wanted.intersection(customer_tags):
                    return self._eval_result(
                        False, hide=True, reason="This offer is for selected customers only."
                    )
            mmdd = str(elig.get("recurring_mmdd") or "").strip()
            if mmdd and today.strftime("%m-%d") != mmdd:
                return self._eval_result(
                    False, hide=True, reason="This offer is only valid on a specific day."
                )
        if customer is not None:
            if coupon.first_order_only and (
                self._customer_order_count(
                    tenant=coupon.tenant,
                    business=coupon.business,
                    customer=customer,
                    exclude_order_id=exclude_order_id,
                )
                > 0
            ):
                return self._eval_result(
                    False, hide=True, reason="This coupon is for first orders only."
                )
            if coupon.max_redemptions_per_customer is not None:
                used = ShopCouponRedemption.objects.filter(
                    tenant=coupon.tenant,
                    business=coupon.business,
                    coupon=coupon,
                    customer=customer,
                ).count()
                if used >= coupon.max_redemptions_per_customer:
                    return self._eval_result(
                        False, hide=True, reason="You have already used this coupon."
                    )
        remaining = Decimal("0.00")
        if coupon.min_order_total and payable_total < coupon.min_order_total:
            remaining = (coupon.min_order_total - payable_total).quantize(Decimal("0.01"))
            advertised_base = coupon.min_order_total
            return {
                "applicable": False,
                "hide": False,
                "reason": f"Add items worth at least {remaining} more to use this coupon.",
                "remaining_to_unlock": remaining,
                "discount_amount": self._discount_amount(
                    coupon=coupon, payable_total=advertised_base
                ),
            }
        discount_amount = self._discount_amount(coupon=coupon, payable_total=payable_total)
        if discount_amount <= 0:
            return self._eval_result(
                False,
                hide=payable_total > 0,
                reason="This coupon does not apply to the current cart.",
            )
        return {
            "applicable": True,
            "hide": False,
            "reason": "",
            "remaining_to_unlock": remaining,
            "discount_amount": discount_amount,
        }

    @staticmethod
    def _eval_result(applicable: bool, *, hide: bool, reason: str) -> dict[str, Any]:
        return {
            "applicable": applicable,
            "hide": hide,
            "reason": reason,
            "remaining_to_unlock": Decimal("0.00"),
            "discount_amount": Decimal("0.00"),
        }

    def list_for_cart(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
        fulfillment_mode: str,
        customer: Customer | None = None,
        pet=None,
    ) -> list[dict[str, Any]]:
        mode = (fulfillment_mode or "").strip().lower() or FulfillmentMode.PICKUP
        if mode not in ONLINE_FULFILLMENT and mode != FulfillmentMode.POS:
            return []
        payable = self._payable_for_offers(
            tenant=tenant, business=business, lines=lines or []
        )
        offers: list[dict[str, Any]] = []
        for coupon in self.list_coupons(tenant=tenant, business=business, active_only=True):
            check = self._evaluate_coupon(
                coupon=coupon,
                payable_total=payable,
                customer=customer,
                fulfillment_mode=mode,
                pet=pet,
            )
            if check["hide"]:
                continue
            offers.append(
                {
                    "code": coupon.code,
                    "name": coupon.name,
                    "description": coupon.description,
                    "discount_type": coupon.discount_type,
                    "discount_value": str(coupon.discount_value),
                    "min_order_total": str(coupon.min_order_total),
                    "max_discount_amount": (
                        str(coupon.max_discount_amount)
                        if coupon.max_discount_amount is not None
                        else None
                    ),
                    "discount_amount": str(check["discount_amount"]),
                    "applicable": check["applicable"],
                    "reason": check["reason"],
                    "remaining_to_unlock": str(check["remaining_to_unlock"]),
                    "first_order_only": coupon.first_order_only,
                    "applies_to_pos": bool(getattr(coupon, "applies_to_pos", False)),
                    "applies_to_online": bool(getattr(coupon, "applies_to_online", True)),
                    "ends_at": coupon.ends_at.isoformat() if coupon.ends_at else None,
                    "source": "coupon",
                }
            )
        offers.sort(
            key=lambda row: (
                0 if row["applicable"] else 1,
                -Decimal(str(row["discount_amount"] or "0")),
                Decimal(str(row["remaining_to_unlock"] or "0")),
            )
        )
        return offers

    @staticmethod
    def _automation_discount_amount(
        *,
        discount_type: str,
        discount_value: Any,
        payable_total: Decimal,
    ) -> Decimal:
        dtype = str(discount_type or "percent").strip().lower()
        try:
            value = Decimal(str(discount_value or "0"))
        except Exception:  # noqa: BLE001
            value = Decimal("0")
        if value <= 0 or payable_total <= 0:
            return Decimal("0.00")
        if dtype == "amount":
            return min(payable_total, value).quantize(Decimal("0.01"))
        if value > Decimal("100"):
            value = Decimal("100")
        return (payable_total * value / Decimal("100")).quantize(Decimal("0.01"))

    def eligible_offers(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
        fulfillment_mode: str,
        customer: Customer | None = None,
        pet=None,
    ) -> dict[str, Any]:
        """Coupons + automation discount.offer results for POS/online checkout."""
        coupon_offers = self.list_for_cart(
            tenant=tenant,
            business=business,
            lines=lines,
            fulfillment_mode=fulfillment_mode,
            customer=customer,
            pet=pet,
        )
        # Customer-facing "you save" is against payable (shelf total). Percent bill
        # discounts are applied on taxable in create_order, which still reduces
        # payable by the same percent for uniform GST (e.g. ₹100 incl. → save ₹15).
        try:
            cart_totals = self.totals_for_lines(tenant=tenant, business=business, lines=lines)
            display_payable = cart_totals["payable"]
        except (ValidationError, ShopProduct.DoesNotExist, KeyError, TypeError, ValueError):
            display_payable = self._payable_for_offers(tenant=tenant, business=business, lines=lines)
        automation_offers: list[dict[str, Any]] = []
        try:
            from apps.shopie.models import ShopPet
            from apps.workflow.services.access import resolve_product_code
            from apps.workflow.services.events import emit

            product_code = resolve_product_code(business=business)
            event_key = "booking.quote" if product_code == "appointie" else "checkout.quote"
            pets: list[Any] = []
            if pet is not None:
                pets = [pet]
            elif customer is not None:
                pets = list(
                    ShopPet.objects.filter(
                        tenant=tenant,
                        business=business,
                        customer=customer,
                    )
                )
            outcome = emit(
                tenant=tenant,
                business=business,
                event_key=event_key,
                context={
                    "customer": customer,
                    "pet": pets[0] if pets else pet,
                    "pets": pets,
                },
                product_code=product_code,
                subject_type="customer" if customer else "",
                subject_id=str(customer.id) if customer else "",
                dry_run=True,
            )
            mode = (fulfillment_mode or "").strip().lower()
            for offer in outcome.get("offers") or []:
                if mode == FulfillmentMode.POS and not offer.get("applies_to_pos", True):
                    continue
                if mode in ONLINE_FULFILLMENT and not offer.get("applies_to_online", True):
                    continue
                discount_type = str(offer.get("discount_type") or "percent")
                discount_value = str(offer.get("discount_value") or "0")
                discount_amount = self._automation_discount_amount(
                    discount_type=discount_type,
                    discount_value=discount_value,
                    payable_total=display_payable,
                )
                automation_offers.append(
                    {
                        "code": None,
                        "name": offer.get("label") or offer.get("workflow_name") or "Offer",
                        "description": "",
                        "discount_type": discount_type,
                        "discount_value": discount_value,
                        "min_order_total": "0",
                        "max_discount_amount": None,
                        "discount_amount": str(discount_amount),
                        "applicable": discount_amount > 0,
                        "reason": "",
                        "remaining_to_unlock": "0",
                        "first_order_only": False,
                        "applies_to_pos": bool(offer.get("applies_to_pos", True)),
                        "applies_to_online": bool(offer.get("applies_to_online", True)),
                        "ends_at": None,
                        "source": "automation",
                        "workflow_id": offer.get("workflow_id"),
                        "label": offer.get("label"),
                    }
                )
            # Appoint automations surface as staff_hint — show them as POS chips too.
            for hint in outcome.get("staff_hints") or []:
                discount_type = str(hint.get("discount_type") or "percent")
                discount_value = str(hint.get("discount_value") or "0")
                discount_amount = self._automation_discount_amount(
                    discount_type=discount_type,
                    discount_value=discount_value,
                    payable_total=display_payable,
                )
                automation_offers.append(
                    {
                        "code": None,
                        "name": hint.get("label") or hint.get("workflow_name") or "Offer",
                        "description": str(hint.get("message") or ""),
                        "discount_type": discount_type,
                        "discount_value": discount_value,
                        "min_order_total": "0",
                        "max_discount_amount": None,
                        "discount_amount": str(discount_amount),
                        "applicable": discount_amount > 0,
                        "reason": "",
                        "remaining_to_unlock": "0",
                        "first_order_only": False,
                        "applies_to_pos": True,
                        "applies_to_online": True,
                        "ends_at": None,
                        "source": "automation",
                        "workflow_id": hint.get("workflow_id"),
                        "label": hint.get("label"),
                    }
                )
        except Exception:  # noqa: BLE001
            automation_offers = []
        return {
            "coupons": coupon_offers,
            "automations": automation_offers,
            "offers": [*automation_offers, *coupon_offers],
        }

    def match_automation_bill_discount(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
        fulfillment_mode: str,
        customer: Customer | None,
        bill_discount_type: str,
        bill_discount_value: Decimal | str | int | float,
    ) -> dict[str, Any] | None:
        """Return the matching automation offer, or None if the discount is not entitled."""
        dtype = str(bill_discount_type or "").strip().lower()
        if dtype not in {"percent", "amount"}:
            return None
        try:
            dvalue = Decimal(str(bill_discount_value or "0"))
        except Exception:  # noqa: BLE001
            return None
        if dvalue <= 0:
            return None
        payload = self.eligible_offers(
            tenant=tenant,
            business=business,
            lines=lines,
            fulfillment_mode=fulfillment_mode,
            customer=customer,
        )
        for offer in payload.get("automations") or []:
            if str(offer.get("discount_type") or "").strip().lower() != dtype:
                continue
            try:
                offer_value = Decimal(str(offer.get("discount_value") or "0"))
            except Exception:  # noqa: BLE001
                continue
            if offer_value != dvalue:
                continue
            if not offer.get("applicable", True):
                continue
            return offer
        return None

    def _payable_for_offers(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
    ) -> Decimal:
        if not lines:
            return Decimal("0.00")
        try:
            return self.totals_for_lines(tenant=tenant, business=business, lines=lines)["payable"]
        except (ValidationError, ShopProduct.DoesNotExist, KeyError, TypeError, ValueError):
            total = Decimal("0.00")
            for raw in lines:
                try:
                    qty = Decimal(str(raw.get("quantity") or "1"))
                    price = Decimal(str(raw.get("unit_price") or "0"))
                    if qty > 0 and price > 0:
                        total += (qty * price).quantize(Decimal("0.01"))
                except (TypeError, ValueError, ArithmeticError):
                    continue
            return total.quantize(Decimal("0.01"))

    def preview(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str,
        lines: list[dict[str, Any]],
        fulfillment_mode: str,
        customer: Customer | None = None,
    ) -> dict[str, Any]:
        if not lines:
            raise ValidationError({"lines": "Add items before applying a coupon."})
        totals = self.totals_for_lines(tenant=tenant, business=business, lines=lines)
        quoted = self.quote(
            tenant=tenant,
            business=business,
            code=code,
            merchandise_subtotal=totals["merchandise"],
            payable_total=totals["payable"],
            fulfillment_mode=fulfillment_mode,
            customer=customer,
        )
        coupon: ShopCoupon = quoted["coupon"]
        return {
            "valid": True,
            "code": coupon.code,
            "name": coupon.name,
            "description": coupon.description,
            "discount_type": coupon.discount_type,
            "discount_value": str(coupon.discount_value),
            "discount_amount": str(quoted["discount_amount"]),
            "min_order_total": str(coupon.min_order_total),
            "merchandise_subtotal": str(totals["merchandise"]),
            "payable_total": str(totals["payable"]),
        }

    @transaction.atomic
    def redeem(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        code: str,
        merchandise_subtotal: Decimal,
        customer: Customer | None,
        payable_total: Decimal | None = None,
    ) -> dict[str, Any]:
        coupon = (
            ShopCoupon.objects.select_for_update()
            .filter(tenant=tenant, business=business, code=normalize_coupon_code(code))
            .first()
        )
        quoted = self.quote(
            tenant=tenant,
            business=business,
            code=code,
            merchandise_subtotal=merchandise_subtotal,
            payable_total=payable_total,
            fulfillment_mode=order.fulfillment_mode,
            customer=customer,
            coupon=coupon,
            exclude_order_id=order.id,
        )
        locked: ShopCoupon = quoted["coupon"]
        ShopCouponRedemption.objects.create(
            tenant=tenant,
            business=business,
            coupon=locked,
            order=order,
            customer=customer,
            discount_amount=quoted["discount_amount"],
        )
        locked.redemption_count = int(locked.redemption_count or 0) + 1
        locked.save(update_fields=["redemption_count", "updated_at", "version"])
        return quoted

    def release_for_order(self, *, order: ShopOrder) -> None:
        redemption = (
            ShopCouponRedemption.objects.filter(order=order).select_related("coupon").first()
        )
        if redemption is None:
            return
        coupon = redemption.coupon
        redemption.delete()
        if coupon.redemption_count > 0:
            coupon.redemption_count -= 1
            coupon.save(update_fields=["redemption_count", "updated_at", "version"])
