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
        if mode not in ONLINE_FULFILLMENT:
            raise ValidationError(
                {"coupon_code": "Coupons apply to online pickup and delivery orders only."}
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
    ) -> dict[str, Any]:
        now = timezone.now()
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
    ) -> list[dict[str, Any]]:
        mode = (fulfillment_mode or "").strip().lower() or FulfillmentMode.PICKUP
        if mode not in ONLINE_FULFILLMENT:
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
                    "ends_at": coupon.ends_at.isoformat() if coupon.ends_at else None,
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
