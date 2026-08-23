from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
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
from apps.tenancy.models import Tenant

DELIVERY_METHOD_STANDARD = "standard"
DELIVERY_METHOD_INSTANT = "instant"
DELIVERY_METHODS = {DELIVERY_METHOD_STANDARD, DELIVERY_METHOD_INSTANT}


class OrderService:
    catalog = CatalogService()
    zones = DeliveryZoneService()

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
        coupon_code: str = "",
        points_to_redeem: int = 0,
        metadata_extra: dict[str, Any] | None = None,
    ) -> ShopOrder:
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})

        mode = fulfillment_mode or FulfillmentMode.PICKUP
        metadata: dict[str, Any] = dict(metadata_extra or {})
        live_delivery_enabled = False
        selected_delivery_method = str(delivery_method or "").strip().lower()
        if mode == FulfillmentMode.DELIVERY:
            from apps.shopie.services.delivery import DeliveryService

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
            bill_dtype = DiscountType.AMOUNT
            savings = quoted_coupon["discount_amount"]
            if payable_total > 0 and merchandise_subtotal > 0:
                bill_dvalue = (savings * merchandise_subtotal / payable_total).quantize(
                    Decimal("0.01")
                )
            else:
                bill_dvalue = savings
            quoted_coupon["taxable_discount_amount"] = bill_dvalue

        bill_discount = self._apply_discount(
            gross=merchandise_subtotal,
            discount_type=bill_dtype,
            discount_value=bill_dvalue,
        )
        loyalty_snapshot = self._redeem_loyalty_on_create(
            tenant=tenant,
            business=business,
            order=order,
            customer=customer,
            eligible_amount=(merchandise_subtotal - bill_discount).quantize(Decimal("0.01")),
            points_to_redeem=points_to_redeem,
        )
        if loyalty_snapshot is not None:
            bill_discount = (
                bill_discount + Decimal(str(loyalty_snapshot["discount_amount"]))
            ).quantize(Decimal("0.01"))
        # Allocate bill discount across lines proportionally and recompute tax on discounted base.
        if bill_discount > 0 and merchandise_subtotal > 0:
            remaining_discount = bill_discount
            remaining_base = merchandise_subtotal
            tax_total = Decimal("0.00")
            for index, line in enumerate(built_lines):
                if index == len(built_lines) - 1:
                    share = remaining_discount
                else:
                    share = (bill_discount * line.line_subtotal / merchandise_subtotal).quantize(
                        Decimal("0.01")
                    )
                    remaining_discount -= share
                line.line_subtotal = (line.line_subtotal - share).quantize(Decimal("0.01"))
                if line.line_subtotal < 0:
                    line.line_subtotal = Decimal("0.00")
                remaining_base -= share
                line.line_tax = (line.line_subtotal * line.tax_rate / Decimal("100")).quantize(
                    Decimal("0.01")
                )
                line.line_total = line.line_subtotal + line.line_tax
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
            customer_phone = (
                str(getattr(customer, "phone_number", "") or "") if customer is not None else ""
            )
            quoted = DeliveryService().quote(
                tenant=tenant,
                business=business,
                drop={
                    "latitude": delivery_latitude,
                    "longitude": delivery_longitude,
                    "address": delivery_address,
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
        pos_meta = {
            **metadata.get("pos", {}),
            "line_discount_total": str(line_discount_total),
            "bill_discount_type": bill_dtype,
            "bill_discount_value": str(bill_dvalue),
            "bill_discount_amount": str(bill_discount),
        }
        if quoted_coupon is not None:
            coupon = quoted_coupon["coupon"]
            metadata["coupon"] = {
                "id": str(coupon.id),
                "code": coupon.code,
                "name": coupon.name,
                "discount_type": coupon.discount_type,
                "discount_value": str(coupon.discount_value),
                "discount_amount": str(quoted_coupon["discount_amount"]),
            }
        if loyalty_snapshot is not None:
            metadata["loyalty"] = loyalty_snapshot
        if payment == "borrow":
            pos_meta["amount_paid"] = "0.00"
            pos_meta["amount_due"] = str(order.total)
            pos_meta["payment_status"] = "due"
        elif mode == FulfillmentMode.POS and payment in {"cash", "upi", "card"}:
            # Counter checkout is collected at the till — mark paid for books posting.
            pos_meta["amount_paid"] = str(order.total)
            pos_meta["amount_due"] = "0.00"
            pos_meta["payment_status"] = "paid"
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

        if payment == "borrow" and customer is not None:
            from apps.customers.services.borrow import BorrowService

            BorrowService().charge_from_order(
                tenant=tenant,
                business=business,
                customer=customer,
                order_id=order.id,
                order_number=order.order_number,
                amount=order.total,
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
        if status in {OrderStatus.CONFIRMED, OrderStatus.COMPLETED}:
            self._post_order_to_books(tenant=tenant, business=business, order=refreshed)
        self._notify_online(refreshed, status)
        return refreshed

    def _notify_online(self, order: ShopOrder, status: str) -> None:
        from apps.shopie.services.order_notify import notify_online_order

        notify_online_order(order=order, status=status)

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
        pos["upi_utr"] = utr
        pos["payment_proof_url"] = proof
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
        status_value = str((pos or {}).get("payment_status") or "").strip().lower()
        if status_value not in {"paid", "settled"}:
            return
        try:
            from apps.customers.services.loyalty import LoyaltyService

            LoyaltyService().award_for_paid_order(
                tenant=order.tenant,
                business=order.business,
                customer=order.customer,
                order_id=order.id,
                amount=order.total,
                order_number=order.order_number,
            )
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
