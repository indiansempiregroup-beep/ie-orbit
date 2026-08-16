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

    @staticmethod
    def refund_plan(*, order: ShopOrder, refund_total: Decimal) -> dict[str, str]:
        """How the shop should give the refund amount back to the customer."""
        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        pos = metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}
        method = str(pos.get("payment_method") or "").lower()
        paid = str(pos.get("payment_status") or "").lower() in {"paid", "settled"}
        amount = f"{order.currency or 'INR'} {refund_total.quantize(Decimal('0.01'))}"
        if not paid:
            return {
                "refund_mode": "bill_adjustment",
                "refund_instruction": (
                    f"No cash refund. {amount} is credited against this unpaid bill."
                ),
            }
        if method == "borrow":
            return {
                "refund_mode": "account_credit",
                "refund_instruction": f"{amount} is credited to the customer account.",
            }
        if method == "upi":
            return {
                "refund_mode": "original_payment",
                "refund_instruction": f"Refund {amount} to the customer's UPI.",
            }
        if method == "card":
            return {
                "refund_mode": "original_payment",
                "refund_instruction": f"Refund {amount} to the original card.",
            }
        return {
            "refund_mode": "cash_at_shop",
            "refund_instruction": f"Pay {amount} cash to the customer at the shop.",
        }

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
        require_delivered: bool = False,
    ) -> ShopReturn:
        allowed_statuses = {OrderStatus.COMPLETED, OrderStatus.READY, OrderStatus.CONFIRMED}
        if require_delivered:
            allowed_statuses = {OrderStatus.COMPLETED}
        if order.status not in allowed_statuses:
            raise ValidationError(
                {
                    "order": (
                        "Returns are only allowed after the order is delivered or picked up."
                        if require_delivered
                        else "Returns are only allowed for confirmed/ready/completed orders."
                    )
                }
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
            product_meta = (
                order_line.product.metadata
                if order_line.product_id and isinstance(getattr(order_line.product, "metadata", None), dict)
                else {}
            )
            serialized.append(
                {
                    "order_line_id": line_id,
                    "product_id": str(order_line.product_id),
                    "name": order_line.product_name,
                    "quantity": str(qty),
                    "unit_price": str(order_line.unit_price),
                    "tax_rate": str(order_line.tax_rate),
                    "tax_inclusive": bool(product_meta.get("tax_inclusive")),
                    "line_total": str(line_total),
                }
            )
            refund_total += line_total
            # Reserve qty within this request so duplicate lines in one payload can't over-return.
            already_returned[line_id] = already_returned.get(line_id, Decimal("0")) + qty

        plan = self.refund_plan(order=order, refund_total=refund_total.quantize(Decimal("0.01")))
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
            metadata=plan,
        )
        if complete:
            shop_return = self.complete_return(
                tenant=tenant, business=business, shop_return=shop_return
            )
        else:
            self._notify_online_return(shop_return, completed=False)
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

        books_cn = self._post_books_credit_note_for_return(
            tenant=tenant,
            business=business,
            order=order,
            shop_return=shop_return,
            order_lines=order_lines,
        )
        if books_cn is not None:
            meta = dict(shop_return.metadata) if isinstance(shop_return.metadata, dict) else {}
            meta["books_credit_note_id"] = str(books_cn.id)
            meta["books_credit_note_number"] = books_cn.voucher_number
            shop_return.metadata = meta
            shop_return.save(update_fields=["metadata", "updated_at", "version"])

        # Always refresh sale invoice net/paid amounts (even if CN posting failed).
        self._apply_return_amounts_to_sale_voucher(
            tenant=tenant,
            business=business,
            order=order,
            shop_return=shop_return,
            books_cn=books_cn,
        )

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
            books_credit_note=books_cn,
        )
        self._notify_online_return(shop_return, completed=True)
        return shop_return

    def _notify_online_return(self, shop_return: ShopReturn, *, completed: bool) -> None:
        from apps.shopie.services.order_notify import notify_online_return

        notify_online_return(shop_return=shop_return, completed=completed)

    def _post_books_credit_note_for_return(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        shop_return: ShopReturn,
        order_lines: dict[str, ShopOrderLine],
    ):
        """Post a GST credit note in Books so GSTR / ledger stay in sync with the return."""
        from apps.shopie.models import ShopBooksVoucher, VoucherType
        from apps.shopie.services.books import BooksService
        from apps.shopie.services.gst import compute_voucher_totals

        # Idempotent: skip if a CN for this return already exists.
        existing = ShopBooksVoucher.objects.filter(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.CREDIT_NOTE,
            metadata__source_return_id=str(shop_return.id),
        ).first()
        if existing is not None:
            return existing

        sale_voucher = (
            ShopBooksVoucher.objects.filter(
                tenant=tenant,
                business=business,
                voucher_type=VoucherType.SALE,
                linked_order=order,
            )
            .order_by("-created_at")
            .first()
        )

        cn_lines: list[dict[str, Any]] = []
        for raw in shop_return.line_items or []:
            order_line = order_lines.get(str(raw.get("order_line_id")))
            qty = Decimal(str(raw.get("quantity") or "0"))
            if qty <= 0 or order_line is None:
                continue
            sold_qty = Decimal(str(order_line.quantity or "0"))
            if sold_qty <= 0:
                continue
            share = qty / sold_qty
            unit = Decimal(str(order_line.unit_price or "0"))
            gst_rate = Decimal(str(order_line.tax_rate or "0"))
            line_subtotal = Decimal(str(order_line.line_subtotal or "0"))
            line_total = Decimal(str(order_line.line_total or "0"))
            inclusive = BooksService._product_tax_inclusive(order_line.product)
            hsn = str(getattr(order_line.product, "hsn_sac", "") or "") if order_line.product_id else ""
            if inclusive:
                # Proportional inclusive total after discounts → extract GST.
                returned_total = (line_total * share).quantize(Decimal("0.01"))
                discount = (unit * qty - returned_total).quantize(Decimal("0.01"))
                if discount < 0:
                    discount = Decimal("0.00")
                cn_lines.append(
                    {
                        "product_id": str(order_line.product_id) if order_line.product_id else None,
                        "name": order_line.product_name,
                        "qty": qty,
                        "rate": unit,
                        "discount": discount,
                        "gst_rate": gst_rate,
                        "tax_inclusive": True,
                        "hsn_sac": hsn,
                    }
                )
            else:
                returned_taxable = (line_subtotal * share).quantize(Decimal("0.01"))
                discount = (unit * qty - returned_taxable).quantize(Decimal("0.01"))
                if discount < 0:
                    discount = Decimal("0.00")
                cn_lines.append(
                    {
                        "product_id": str(order_line.product_id) if order_line.product_id else None,
                        "name": order_line.product_name,
                        "qty": qty,
                        "rate": unit,
                        "discount": discount,
                        "gst_rate": gst_rate,
                        "tax_inclusive": False,
                        "hsn_sac": hsn,
                    }
                )
        if not cn_lines:
            return None

        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        pos = metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}
        payment_method = str(pos.get("payment_method") or "").lower()
        # Cash/UPI/card: refund till. Borrow: books ledger credit only (borrow balance handled separately).
        refund_cash = payment_method in {"cash", "upi", "card"} or payment_method == ""

        books = BooksService()
        interstate = bool(sale_voucher.is_interstate) if sale_voucher else False
        resolved = [
            books._resolve_line(tenant=tenant, business=business, raw=row) for row in cn_lines
        ]
        totals = compute_voucher_totals(resolved, interstate=interstate)
        amount_paid = totals["total"] if refund_cash else Decimal("0.00")
        cash_account_id = None
        if refund_cash and amount_paid > 0:
            if sale_voucher and sale_voucher.cash_account_id:
                cash_account_id = sale_voucher.cash_account_id
            else:
                cash_account_id = books._ensure_cash_account(tenant=tenant, business=business).id

        cn_meta: dict[str, Any] = {
            "source": "return",
            "source_return_id": str(shop_return.id),
            "source_return_number": shop_return.return_number,
            "source_order_id": str(order.id),
            "source_order_number": order.order_number,
            "refund_mode": "cash" if refund_cash else "credit",
        }
        if sale_voucher is not None:
            cn_meta["against_sale_voucher_id"] = str(sale_voucher.id)
            cn_meta["against_sale_voucher_number"] = sale_voucher.voucher_number

        try:
            books_cn = books.create_credit_note(
                tenant=tenant,
                business=business,
                data={
                    "customer": order.customer,
                    "lines": cn_lines,
                    "notes": f"Return {shop_return.return_number} against {order.order_number}",
                    "amount_paid": amount_paid,
                    "cash_account_id": cash_account_id,
                    "adjust_stock": False,  # restock already handled by ReturnService
                    "is_interstate": interstate,
                    "place_of_supply": str(sale_voucher.place_of_supply or "") if sale_voucher else "",
                    "linked_order": order,
                    "metadata": cn_meta,
                },
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Failed to post books credit note for return %s", shop_return.return_number
            )
            return None

        return books_cn

    def _apply_return_amounts_to_sale_voucher(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        shop_return: ShopReturn,
        books_cn=None,
    ):
        """Update linked sale invoice net totals / paid after a completed return.

        Original GST sale header totals stay immutable for audit. Net figures and
        cash amount_paid are adjusted so the invoice UI reflects the return.
        """
        from apps.shopie.models import ShopBooksVoucher, VoucherType

        sale_voucher = (
            ShopBooksVoucher.objects.filter(
                tenant=tenant,
                business=business,
                voucher_type=VoucherType.SALE,
                linked_order=order,
            )
            .order_by("-created_at")
            .first()
        )
        if sale_voucher is None:
            return None

        refund_total = Decimal(
            str(books_cn.total if books_cn is not None else shop_return.refund_total or "0")
        ).quantize(Decimal("0.01"))
        refund_tax = Decimal(str(books_cn.tax_total if books_cn is not None else "0")).quantize(
            Decimal("0.01")
        )
        refund_subtotal = Decimal(
            str(books_cn.subtotal if books_cn is not None else "0")
        ).quantize(Decimal("0.01"))
        cash_refunded = Decimal(
            str(books_cn.amount_paid if books_cn is not None else "0")
        ).quantize(Decimal("0.01"))

        sale_meta = dict(sale_voucher.metadata) if isinstance(sale_voucher.metadata, dict) else {}
        history = list(sale_meta.get("returns") if isinstance(sale_meta.get("returns"), list) else [])
        entry = {
            "return_id": str(shop_return.id),
            "return_number": shop_return.return_number,
            "refund_total": str(refund_total),
            "tax_total": str(refund_tax),
            "subtotal": str(refund_subtotal),
            "cash_refunded": str(cash_refunded),
            "at": timezone.now().isoformat(),
        }
        if books_cn is not None:
            entry["credit_note_id"] = str(books_cn.id)
            entry["credit_note_number"] = books_cn.voucher_number

        updated = False
        for idx, row in enumerate(history):
            if str(row.get("return_id")) == str(shop_return.id):
                history[idx] = {**row, **entry}
                updated = True
                break
        if not updated:
            history.append(entry)

        returned_total = sum(
            (Decimal(str(row.get("refund_total") or "0")) for row in history),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))
        returned_tax = sum(
            (Decimal(str(row.get("tax_total") or "0")) for row in history),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))
        refunded_cash_total = sum(
            (Decimal(str(row.get("cash_refunded") or "0")) for row in history),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))

        original_total = Decimal(str(sale_voucher.total or "0")).quantize(Decimal("0.01"))
        original_tax = Decimal(str(sale_voucher.tax_total or "0")).quantize(Decimal("0.01"))
        net_total = max(Decimal("0.00"), original_total - returned_total).quantize(Decimal("0.01"))
        net_tax = max(Decimal("0.00"), original_tax - returned_tax).quantize(Decimal("0.01"))

        sale_meta["returns"] = history
        sale_meta["returned_total"] = str(returned_total)
        sale_meta["returned_tax_total"] = str(returned_tax)
        sale_meta["refunded_cash_total"] = str(refunded_cash_total)
        sale_meta["net_total"] = str(net_total)
        sale_meta["net_tax_total"] = str(net_tax)

        update_fields = ["metadata", "updated_at", "version"]
        paid = Decimal(str(sale_voucher.amount_paid or "0")).quantize(Decimal("0.01"))
        # Cash/UPI/card: till already refunded via CN — reduce invoice amount_paid.
        if cash_refunded > 0:
            new_paid = max(Decimal("0.00"), paid - cash_refunded).quantize(Decimal("0.01"))
            new_paid = min(new_paid, net_total)
            if new_paid != paid:
                sale_voucher.amount_paid = new_paid
                paid = new_paid
                update_fields = ["metadata", "amount_paid", "updated_at", "version"]
            self._reduce_order_cash_paid_for_return(
                order=order,
                cash_refunded=cash_refunded,
                net_invoice_total=net_total,
            )

        sale_meta["net_amount_paid"] = str(paid)
        sale_meta["net_amount_due"] = str(max(Decimal("0.00"), net_total - paid).quantize(Decimal("0.01")))
        sale_voucher.metadata = sale_meta
        sale_voucher.save(update_fields=update_fields)
        return sale_voucher

    @staticmethod
    def _reduce_order_cash_paid_for_return(
        *,
        order: ShopOrder,
        cash_refunded: Decimal,
        net_invoice_total: Decimal,
    ) -> None:
        """Keep POS order amount_paid in sync after a cash/UPI/card refund."""
        if cash_refunded <= 0:
            return
        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        method = str(pos.get("payment_method") or "").lower()
        if method not in {"cash", "upi", "card", ""}:
            return
        try:
            if pos.get("amount_paid") not in (None, ""):
                paid = Decimal(str(pos.get("amount_paid") or "0"))
            else:
                paid = Decimal(str(order.total or "0"))
        except Exception:
            paid = Decimal(str(order.total or "0"))
        paid = paid.quantize(Decimal("0.01"))
        new_paid = max(Decimal("0.00"), paid - cash_refunded).quantize(Decimal("0.01"))
        new_paid = min(new_paid, net_invoice_total)
        due = max(Decimal("0.00"), net_invoice_total - new_paid).quantize(Decimal("0.01"))
        pos["amount_paid"] = str(new_paid)
        pos["amount_due"] = str(due)
        pos["payment_status"] = "due" if due > 0 else "settled"
        metadata["pos"] = pos
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])

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
        books_credit_note=None,
    ) -> None:
        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        returns = list(pos.get("returns") if isinstance(pos.get("returns"), list) else [])
        entry = {
            "return_id": str(shop_return.id),
            "return_number": shop_return.return_number,
            "refund_total": str(shop_return.refund_total),
            "borrow_reduced": str(borrow_applied),
            "at": timezone.now().isoformat(),
        }
        if books_credit_note is not None:
            entry["credit_note_id"] = str(books_credit_note.id)
            entry["credit_note_number"] = books_credit_note.voucher_number
            entry["tax_total"] = str(books_credit_note.tax_total)
        # Update existing stub from borrow path, or append for cash/UPI returns.
        updated = False
        for idx, row in enumerate(returns):
            if str(row.get("return_id")) == str(shop_return.id):
                returns[idx] = {**row, **entry}
                updated = True
                break
        if not updated:
            returns.append(entry)
        pos["returns"] = returns
        metadata["pos"] = pos
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])

    def list_returns(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order_id: UUID | None = None,
        customer_id: UUID | None = None,
    ):
        qs = ShopReturn.objects.filter(tenant=tenant, business=business).select_related(
            "order", "customer", "credit_invoice"
        )
        if order_id:
            qs = qs.filter(order_id=order_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs.order_by("-created_at")

    def _next_number(self, *, business: Business) -> str:
        stamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return f"RET-{business.business_code[:8].upper()}-{stamp}"
