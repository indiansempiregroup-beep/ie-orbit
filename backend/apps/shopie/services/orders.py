from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.customers.services.contact import format_contact_phone, resolve_customer_phone
from apps.shopie.models import (
    DiscountType,
    FulfillmentMode,
    InvoiceStatus,
    OrderStatus,
    QuotationStatus,
    ShopInvoice,
    ShopOrder,
    ShopOrderLine,
    ShopProduct,
    ShopQuotation,
    StockMovementType,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.coupons import CouponService
from apps.shopie.services.fulfillment import FulfillmentService
from apps.shopie.services.zones import DeliveryZoneService

logger = logging.getLogger("ie_orbit.shopie.orders")
from apps.tenancy.models import Tenant

DELIVERY_METHOD_STANDARD = "standard"
DELIVERY_METHOD_INSTANT = "instant"
DELIVERY_METHODS = {DELIVERY_METHOD_STANDARD, DELIVERY_METHOD_INSTANT}


class OrderService:
    catalog = CatalogService()
    zones = DeliveryZoneService()

    @staticmethod
    def _default_customer_address(customer: Customer):
        """Default (or oldest) address from customer details — used for POS bills."""
        return (
            customer.addresses.filter(is_default=True).first()
            or customer.addresses.order_by("created_at").first()
        )

    def list_orders(
        self,
        *,
        tenant: Tenant,
        business: Business,
        status: str | None = None,
        customer_id: UUID | None = None,
    ) -> QuerySet[ShopOrder]:
        qs = (
            ShopOrder.objects.filter(tenant=tenant, business=business)
            .select_related("customer", "business")
            .prefetch_related("lines__product")
            .order_by("-created_at")
        )
        if status:
            qs = qs.filter(status=status)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    def get_order(self, *, tenant: Tenant, business: Business, order_id: UUID) -> ShopOrder:
        return (
            ShopOrder.objects.filter(tenant=tenant, business=business, id=order_id)
            .select_related("customer", "business")
            .prefetch_related("lines__product")
            .get()
        )

    @staticmethod
    def _apply_discount(*, gross: Decimal, discount_type: str, discount_value: Decimal) -> Decimal:
        dtype = (discount_type or "").strip().lower()
        value = Decimal(str(discount_value or "0"))
        if value < 0:
            raise ValidationError({"discount": "Discount cannot be negative."})
        if not dtype or value == 0:
            return Decimal("0.00")
        if dtype == "percent":
            if value > Decimal("100"):
                raise ValidationError({"discount": "Percent discount cannot exceed 100."})
            return (gross * value / Decimal("100")).quantize(Decimal("0.01"))
        if dtype == "amount":
            return min(gross, value).quantize(Decimal("0.01"))
        raise ValidationError({"discount": "discount_type must be percent or amount."})

    @staticmethod
    def _resolve_pos_payment_split(
        *,
        order_total: Decimal,
        payment_method: str,
        fulfillment_mode: str,
        amount_paid: Decimal | str | int | float | None,
        customer,
    ) -> tuple[Decimal, Decimal, str]:
        """Return (amount_paid, amount_due, payment_status) for POS / till checkout."""
        total = Decimal(str(order_total or "0")).quantize(Decimal("0.01"))
        payment = str(payment_method or "").strip().lower()
        mode = str(fulfillment_mode or "").strip().lower()

        # Online gateways collect later — ignore till amount_paid.
        if payment in {"razorpay", "cashfree"}:
            return Decimal("0.00"), total, "due"

        if payment == "borrow":
            default_paid = Decimal("0.00")
        elif mode == FulfillmentMode.POS and payment in {"cash", "upi", "card"}:
            default_paid = total
        else:
            default_paid = Decimal("0.00")

        if amount_paid is None or amount_paid == "":
            paid = default_paid
        else:
            paid = Decimal(str(amount_paid)).quantize(Decimal("0.01"))
        if paid < 0:
            raise ValidationError({"amount_paid": "Amount paid cannot be negative."})
        if paid > total:
            raise ValidationError({"amount_paid": "Amount paid cannot exceed the bill total."})

        due = (total - paid).quantize(Decimal("0.01"))
        if due > 0 and customer is None:
            raise ValidationError(
                {
                    "customer_id": (
                        "Select a customer when the bill is not fully paid "
                        "(partial payment or credit)."
                    )
                }
            )
        if due <= 0:
            return paid, Decimal("0.00"), "paid"
        if paid > 0:
            return paid, due, "partially_paid"
        return paid, due, "due"

    @transaction.atomic
    def create_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
        customer: Customer | None = None,
        fulfillment_mode: str = FulfillmentMode.PICKUP,
        notes: str = "",
        delivery_address: str = "",
        delivery_city: str = "",
        delivery_state: str = "",
        delivery_postal_code: str = "",
        delivery_latitude: Decimal | str | float | None = None,
        delivery_longitude: Decimal | str | float | None = None,
        delivery_method: str = "",
        delivery_quote_id: str = "",
        displayed_delivery_fee: Decimal | str | float | None = None,
        confirm: bool = False,
        bill_discount_type: str = "",
        bill_discount_value: Decimal | str | int | float = "0",
        payment_method: str = "",
        amount_paid: Decimal | str | int | float | None = None,
        coupon_code: str = "",
        points_to_redeem: int = 0,
        metadata_extra: dict[str, Any] | None = None,
        delivery_address_line2: str = "",
        delivery_phone: str = "",
        upi_utr: str = "",
        payment_proof_url: str = "",
    ) -> ShopOrder:
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})

        mode = fulfillment_mode or FulfillmentMode.PICKUP
        metadata: dict[str, Any] = dict(metadata_extra or {})
        live_delivery_enabled = False
        selected_delivery_method = str(delivery_method or "").strip().lower()
        delivery_contact_phone = format_contact_phone(delivery_phone)
        if not delivery_contact_phone and customer is not None:
            delivery_contact_phone = resolve_customer_phone(customer)

        # POS bills use the address on customer details (default), not online/map
        # checkout addresses. Online delivery keeps the selected delivery address.
        if mode == FulfillmentMode.POS and customer is not None:
            default_addr = self._default_customer_address(customer)
            if default_addr is not None:
                delivery_address = str(default_addr.line1 or "").strip()
                delivery_address_line2 = str(default_addr.line2 or "").strip()
                delivery_city = str(default_addr.city or "").strip()
                delivery_state = str(default_addr.state or "").strip()
                delivery_postal_code = str(default_addr.postal_code or "").strip()
                if delivery_city:
                    metadata["delivery_city"] = delivery_city
                if delivery_state:
                    metadata["delivery_state"] = delivery_state
                if delivery_postal_code:
                    metadata["delivery_postal_code"] = delivery_postal_code
                if delivery_address_line2:
                    metadata["delivery_address_line2"] = delivery_address_line2

        if mode == FulfillmentMode.DELIVERY:
            from apps.shopie.services.delivery import DeliveryService

            if not delivery_contact_phone:
                raise ValidationError(
                    {
                        "delivery_phone": (
                            "A valid delivery phone number is required for this address."
                        )
                    }
                )
            delivery_service = DeliveryService()
            live_delivery_enabled = delivery_service.ensure_settings(
                tenant=tenant, business=business
            ).instant_delivery_enabled
            # Preserve existing API behavior for callers that predate an explicit
            # delivery method, while allowing customers to choose standard delivery.
            if not selected_delivery_method:
                selected_delivery_method = (
                    DELIVERY_METHOD_INSTANT
                    if live_delivery_enabled
                    else DELIVERY_METHOD_STANDARD
                )
            if selected_delivery_method not in DELIVERY_METHODS:
                raise ValidationError(
                    {"delivery_method": "Choose standard or instant delivery."}
                )
            metadata["delivery_method"] = selected_delivery_method
            if delivery_city:
                metadata["delivery_city"] = str(delivery_city).strip()
            if delivery_state:
                metadata["delivery_state"] = str(delivery_state).strip()
            if delivery_postal_code:
                metadata["delivery_postal_code"] = str(delivery_postal_code).strip()
            door_detail = str(delivery_address_line2 or "").strip()
            if door_detail:
                metadata["delivery_address_line2"] = door_detail
            if delivery_latitude not in (None, ""):
                metadata["delivery_latitude"] = str(delivery_latitude)
            if delivery_longitude not in (None, ""):
                metadata["delivery_longitude"] = str(delivery_longitude)
            metadata["delivery_contact_phone"] = delivery_contact_phone
            if selected_delivery_method == DELIVERY_METHOD_INSTANT:
                if not live_delivery_enabled:
                    raise ValidationError(
                        {"delivery": "Instant delivery is not enabled for this shop."}
                    )
                zone = self.zones.match_zone(
                    tenant=tenant,
                    business=business,
                    city=delivery_city,
                    postal_code=delivery_postal_code,
                )
                if zone is None:
                    raise ValidationError(
                        {"delivery": "Delivery is not available for this city/postal code."}
                    )
                if not zone.instant_delivery_enabled:
                    raise ValidationError(
                        {"delivery": "Instant delivery is not available in this delivery zone."}
                    )
                if delivery_latitude in (None, "") or delivery_longitude in (None, ""):
                    raise ValidationError(
                        {"delivery_address": "Select a mapped address for instant delivery."}
                    )
                metadata["delivery_zone_id"] = str(zone.id)
                metadata["delivery_zone_name"] = zone.name
            else:
                zone = self.zones.match_zone(
                    tenant=tenant,
                    business=business,
                    city=delivery_city,
                    postal_code=delivery_postal_code,
                )
                if zone is None:
                    raise ValidationError(
                        {"delivery": "Delivery is not available for this city/postal code."}
                    )
                metadata["delivery_zone_id"] = str(zone.id)
                metadata["delivery_zone_name"] = zone.name
                metadata["delivery_fee"] = str(zone.fee)
                metadata["same_day"] = zone.same_day
                min_order = Decimal(str(zone.min_order_total or "0"))
                if min_order > 0 and lines:
                    preview_subtotal = Decimal("0.00")
                    product_ids = [raw["product_id"] for raw in lines if raw.get("product_id")]
                    products = {
                        str(product.id): product
                        for product in ShopProduct.objects.filter(
                            tenant=tenant,
                            business=business,
                            id__in=product_ids,
                        )
                    }
                    for raw in lines:
                        product = products.get(str(raw.get("product_id")))
                        if product is None:
                            continue
                        qty = Decimal(str(raw.get("quantity") or "1"))
                        unit_price = Decimal(
                            str(
                                raw.get("unit_price")
                                if raw.get("unit_price") is not None
                                else product.price
                            )
                        )
                        preview_subtotal += (unit_price * qty).quantize(Decimal("0.01"))
                    if preview_subtotal < min_order:
                        raise ValidationError(
                            {
                                "delivery": (
                                    f"Minimum order for this delivery zone is {min_order}. "
                                    f"Your cart subtotal is {preview_subtotal}."
                                )
                            }
                        )
                from apps.shopie.services.delivery_promise import compute_delivery_promise
                from apps.shopie.models import ShopBusinessSettings

                shop_settings = ShopBusinessSettings.objects.filter(
                    tenant=tenant,
                    business=business,
                ).first()
                metadata["delivery_promise"] = compute_delivery_promise(
                    zone=zone,
                    settings=shop_settings,
                )

        payment = str(payment_method or "").strip().lower()
        if payment in {"cod", "qr"}:
            payment = "cash" if payment == "cod" else "upi"
        if payment == "borrow" and customer is None:
            raise ValidationError(
                {"customer_id": "Select a customer for borrow / credit bills."}
            )
        if payment == "razorpay":
            from apps.shopie.services.merchant_payments import MerchantPaymentService

            merchant_payments = MerchantPaymentService()
            availability = merchant_payments.availability(business=business)
            if not availability["available"]:
                raise ValidationError(
                    {
                        "payment_method": (
                            "Razorpay is disabled by the platform admin or is not included "
                            "in this plan."
                        )
                    }
                )
            if not availability["enabled"]:
                raise ValidationError(
                    {"payment_method": "Razorpay is disabled in business payment settings."}
                )
            provider = merchant_payments.public_settings(business=business)
            if not provider["configured"]:
                raise ValidationError(
                    {"payment_method": "Connect this business's Razorpay account first."}
                )
            if not provider["connected"]:
                raise ValidationError(
                    {"payment_method": "Test and verify the saved Razorpay credentials first."}
                )
        if payment == "cashfree":
            from apps.shopie.services.merchant_payments import MerchantPaymentService

            merchant_payments = MerchantPaymentService()
            availability = merchant_payments.cashfree_availability(business=business)
            if not availability["available"]:
                raise ValidationError(
                    {
                        "payment_method": (
                            "Cashfree is disabled by the platform admin or is not included "
                            "in this plan."
                        )
                    }
                )
            if not availability["enabled"]:
                raise ValidationError(
                    {"payment_method": "Cashfree is disabled in business payment settings."}
                )
            provider = merchant_payments.cashfree_public_settings(business=business)
            if not provider["configured"]:
                raise ValidationError(
                    {"payment_method": "Connect this business's Cashfree account first."}
                )
            if not provider["connected"]:
                raise ValidationError(
                    {"payment_method": "Test and verify the saved Cashfree credentials first."}
                )
        if payment == "cash" and mode in {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}:
            from apps.shopie.services.merchant_payments import MerchantPaymentService

            shop_settings = MerchantPaymentService().ensure_settings(business=business)
            if not shop_settings.cod_enabled:
                raise ValidationError(
                    {
                        "payment_method": (
                            "Cash on delivery is not available for this shop. Pay with UPI instead."
                        )
                    }
                )
        bill_dtype = str(bill_discount_type or "").strip().lower()
        bill_dvalue = Decimal(str(bill_discount_value or "0"))
        coupon_code = str(coupon_code or "").strip()
        if coupon_code and bill_dtype:
            raise ValidationError(
                {"coupon_code": "Cannot combine a coupon with a bill discount."}
            )
        # Initial status before totals exist; finalized below once order.total is known.
        if payment in {"borrow", "razorpay", "cashfree"}:
            payment_status = "due"
        elif mode == FulfillmentMode.POS and payment in {"cash", "upi", "card"}:
            payment_status = "paid"
        else:
            payment_status = "due" if payment else ""
        metadata["pos"] = {
            **(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}),
            "payment_method": payment,
            "payment_status": payment_status,
            "bill_discount_type": bill_dtype,
            "bill_discount_value": str(bill_dvalue),
        }

        order = ShopOrder.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            order_number=self._next_number(business=business, prefix="SO"),
            status=OrderStatus.PENDING,
            fulfillment_mode=mode,
            currency=business.currency or "INR",
            notes=notes or "",
            delivery_address=delivery_address or "",
            metadata=metadata,
        )
        if mode == FulfillmentMode.DELIVERY:
            from apps.shopie.services.tracking import TrackingHistoryService

            TrackingHistoryService().record_order_status(
                order=order,
                status=OrderStatus.PENDING,
                occurred_at=order.created_at,
            )

        merchandise_subtotal = Decimal("0.00")
        line_discount_total = Decimal("0.00")
        weighted_tax = Decimal("0.00")
        built_lines: list[ShopOrderLine] = []

        for raw in lines:
            product = ShopProduct.objects.select_for_update().get(
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
            line_discount = self._apply_discount(
                gross=line_gross,
                discount_type=str(raw.get("discount_type") or ""),
                discount_value=Decimal(str(raw.get("discount_value") or "0")),
            )
            after_discount = (line_gross - line_discount).quantize(Decimal("0.01"))
            if tax_inclusive and tax_rate > 0:
                line_subtotal = (after_discount * Decimal("100") / (Decimal("100") + tax_rate)).quantize(
                    Decimal("0.01")
                )
                line_tax = (after_discount - line_subtotal).quantize(Decimal("0.01"))
                line_total = after_discount
            else:
                line_subtotal = after_discount
                line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
                line_total = line_subtotal + line_tax
            built_lines.append(
                ShopOrderLine(
                    tenant=tenant,
                    business=business,
                    order=order,
                    product=product,
                    product_name=product.name,
                    barcode_scanned=str(raw.get("barcode_scanned") or ""),
                    quantity=qty,
                    unit_price=unit_price,
                    tax_rate=tax_rate,
                    discount_type=str(raw.get("discount_type") or "").strip().lower(),
                    discount_value=Decimal(str(raw.get("discount_value") or "0")),
                    discount_amount=line_discount,
                    line_subtotal=line_subtotal,
                    line_tax=line_tax,
                    line_total=line_total,
                )
            )
            merchandise_subtotal += line_subtotal
            line_discount_total += line_discount
            weighted_tax += line_tax

        quoted_coupon: dict[str, Any] | None = None
        payable_total = sum((line.line_total for line in built_lines), Decimal("0.00")).quantize(
            Decimal("0.01")
        )
        if coupon_code:
            quoted_coupon = CouponService().quote(
                tenant=tenant,
                business=business,
                code=coupon_code,
                merchandise_subtotal=merchandise_subtotal,
                payable_total=payable_total,
                fulfillment_mode=mode,
                customer=customer,
                exclude_order_id=order.id,
            )
            # Coupons quote payable (shelf) savings — apply that amount on payable.
            bill_dtype = DiscountType.AMOUNT
            bill_dvalue = Decimal(str(quoted_coupon["discount_amount"]))

        # Bill % / ₹ off and coupons reduce what the customer pays (line totals),
        # then GST is re-extracted so tax-inclusive prices stay exact
        # (e.g. ₹100 incl. @ 15% → save ₹15.00 / pay ₹85.00, not ₹14.99 / ₹85.01).
        bill_discount = self._apply_discount(
            gross=payable_total,
            discount_type=bill_dtype,
            discount_value=bill_dvalue,
        )
        loyalty_snapshot = self._redeem_loyalty_on_create(
            tenant=tenant,
            business=business,
            order=order,
            customer=customer,
            eligible_amount=(payable_total - bill_discount).quantize(Decimal("0.01")),
            points_to_redeem=points_to_redeem,
        )
        if loyalty_snapshot is not None:
            bill_discount = (
                bill_discount + Decimal(str(loyalty_snapshot["discount_amount"]))
            ).quantize(Decimal("0.01"))
        # Allocate payable discount across lines; re-split GST from each discounted total.
        if bill_discount > 0 and payable_total > 0:
            remaining_discount = bill_discount
            tax_total = Decimal("0.00")
            for index, line in enumerate(built_lines):
                if index == len(built_lines) - 1:
                    share = remaining_discount
                else:
                    share = (bill_discount * line.line_total / payable_total).quantize(
                        Decimal("0.01")
                    )
                    remaining_discount -= share
                new_total = (line.line_total - share).quantize(Decimal("0.01"))
                if new_total < 0:
                    new_total = Decimal("0.00")
                if line.tax_rate > 0:
                    line.line_subtotal = (
                        new_total * Decimal("100") / (Decimal("100") + line.tax_rate)
                    ).quantize(Decimal("0.01"))
                    line.line_tax = (new_total - line.line_subtotal).quantize(Decimal("0.01"))
                else:
                    line.line_subtotal = new_total
                    line.line_tax = Decimal("0.00")
                line.line_total = new_total
                tax_total += line.line_tax
            subtotal = sum((line.line_subtotal for line in built_lines), Decimal("0.00")).quantize(
                Decimal("0.01")
            )
        else:
            bill_discount = Decimal("0.00")
            subtotal = merchandise_subtotal
            tax_total = weighted_tax

        ShopOrderLine.objects.bulk_create(built_lines)

        source_office = FulfillmentService().select_source_office(
            tenant=tenant,
            business=business,
            lines=built_lines,
            drop_latitude=delivery_latitude,
            drop_longitude=delivery_longitude,
        )
        if source_office is not None:
            metadata["fulfillment"] = source_office.as_metadata()

        if (
            mode == FulfillmentMode.DELIVERY
            and selected_delivery_method == DELIVERY_METHOD_INSTANT
        ):
            from apps.shopie.services.delivery import DeliveryService

            customer_name = (
                str(getattr(customer, "display_name", "") or "") if customer is not None else ""
            )
            customer_phone = delivery_contact_phone
            quoted = DeliveryService().quote(
                tenant=tenant,
                business=business,
                drop={
                    "latitude": delivery_latitude,
                    "longitude": delivery_longitude,
                    "address": delivery_address,
                    "address_2": str(delivery_address_line2 or "").strip(),
                    "city": delivery_city,
                    "state": delivery_state,
                    "postal_code": delivery_postal_code,
                    "contact": {"name": customer_name, "phone": customer_phone},
                },
                subtotal=subtotal,
                customer_name=customer_name,
                customer_phone=customer_phone,
                branch=source_office.branch if source_office else None,
                pickup_source=source_office.location if source_office else None,
            )
            if not quoted.get("available"):
                raise ValidationError({"delivery": "Instant delivery is unavailable."})
            delivery_fee = Decimal(str(quoted["customer_fee"]))
            if displayed_delivery_fee is not None:
                displayed = Decimal(str(displayed_delivery_fee))
                tolerance = max(Decimal("5.00"), displayed * Decimal("0.10"))
                if abs(delivery_fee - displayed) > tolerance:
                    raise ValidationError(
                        {
                            "delivery_fee": (
                                "The live delivery fee changed. Refresh the quote before ordering."
                            )
                        }
                    )
            metadata["delivery_fee"] = str(delivery_fee)
            metadata["same_day"] = True
            metadata["delivery"] = {
                **quoted,
                "quote_id": quoted.get("quote_id") or delivery_quote_id,
                "partner_status": "packing",
                "events": [
                    {
                        "status": "packing",
                        "label": "Order placed",
                        "occurred_at": timezone.now().isoformat(),
                    }
                ],
            }
        else:
            delivery_fee = Decimal(str(metadata.get("delivery_fee") or "0"))
        order.subtotal = subtotal
        order.discount_total = (line_discount_total + bill_discount).quantize(Decimal("0.01"))
        order.tax_total = tax_total
        order.total = (subtotal + tax_total + delivery_fee).quantize(Decimal("0.01"))
        award_loyalty_points = metadata.pop("award_loyalty_points", True)
        if not isinstance(award_loyalty_points, bool):
            award_loyalty_points = bool(award_loyalty_points)
        points_to_earn = 0
        if award_loyalty_points and customer is not None:
            try:
                from apps.customers.services.loyalty import LoyaltyService

                points_to_earn = int(
                    LoyaltyService().earn_points_for_spend(
                        business=business,
                        amount=order.total,
                    )
                    or 0
                )
            except Exception:
                points_to_earn = 0
        # When a coupon is applied it is the bill-level reduction. Keep it out of
        # pos.bill_discount_* so invoices do not show bill + coupon for the same ₹.
        loyalty_discount_part = (
            Decimal(str(loyalty_snapshot["discount_amount"]))
            if loyalty_snapshot is not None
            else Decimal("0.00")
        )
        coupon_applied = (
            (bill_discount - loyalty_discount_part).quantize(Decimal("0.01"))
            if quoted_coupon is not None
            else Decimal("0.00")
        )
        if coupon_applied < 0:
            coupon_applied = Decimal("0.00")
        manual_bill_discount = (
            Decimal("0.00")
            if quoted_coupon is not None
            else max(Decimal("0.00"), (bill_discount - loyalty_discount_part).quantize(Decimal("0.01")))
        )
        pos_meta = {
            **metadata.get("pos", {}),
            "line_discount_total": str(line_discount_total),
            "bill_discount_type": "" if quoted_coupon is not None else bill_dtype,
            "bill_discount_value": "0" if quoted_coupon is not None else str(bill_dvalue),
            "bill_discount_amount": str(manual_bill_discount),
            "award_loyalty_points": award_loyalty_points,
            "points_to_earn": points_to_earn,
        }
        if quoted_coupon is not None:
            coupon = quoted_coupon["coupon"]
            metadata["coupon"] = {
                "id": str(coupon.id),
                "code": coupon.code,
                "name": coupon.name,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "discount_amount": str(coupon_applied or quoted_coupon["discount_amount"]),
            }
        if loyalty_snapshot is not None:
            metadata["loyalty"] = loyalty_snapshot
        from apps.shopie.services.gst import resolve_sale_supply, split_stored_tax_total

        customer_gstin = str(
            metadata.get("customer_gstin")
            or (getattr(customer, "gstin", None) if customer is not None else "")
            or ""
        ).strip().upper()
        supply = resolve_sale_supply(
            business=business,
            customer_gstin=customer_gstin,
            delivery_state=str(metadata.get("delivery_state") or delivery_state or ""),
        )
        tax_split = split_stored_tax_total(tax_total, interstate=supply["is_interstate"])
        metadata["gst"] = {
            **supply,
            "taxable_value": str(subtotal),
            "cgst_total": str(tax_split["cgst"]),
            "sgst_total": str(tax_split["sgst"]),
            "igst_total": str(tax_split["igst"]),
            "tax_total": str(tax_total),
        }
        if supply["customer_gstin"]:
            metadata["customer_gstin"] = supply["customer_gstin"]
        paid_now = Decimal("0.00")
        due_now = Decimal("0.00")
        if payment in {"borrow", "cash", "upi", "card", "razorpay", "cashfree"}:
            paid_now, due_now, pay_status = self._resolve_pos_payment_split(
                order_total=order.total,
                payment_method=payment,
                fulfillment_mode=mode,
                amount_paid=amount_paid,
                customer=customer,
            )
            pos_meta["amount_paid"] = str(paid_now)
            pos_meta["amount_due"] = str(due_now)
            pos_meta["payment_status"] = pay_status

        # Online UPI: require a payment screenshot or UTR/reference before accepting the order.
        if payment == "upi" and mode in {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}:
            proof = str(payment_proof_url or "").strip()
            utr = str(upi_utr or "").strip()
            if not proof and not utr:
                raise ValidationError(
                    {
                        "payment_proof_url": (
                            "Upload a payment screenshot or enter a UPI / UTR reference."
                        )
                    }
                )
            pos_meta["payment_method"] = "upi"
            pos_meta["payment_status"] = "awaiting_confirmation"
            if proof:
                from apps.billing.services.upi_proof import resolve_payment_proof_url

                stored_proof, media_id = resolve_payment_proof_url(payment_proof_url=proof)
                pos_meta["payment_proof_url"] = stored_proof or proof
                if media_id:
                    pos_meta["payment_proof_media_id"] = media_id
            if utr:
                pos_meta["upi_utr"] = utr
            pos_meta["claimed_at"] = timezone.now().isoformat()
            # Keep full amount due until the shop confirms; do not open borrow yet.
            paid_now = Decimal("0.00")
            due_now = Decimal(str(order.total or "0")).quantize(Decimal("0.01"))
            pos_meta["amount_paid"] = "0.00"
            pos_meta["amount_due"] = str(due_now)

        order.metadata = {
            **metadata,
            "pos": pos_meta,
        }
        order.save(
            update_fields=[
                "subtotal",
                "discount_total",
                "tax_total",
                "total",
                "metadata",
                "updated_at",
                "version",
            ]
        )

        if quoted_coupon is not None:
            CouponService().redeem(
                tenant=tenant,
                business=business,
                order=order,
                code=coupon_code,
                merchandise_subtotal=merchandise_subtotal,
                payable_total=payable_total,
                customer=customer,
            )

        if (
            due_now > 0
            and customer is not None
            and payment in {"borrow", "cash", "upi", "card"}
            and str(pos_meta.get("payment_status") or "").strip().lower() != "awaiting_confirmation"
        ):
            from apps.customers.services.borrow import BorrowService

            BorrowService().charge_from_order(
                tenant=tenant,
                business=business,
                customer=customer,
                order_id=order.id,
                order_number=order.order_number,
                amount=due_now,
                currency=order.currency or getattr(business, "currency", "") or "INR",
            )

        if confirm:
            order = self.transition(
                tenant=tenant,
                business=business,
                order=order,
                status=OrderStatus.CONFIRMED,
            )
            if mode == FulfillmentMode.POS:
                # Every confirmed Sale (POS) bill posts a Books sale invoice/voucher.
                refreshed = self.get_order(tenant=tenant, business=business, order_id=order.id)
                self._post_order_to_books(tenant=tenant, business=business, order=refreshed)
                self._maybe_award_referral_on_paid(order=refreshed)
                self._maybe_award_loyalty_on_paid(order=refreshed)
                # Fully collected till sales are done at the counter — not "preparing pickup".
                pos_meta = (refreshed.metadata or {}).get("pos") or {}
                pay_status = str(pos_meta.get("payment_status") or "").strip().lower()
                due = Decimal(str(pos_meta.get("amount_due") or "0"))
                if pay_status in {"paid", "settled"} or due <= 0:
                    refreshed = self.transition(
                        tenant=tenant,
                        business=business,
                        order=refreshed,
                        status=OrderStatus.COMPLETED,
                        notify=False,
                    )
                return refreshed
        order = self.get_order(tenant=tenant, business=business, order_id=order.id)
        self._maybe_award_referral_on_paid(order=order)
        self._maybe_award_loyalty_on_paid(order=order)
        if not confirm:
            self._notify_online(order, OrderStatus.PENDING)
        return order

    @transaction.atomic
    def transition(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        status: str,
        notify: bool = True,
    ) -> ShopOrder:
        allowed = {
            OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
            OrderStatus.CONFIRMED: {
                OrderStatus.READY,
                OrderStatus.COMPLETED,
                OrderStatus.CANCELLED,
            },
            OrderStatus.READY: {
                OrderStatus.OUT_FOR_DELIVERY,
                OrderStatus.DELIVERY_FAILED,
                OrderStatus.COMPLETED,
                OrderStatus.CANCELLED,
            },
            OrderStatus.OUT_FOR_DELIVERY: {
                OrderStatus.COMPLETED,
                OrderStatus.DELIVERY_FAILED,
            },
            # A failed rider trip is recoverable: the shop can re-dispatch,
            # hand over itself, or cancel and refund.
            OrderStatus.DELIVERY_FAILED: {
                OrderStatus.READY,
                OrderStatus.OUT_FOR_DELIVERY,
                OrderStatus.COMPLETED,
                OrderStatus.CANCELLED,
            },
            OrderStatus.COMPLETED: set(),
            OrderStatus.CANCELLED: set(),
        }
        if status not in allowed.get(order.status, set()):
            raise ValidationError({"status": f"Cannot move from {order.status} to {status}."})

        previous = order.status
        order.status = status
        order.save(update_fields=["status", "updated_at", "version"])
        if order.fulfillment_mode == FulfillmentMode.DELIVERY:
            from apps.shopie.services.tracking import TrackingHistoryService

            TrackingHistoryService().record_order_status(
                order=order,
                status=status,
                occurred_at=order.updated_at,
            )

        if status == OrderStatus.CANCELLED:
            CouponService().release_for_order(order=order)
            self._refund_loyalty_on_cancel(order=order)

        source_godown_id = (
            (order.metadata or {}).get("fulfillment", {}).get("godown_id")
            if isinstance(order.metadata, dict)
            else None
        )
        if status == OrderStatus.CONFIRMED and previous == OrderStatus.PENDING:
            for line in order.lines.select_related("product"):
                self.catalog.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=line.product,
                    quantity_delta=-line.quantity,
                    movement_type=StockMovementType.SALE,
                    reason=f"Order {order.order_number}",
                    order=order,
                    godown_id=source_godown_id,
                    # The source office may be short on part of the cart; the gap is
                    # recorded as backorder on the order rather than blocking the sale.
                    allow_backorder=True,
                )
        if status == OrderStatus.CANCELLED and previous in {
            OrderStatus.CONFIRMED,
            OrderStatus.READY,
            OrderStatus.DELIVERY_FAILED,
        }:
            for line in order.lines.select_related("product"):
                self.catalog.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=line.product,
                    quantity_delta=line.quantity,
                    movement_type=StockMovementType.RETURN,
                    reason=f"Cancel {order.order_number}",
                    order=order,
                    godown_id=source_godown_id,
                )
        refreshed = self.get_order(tenant=tenant, business=business, order_id=order.id)
        if status == OrderStatus.COMPLETED:
            refreshed = self._sync_shipment_delivered(order=refreshed)
            refreshed = self._maybe_auto_mark_cash_paid(
                tenant=tenant,
                business=business,
                order=refreshed,
            )
        if status in {OrderStatus.CONFIRMED, OrderStatus.COMPLETED}:
            self._post_order_to_books(tenant=tenant, business=business, order=refreshed)
        if notify:
            self._notify_online(refreshed, status)
        return refreshed

    def _sync_shipment_delivered(self, *, order: ShopOrder) -> ShopOrder:
        """Keep courier shipment metadata in sync when ops marks the order delivered."""
        if order.fulfillment_mode != FulfillmentMode.DELIVERY:
            return order
        from apps.shopie.models import ShipmentStatus
        from apps.shopie.services.shipment import ShipmentService

        shipment_svc = ShipmentService()
        shipment = shipment_svc.get_shipment(order=order)
        if shipment is None or shipment.status == ShipmentStatus.DELIVERED:
            return order
        try:
            shipment_svc.update_milestone(
                order=order,
                status=ShipmentStatus.DELIVERED,
                notify_customer=False,
            )
        except ValidationError:
            return order
        return self.get_order(tenant=order.tenant, business=order.business, order_id=order.id)

    @transaction.atomic
    def _maybe_auto_mark_cash_paid(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
    ) -> ShopOrder:
        if order.fulfillment_mode not in {FulfillmentMode.PICKUP, FulfillmentMode.DELIVERY}:
            return order
        locked = (
            ShopOrder.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=order.id)
            .first()
        )
        if locked is None:
            return order
        metadata = dict(locked.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        method = str(pos.get("payment_method") or "").strip().lower()
        status_value = str(pos.get("payment_status") or "").strip().lower()
        if method != "cash" or status_value in {"paid", "settled"}:
            return self.get_order(tenant=tenant, business=business, order_id=locked.id)
        pos.update(
            {
                "payment_status": "paid",
                "amount_paid": str(locked.total),
                "amount_due": "0.00",
                "confirmed_at": timezone.now().isoformat(),
            }
        )
        metadata["pos"] = pos
        locked.metadata = metadata
        locked.save(update_fields=["metadata", "updated_at", "version"])
        refreshed = self.get_order(tenant=tenant, business=business, order_id=locked.id)
        self._maybe_award_referral_on_paid(order=refreshed)
        self._maybe_award_loyalty_on_paid(order=refreshed)
        return refreshed

    def _notify_online(self, order: ShopOrder, status: str) -> None:
        order_id = str(order.id)
        status_value = str(status)
        tenant_id = str(order.tenant_id)
        business_id = str(order.business_id)

        def enqueue() -> None:
            from apps.notifications.tasks import process_online_order_notification_task

            try:
                process_online_order_notification_task.delay(
                    order_id,
                    status_value,
                    tenant_id,
                    business_id,
                )
            except Exception:
                logger.exception(
                    "Failed to enqueue online order notification; running inline",
                    extra={
                        "order_id": order_id,
                        "status": status_value,
                        "tenant_id": tenant_id,
                        "business_id": business_id,
                    },
                )
                try:
                    process_online_order_notification_task(
                        order_id,
                        status_value,
                        tenant_id,
                        business_id,
                    )
                except Exception:
                    logger.exception(
                        "Inline online order notification failed",
                        extra={"order_id": order_id, "status": status_value},
                    )

        transaction.on_commit(enqueue)

    @transaction.atomic
    def settle_payment(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        settled_via: str = "cash",
    ) -> ShopOrder:
        """Record a customer borrow repayment for this bill's remaining due amount.

        Does not change order fulfillment status. Prefer recording payments on the customer.
        """
        locked = (
            ShopOrder.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=order.id)
            .first()
        )
        if locked is None:
            raise ValidationError({"order": "Order not found."})
        if locked.customer_id is None:
            raise ValidationError({"customer": "Borrow bills require a customer."})
        metadata = dict(locked.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        method = str(pos.get("payment_method") or "").strip().lower()
        if method != "borrow":
            raise ValidationError({"payment": "Only borrow bills can be settled this way."})
        due = Decimal(str(pos.get("amount_due") if pos.get("amount_due") is not None else locked.total))
        due = due.quantize(Decimal("0.01"))
        if due <= 0:
            return self.get_order(tenant=tenant, business=business, order_id=locked.id)

        from apps.customers.services.borrow import BorrowService

        BorrowService().record_payment(
            tenant=tenant,
            business=business,
            customer=locked.customer,
            amount=due,
            payment_method=settled_via,
            notes=f"Settlement for {locked.order_number}",
            order_id=locked.id,
        )
        return self.get_order(tenant=tenant, business=business, order_id=locked.id)

    @transaction.atomic
    def claim_payment(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        upi_utr: str,
        payment_proof_url: str = "",
    ) -> ShopOrder:
        locked = (
            ShopOrder.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=order.id)
            .first()
        )
        if locked is None:
            raise ValidationError({"order": "Order not found."})
        metadata = dict(locked.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        method = str(pos.get("payment_method") or "").strip().lower()
        status_value = str(pos.get("payment_status") or "").strip().lower()
        if method not in {"upi", "qr"}:
            raise ValidationError({"payment": "Only UPI / QR orders can claim payment."})
        if status_value in {"paid", "settled"}:
            raise ValidationError({"payment": "This order is already paid."})
        utr = str(upi_utr or "").strip()
        proof = str(payment_proof_url or "").strip()
        if len(utr) < 6 and not proof:
            raise ValidationError(
                {"upi_utr": "Enter a UPI / UTR reference or upload a payment screenshot."}
            )
        pos["payment_method"] = "upi"
        pos["payment_status"] = "awaiting_confirmation"
        if utr:
            pos["upi_utr"] = utr
        if proof:
            from apps.billing.services.upi_proof import resolve_payment_proof_url

            stored_proof, media_id = resolve_payment_proof_url(payment_proof_url=proof)
            pos["payment_proof_url"] = stored_proof or proof
            if media_id:
                pos["payment_proof_media_id"] = media_id
        pos["claimed_at"] = timezone.now().isoformat()
        metadata["pos"] = pos
        locked.metadata = metadata
        locked.save(update_fields=["metadata", "updated_at", "version"])
        return self.get_order(tenant=tenant, business=business, order_id=locked.id)

    @transaction.atomic
    def confirm_or_reject_payment(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        action: str,
        note: str = "",
    ) -> ShopOrder:
        locked = (
            ShopOrder.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=order.id)
            .first()
        )
        if locked is None:
            raise ValidationError({"order": "Order not found."})
        metadata = dict(locked.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        act = str(action or "").strip().lower()
        if act == "confirm":
            pos["payment_status"] = "paid"
            pos["amount_paid"] = str(locked.total)
            pos["amount_due"] = "0.00"
            pos["confirmed_at"] = timezone.now().isoformat()
            if note:
                pos["confirm_note"] = str(note).strip()
        elif act == "reject":
            pos["payment_status"] = "rejected"
            pos["rejected_at"] = timezone.now().isoformat()
            pos["reject_note"] = str(note or "").strip()
        else:
            raise ValidationError({"action": "action must be confirm or reject."})
        metadata["pos"] = pos
        locked.metadata = metadata
        locked.save(update_fields=["metadata", "updated_at", "version"])
        if act == "confirm":
            refreshed = self.get_order(tenant=tenant, business=business, order_id=locked.id)
            self._post_order_to_books(tenant=tenant, business=business, order=refreshed)
            self._maybe_award_referral_on_paid(order=refreshed)
            self._maybe_award_loyalty_on_paid(order=refreshed)
            return refreshed
        return self.get_order(tenant=tenant, business=business, order_id=locked.id)

    @transaction.atomic
    def mark_razorpay_paid(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        payment_id: str,
    ) -> ShopOrder:
        return self.mark_online_paid(
            tenant=tenant,
            business=business,
            order=order,
            payment_id=payment_id,
            payment_method="razorpay",
        )

    @transaction.atomic
    def mark_online_paid(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        payment_id: str,
        payment_method: str = "razorpay",
    ) -> ShopOrder:
        locked = (
            ShopOrder.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=order.id)
            .first()
        )
        if locked is None:
            raise ValidationError({"order": "Order not found."})
        metadata = dict(locked.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        method = str(payment_method or "razorpay").strip().lower()
        if str(pos.get("payment_method") or "").strip().lower() != method:
            raise ValidationError({"payment": f"This is not a {method} order."})
        if str(pos.get("payment_status") or "").strip().lower() in {"paid", "settled"}:
            return self.get_order(tenant=tenant, business=business, order_id=locked.id)

        pos.update(
            {
                "payment_status": "paid",
                "amount_paid": str(locked.total),
                "amount_due": "0.00",
                "confirmed_at": timezone.now().isoformat(),
            }
        )
        if method == "cashfree":
            pos["cashfree_payment_id"] = str(payment_id)
        else:
            pos["razorpay_payment_id"] = str(payment_id)
        metadata["pos"] = pos
        locked.metadata = metadata
        locked.save(update_fields=["metadata", "updated_at", "version"])
        refreshed = self.get_order(tenant=tenant, business=business, order_id=locked.id)
        self._post_order_to_books(tenant=tenant, business=business, order=refreshed)
        self._maybe_award_referral_on_paid(order=refreshed)
        self._maybe_award_loyalty_on_paid(order=refreshed)
        return refreshed

    def _redeem_loyalty_on_create(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        customer: Customer | None,
        eligible_amount: Decimal,
        points_to_redeem: int,
    ) -> dict[str, Any] | None:
        points = int(points_to_redeem or 0)
        if points <= 0:
            return None
        if customer is None:
            raise ValidationError(
                {"points_to_redeem": "Select a customer to redeem reward points."}
            )
        if eligible_amount < 0:
            eligible_amount = Decimal("0.00")
        from apps.customers.services.loyalty import LoyaltyService

        return LoyaltyService().redeem_for_order(
            tenant=tenant,
            business=business,
            customer=customer,
            order_id=order.id,
            amount=eligible_amount,
            points_to_redeem=points,
        )

    def _maybe_award_loyalty_on_paid(self, *, order: ShopOrder) -> None:
        if order.customer_id is None:
            return
        pos = (order.metadata or {}).get("pos") if isinstance(order.metadata, dict) else {}
        if isinstance(pos, dict) and pos.get("award_loyalty_points") is False:
            return
        status_value = str((pos or {}).get("payment_status") or "").strip().lower()
        if status_value not in {"paid", "settled"}:
            return
        try:
            from apps.customers.services.loyalty import LoyaltyService

            points = int(
                LoyaltyService().award_for_paid_order(
                    tenant=order.tenant,
                    business=order.business,
                    customer=order.customer,
                    order_id=order.id,
                    amount=order.total,
                    order_number=order.order_number,
                )
                or 0
            )
        except Exception:
            return
        if points <= 0:
            # Already awarded earlier — keep any stored earn figure / expected earn.
            meta = dict(order.metadata or {})
            loyalty = dict(meta.get("loyalty") or {}) if isinstance(meta.get("loyalty"), dict) else {}
            if int(loyalty.get("points_earned") or 0) > 0:
                return
            expected = int((pos or {}).get("points_to_earn") or 0)
            if expected <= 0:
                return
            points = expected
        meta = dict(order.metadata or {})
        loyalty = dict(meta.get("loyalty") or {}) if isinstance(meta.get("loyalty"), dict) else {}
        loyalty["points_earned"] = int(points)
        meta["loyalty"] = loyalty
        order.metadata = meta
        order.save(update_fields=["metadata", "updated_at", "version"])
        # Keep Books invoice summary in sync when the voucher was posted first.
        voucher_id = meta.get("books_voucher_id") or getattr(order, "books_voucher_id", None)
        if not voucher_id and isinstance(meta.get("books"), dict):
            voucher_id = meta["books"].get("voucher_id")
        try:
            from apps.shopie.models import ShopBooksVoucher

            voucher = None
            if voucher_id:
                voucher = ShopBooksVoucher.objects.filter(
                    tenant=order.tenant, business=order.business, id=voucher_id
                ).first()
            if voucher is None and getattr(order, "id", None):
                voucher = (
                    ShopBooksVoucher.objects.filter(
                        tenant=order.tenant,
                        business=order.business,
                        linked_order_id=order.id,
                    )
                    .order_by("-created_at")
                    .first()
                )
            if voucher is None:
                return
            v_meta = dict(voucher.metadata or {})
            v_loyalty = dict(v_meta.get("loyalty") or {}) if isinstance(v_meta.get("loyalty"), dict) else {}
            v_loyalty["points_earned"] = int(points)
            if loyalty.get("points_redeemed") and not v_loyalty.get("points_redeemed"):
                v_loyalty["points_redeemed"] = loyalty.get("points_redeemed")
                v_loyalty["discount_amount"] = loyalty.get("discount_amount")
            v_meta["loyalty"] = v_loyalty
            billing = dict(v_meta.get("billing") or {}) if isinstance(v_meta.get("billing"), dict) else {}
            billing["points_earned"] = int(points)
            billing["reward_points"] = int(
                billing.get("reward_points") or loyalty.get("points_redeemed") or 0
            )
            v_meta["billing"] = billing
            voucher.metadata = v_meta
            voucher.save(update_fields=["metadata", "updated_at", "version"])
        except Exception:
            return

    def _refund_loyalty_on_cancel(self, *, order: ShopOrder) -> None:
        if order.customer_id is None:
            return
        loyalty_meta = (
            (order.metadata or {}).get("loyalty") if isinstance(order.metadata, dict) else {}
        )
        points_redeemed = int((loyalty_meta or {}).get("points_redeemed") or 0)
        try:
            from apps.customers.services.loyalty import LoyaltyService

            LoyaltyService().refund_for_order(
                tenant=order.tenant,
                business=order.business,
                customer=order.customer,
                order_id=order.id,
                points_redeemed=points_redeemed,
            )
            meta = dict(order.metadata or {})
            loyalty = dict(meta.get("loyalty") or {}) if isinstance(meta.get("loyalty"), dict) else {}
            earned = int(loyalty.get("points_earned") or 0)
            if earned > 0:
                loyalty["points_revoked"] = int(loyalty.get("points_revoked") or 0) + earned
                loyalty["points_earned"] = 0
            loyalty["refunded"] = True
            meta["loyalty"] = loyalty
            order.metadata = meta
            order.save(update_fields=["metadata", "updated_at", "version"])
        except Exception:
            return

    def _maybe_award_referral_on_paid(self, *, order: ShopOrder) -> None:
        if order.customer_id is None:
            return
        pos = (order.metadata or {}).get("pos") if isinstance(order.metadata, dict) else {}
        status_value = str((pos or {}).get("payment_status") or "").strip().lower()
        if status_value not in {"paid", "settled"}:
            return
        try:
            from apps.shopie.services.referrals import CustomerReferralService

            CustomerReferralService().maybe_award_for_event(
                tenant=order.tenant,
                business=order.business,
                referred=order.customer,
                event="first_paid_order",
            )
        except Exception:
            # Referral rewards must not break checkout.
            return

    def cancel_customer_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
    ) -> ShopOrder:
        if order.status != OrderStatus.PENDING:
            raise ValidationError({"status": "Only pending orders can be cancelled."})
        return self.transition(
            tenant=tenant,
            business=business,
            order=order,
            status=OrderStatus.CANCELLED,
        )

    @transaction.atomic
    def create_invoice_from_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
    ) -> ShopInvoice:
        lines = [
            {
                "product_id": str(line.product_id),
                "name": line.product_name,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "tax_rate": str(line.tax_rate),
                "line_total": str(line.line_total),
            }
            for line in order.lines.all()
        ]
        invoice = ShopInvoice.objects.create(
            tenant=tenant,
            business=business,
            customer=order.customer,
            order=order,
            invoice_number=self._next_number(business=business, prefix="INV"),
            status=InvoiceStatus.ISSUED,
            currency=order.currency,
            subtotal=order.subtotal,
            tax_total=order.tax_total,
            total=order.total,
            line_items=lines,
        )
        self._post_order_to_books(tenant=tenant, business=business, order=order, invoice=invoice)
        return invoice

    def _post_order_to_books(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        invoice: ShopInvoice | None = None,
    ) -> None:
        """Best-effort post of a Sale (POS) order into ShopIE GST books."""
        try:
            from apps.shopie.services.books import BooksService

            voucher = BooksService().create_sale_from_order(
                tenant=tenant, business=business, order=order
            )
            if invoice is not None and voucher.linked_invoice_id is None:
                voucher.linked_invoice = invoice
                voucher.save(update_fields=["linked_invoice", "updated_at", "version"])
        except Exception:
            # Books posting must not block the counter sale; ledger can be repaired later.
            import logging

            logging.getLogger(__name__).exception(
                "Failed to post order %s to books sale invoice", getattr(order, "order_number", order.id)
            )
            return

    @transaction.atomic
    def create_quotation(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[dict[str, Any]],
        customer: Customer | None = None,
        notes: str = "",
        valid_until=None,
    ) -> ShopQuotation:
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        serialized: list[dict[str, Any]] = []
        for raw in lines:
            product = ShopProduct.objects.get(tenant=tenant, business=business, id=raw["product_id"])
            qty = Decimal(str(raw.get("quantity") or "1"))
            unit_price = Decimal(str(raw.get("unit_price") if raw.get("unit_price") is not None else product.price))
            tax_rate = Decimal(str(raw.get("tax_rate") if raw.get("tax_rate") is not None else product.tax_rate))
            line_subtotal = (unit_price * qty).quantize(Decimal("0.01"))
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
            serialized.append(
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": str(qty),
                    "unit_price": str(unit_price),
                    "tax_rate": str(tax_rate),
                    "line_total": str(line_subtotal + line_tax),
                }
            )
            subtotal += line_subtotal
            tax_total += line_tax
        return ShopQuotation.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            quotation_number=self._next_number(business=business, prefix="QT"),
            status=QuotationStatus.DRAFT,
            currency=business.currency or "INR",
            subtotal=subtotal,
            tax_total=tax_total,
            total=subtotal + tax_total,
            notes=notes or "",
            line_items=serialized,
            valid_until=valid_until,
        )

    def _next_number(self, *, business: Business, prefix: str) -> str:
        stamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"{prefix}-{business.business_code[:8].upper()}-{stamp}"
