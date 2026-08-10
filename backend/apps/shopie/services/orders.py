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
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Tenant


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
            .prefetch_related("lines")
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
        delivery_postal_code: str = "",
        confirm: bool = False,
        bill_discount_type: str = "",
        bill_discount_value: Decimal | str | int | float = "0",
        payment_method: str = "",
        metadata_extra: dict[str, Any] | None = None,
    ) -> ShopOrder:
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})

        mode = fulfillment_mode or FulfillmentMode.PICKUP
        metadata: dict[str, Any] = dict(metadata_extra or {})
        if mode == FulfillmentMode.DELIVERY:
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
        bill_dtype = str(bill_discount_type or "").strip().lower()
        bill_dvalue = Decimal(str(bill_discount_value or "0"))
        # Initial status before totals exist; finalized below once order.total is known.
        if payment == "borrow":
            payment_status = "due"
        elif payment in {"cash", "upi", "card"}:
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

        merchandise_subtotal = Decimal("0.00")
        line_discount_total = Decimal("0.00")
        weighted_tax = Decimal("0.00")
        built_lines: list[ShopOrderLine] = []
        line_tax_flags: list[bool] = []

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
            line_tax_flags.append(tax_inclusive)
            merchandise_subtotal += line_subtotal
            line_discount_total += line_discount
            weighted_tax += line_tax

        bill_discount = self._apply_discount(
            gross=merchandise_subtotal,
            discount_type=bill_dtype,
            discount_value=bill_dvalue,
        )
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
                inclusive = line_tax_flags[index] if index < len(line_tax_flags) else False
                if inclusive and line.tax_rate > 0:
                    inclusive_total = (line.line_subtotal + line.line_tax - share).quantize(Decimal("0.01"))
                    if inclusive_total < 0:
                        inclusive_total = Decimal("0.00")
                    line.line_subtotal = (
                        inclusive_total * Decimal("100") / (Decimal("100") + line.tax_rate)
                    ).quantize(Decimal("0.01"))
                    line.line_tax = (inclusive_total - line.line_subtotal).quantize(Decimal("0.01"))
                    line.line_total = inclusive_total
                else:
                    line.line_subtotal = (line.line_subtotal - share).quantize(Decimal("0.01"))
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

        delivery_fee = Decimal(str(metadata.get("delivery_fee") or "0"))
        order.subtotal = subtotal
        order.discount_total = (line_discount_total + bill_discount).quantize(Decimal("0.01"))
        order.tax_total = tax_total
        order.total = (subtotal + tax_total + delivery_fee).quantize(Decimal("0.01"))
        pos_meta = {
            **metadata.get("pos", {}),
            "line_discount_total": str(line_discount_total),
            "bill_discount_amount": str(bill_discount),
        }
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
                return refreshed
        return self.get_order(tenant=tenant, business=business, order_id=order.id)

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
            OrderStatus.CONFIRMED: {OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED},
            OrderStatus.READY: {OrderStatus.COMPLETED, OrderStatus.CANCELLED},
            OrderStatus.COMPLETED: set(),
            OrderStatus.CANCELLED: set(),
        }
        if status not in allowed.get(order.status, set()):
            raise ValidationError({"status": f"Cannot move from {order.status} to {status}."})

        previous = order.status
        order.status = status
        order.save(update_fields=["status", "updated_at", "version"])

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
                )
        if status == OrderStatus.CANCELLED and previous in {
            OrderStatus.CONFIRMED,
            OrderStatus.READY,
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
                )
        return self.get_order(tenant=tenant, business=business, order_id=order.id)

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
            return refreshed
        return self.get_order(tenant=tenant, business=business, order_id=locked.id)

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
