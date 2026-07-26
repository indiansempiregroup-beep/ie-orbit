from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.shopie.models import (
    InvoiceStatus,
    OrderStatus,
    ReturnStatus,
    ShopInvoice,
    ShopOrder,
    ShopOrderLine,
    ShopReturn,
    StockMovementType,
)
from apps.shopie.services.catalog import CatalogService
from apps.tenancy.models import Tenant


class ReturnService:
    catalog = CatalogService()

    @staticmethod
    def returned_qty_by_line(order: ShopOrder) -> dict[str, Decimal]:
        """Sum quantities already returned (pending/approved/completed) per order line."""
        totals: dict[str, Decimal] = {}
        qs = ShopReturn.objects.filter(
            order=order,
            status__in={
                ReturnStatus.PENDING,
                ReturnStatus.APPROVED,
                ReturnStatus.COMPLETED,
            },
        )
        for shop_return in qs:
            for raw in shop_return.line_items or []:
                line_id = str(raw.get("order_line_id") or "")
                if not line_id:
                    continue
                qty = Decimal(str(raw.get("quantity") or "0"))
                totals[line_id] = (totals.get(line_id, Decimal("0")) + qty).quantize(
                    Decimal("0.01")
                )
        return totals

    @staticmethod
    def _line_refund_amount(*, order_line: ShopOrderLine, qty: Decimal) -> Decimal:
        """Proportional share of the sold line total (includes discounts + tax)."""
        sold_qty = Decimal(str(order_line.quantity or "0"))
        if sold_qty <= 0 or qty <= 0:
            return Decimal("0.00")
        line_total = Decimal(str(order_line.line_total or "0"))
        return (line_total * qty / sold_qty).quantize(Decimal("0.01"))

    @transaction.atomic
    def create_return(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        lines: list[dict[str, Any]],
        reason: str = "",
        restock: bool = True,
        complete: bool = True,
    ) -> ShopReturn:
        if order.status not in {OrderStatus.COMPLETED, OrderStatus.READY, OrderStatus.CONFIRMED}:
            raise ValidationError(
                {"order": "Returns are only allowed for confirmed/ready/completed orders."}
            )
        if not lines:
            raise ValidationError({"lines": "At least one return line is required."})

        already_returned = self.returned_qty_by_line(order)
        serialized: list[dict[str, Any]] = []
        refund_total = Decimal("0.00")
        order_lines = {str(line.id): line for line in order.lines.select_related("product")}

        for raw in lines:
            line_id = str(raw.get("order_line_id") or "")
            order_line = order_lines.get(line_id)
            if not order_line:
                raise ValidationError({"lines": f"Order line {line_id} not found."})
            qty = Decimal(str(raw.get("quantity") or "0")).quantize(Decimal("0.01"))
            remaining = (
                Decimal(str(order_line.quantity)) - already_returned.get(line_id, Decimal("0"))
            ).quantize(Decimal("0.01"))
            if qty <= 0 or qty > remaining:
                raise ValidationError(
                    {
                        "lines": (
                            f"Invalid return quantity for {order_line.product_name}. "
                            f"Returnable: {remaining}."
                        )
                    }
                )
            line_total = self._line_refund_amount(order_line=order_line, qty=qty)
            serialized.append(
                {
                    "order_line_id": line_id,
                    "product_id": str(order_line.product_id),
                    "name": order_line.product_name,
                    "quantity": str(qty),
                    "unit_price": str(order_line.unit_price),
                    "tax_rate": str(order_line.tax_rate),
                    "line_total": str(line_total),
                }
            )
            refund_total += line_total
            # Reserve qty within this request so duplicate lines in one payload can't over-return.
            already_returned[line_id] = already_returned.get(line_id, Decimal("0")) + qty

        shop_return = ShopReturn.objects.create(
            tenant=tenant,
            business=business,
            order=order,
            customer=order.customer,
            return_number=self._next_number(business=business),
            status=ReturnStatus.PENDING,
            reason=reason or "",
            restock=restock,
            refund_total=refund_total.quantize(Decimal("0.01")),
            currency=order.currency,
            line_items=serialized,
        )
        if complete:
            shop_return = self.complete_return(
                tenant=tenant, business=business, shop_return=shop_return
            )
        return shop_return

    @transaction.atomic
    def complete_return(
        self,
        *,
        tenant: Tenant,
        business: Business,
        shop_return: ShopReturn,
    ) -> ShopReturn:
        if shop_return.status == ReturnStatus.COMPLETED:
            return shop_return
        if shop_return.status == ReturnStatus.REJECTED:
            raise ValidationError({"status": "Rejected returns cannot be completed."})

        # Lock the order row only — select_related(customer) would outer-join and
        # Postgres rejects FOR UPDATE on the nullable side of an outer join.
        order = (
            ShopOrder.objects.select_for_update(of=("self",))
            .filter(id=shop_return.order_id, tenant=tenant, business=business)
            .first()
        )
        if order is None:
            raise ValidationError({"order": "Order not found for this return."})

        order_lines = {
            str(line.id): line
            for line in ShopOrderLine.objects.filter(order=order).select_related("product")
        }
        if shop_return.restock:
            for raw in shop_return.line_items or []:
                order_line = order_lines.get(str(raw.get("order_line_id")))
                if not order_line:
                    continue
                qty = Decimal(str(raw.get("quantity") or "0"))
                if qty <= 0:
                    continue
                self.catalog.adjust_stock(
                    tenant=tenant,
                    business=business,
                    product=order_line.product,
                    quantity_delta=qty,
                    movement_type=StockMovementType.RETURN,
                    reason=f"Return {shop_return.return_number}",
                    order=order,
                )

        credit = ShopInvoice.objects.create(
            tenant=tenant,
            business=business,
            customer=shop_return.customer,
            order=order,
            invoice_number=f"CN-{shop_return.return_number}",
            status=InvoiceStatus.CREDIT,
            currency=shop_return.currency,
            subtotal=-(shop_return.refund_total),
            tax_total=Decimal("0.00"),
            total=-(shop_return.refund_total),
            line_items=shop_return.line_items,
            notes=f"Credit for return {shop_return.return_number}",
            metadata={"return_id": str(shop_return.id)},
        )
        shop_return.credit_invoice = credit
        shop_return.status = ReturnStatus.COMPLETED
        shop_return.save(update_fields=["credit_invoice", "status", "updated_at", "version"])

        borrow_applied = self._apply_borrow_credit_for_return(
            tenant=tenant,
            business=business,
            order=order,
            shop_return=shop_return,
        )
        self._record_return_on_order(
            order=order,
            shop_return=shop_return,
            borrow_applied=borrow_applied,
        )
        return shop_return

    def _apply_borrow_credit_for_return(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        shop_return: ShopReturn,
    ) -> Decimal:
        """Reduce customer borrow + order amount_due for unpaid portion of returned goods."""
        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        if str(pos.get("payment_method") or "").lower() != "borrow":
            return Decimal("0.00")
        if order.customer_id is None:
            return Decimal("0.00")

        try:
            due = Decimal(str(pos.get("amount_due") if pos.get("amount_due") is not None else order.total))
        except Exception:
            due = Decimal(str(order.total or "0"))
        due = due.quantize(Decimal("0.01"))
        refund = Decimal(str(shop_return.refund_total or "0")).quantize(Decimal("0.01"))
        apply = min(refund, due).quantize(Decimal("0.01"))
        if apply <= 0:
            # Fully paid borrow bill — credit note covers cash refund; borrow unchanged.
            return Decimal("0.00")

        from apps.customers.services.borrow import BorrowService

        BorrowService().credit_from_return(
            tenant=tenant,
            business=business,
            customer=order.customer,
            amount=apply,
            order_id=order.id,
            order_number=order.order_number,
            return_number=shop_return.return_number,
            return_id=shop_return.id,
        )

        paid = Decimal(str(pos.get("amount_paid") or "0")).quantize(Decimal("0.01"))
        new_due = (due - apply).quantize(Decimal("0.01"))
        pos["amount_due"] = str(new_due)
        pos["amount_paid"] = str(paid)
        pos["payment_status"] = "due" if new_due > 0 else "settled"
        returns = list(pos.get("returns") if isinstance(pos.get("returns"), list) else [])
        returns.append(
            {
                "return_id": str(shop_return.id),
                "return_number": shop_return.return_number,
                "refund_total": str(refund),
                "borrow_reduced": str(apply),
                "at": timezone.now().isoformat(),
            }
        )
        pos["returns"] = returns
        metadata["pos"] = pos
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])
        return apply

    @staticmethod
    def _record_return_on_order(
        *,
        order: ShopOrder,
        shop_return: ShopReturn,
        borrow_applied: Decimal,
    ) -> None:
        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        # Ensure non-borrow returns also leave an audit trail on the order.
        if str(pos.get("payment_method") or "").lower() != "borrow":
            returns = list(pos.get("returns") if isinstance(pos.get("returns"), list) else [])
            if not any(str(row.get("return_id")) == str(shop_return.id) for row in returns):
                returns.append(
                    {
                        "return_id": str(shop_return.id),
                        "return_number": shop_return.return_number,
                        "refund_total": str(shop_return.refund_total),
                        "borrow_reduced": str(borrow_applied),
                        "at": timezone.now().isoformat(),
                    }
                )
                pos["returns"] = returns
                metadata["pos"] = pos
                order.metadata = metadata
                order.save(update_fields=["metadata", "updated_at", "version"])

    def list_returns(self, *, tenant: Tenant, business: Business, order_id: UUID | None = None):
        qs = ShopReturn.objects.filter(tenant=tenant, business=business).select_related(
            "order", "customer", "credit_invoice"
        )
        if order_id:
            qs = qs.filter(order_id=order_id)
        return qs.order_by("-created_at")

    def _next_number(self, *, business: Business) -> str:
        stamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"RET-{business.business_code[:8].upper()}-{stamp}"
