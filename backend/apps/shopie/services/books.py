from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet, Sum
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    CashAccountType,
    LedgerDirection,
    LedgerEntryType,
    OrderStatus,
    PartyKind,
    QuotationStatus,
    ShopBooksVoucher,
    ShopCashAccount,
    ShopOrder,
    ShopOrderLine,
    ShopPartyLedgerEntry,
    ShopProduct,
    ShopQuotation,
    ShopSupplier,
    StockMovementType,
    VoucherStatus,
    VoucherType,
)
from apps.shopie.services.catalog import CatalogService
from apps.shopie.services.gst import compute_voucher_totals
from apps.tenancy.models import Tenant

CENTS = Decimal("0.01")


def _q(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(CENTS, rounding=ROUND_HALF_UP)


_VOUCHER_PREFIX = {
    VoucherType.SALE: "SV",
    VoucherType.PURCHASE: "PV",
    VoucherType.PAYMENT_IN: "RCT",
    VoucherType.PAYMENT_OUT: "PMT",
    VoucherType.CREDIT_NOTE: "CN",
    VoucherType.DEBIT_NOTE: "DN",
    VoucherType.EXPENSE: "EXP",
    VoucherType.OTHER_INCOME: "INC",
    VoucherType.TRANSFER: "TRF",
}

# Voucher types that carry a customer party ledger (accounts receivable).
_CUSTOMER_VOUCHER_TYPES = {VoucherType.SALE, VoucherType.PAYMENT_IN, VoucherType.CREDIT_NOTE}
# Voucher types that carry a supplier party ledger (accounts payable).
_SUPPLIER_VOUCHER_TYPES = {VoucherType.PURCHASE, VoucherType.PAYMENT_OUT, VoucherType.DEBIT_NOTE}


class BooksService:
    catalog = CatalogService()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _next_number(self, *, business: Business, voucher_type: str) -> str:
        prefix = _VOUCHER_PREFIX.get(voucher_type, "VC")
        stamp = timezone.now().strftime("%Y%m%d%H%M%S%f")[:-3]
        return f"{prefix}-{business.business_code[:8].upper()}-{stamp}"

    def _last_balance(
        self,
        *,
        tenant: Tenant,
        business: Business,
        party_kind: str,
        customer: Customer | None,
        supplier: ShopSupplier | None,
    ) -> Decimal:
        filters: dict[str, Any] = dict(tenant=tenant, business=business, party_kind=party_kind)
        if party_kind == PartyKind.CUSTOMER:
            filters["customer"] = customer
        else:
            filters["supplier"] = supplier
        last = (
            ShopPartyLedgerEntry.objects.filter(**filters)
            .order_by("-created_at", "-id")
            .first()
        )
        if last is not None:
            return last.balance_after
        if party_kind == PartyKind.SUPPLIER and supplier is not None:
            return _q(supplier.opening_balance)
        return Decimal("0.00")

    def _record_ledger(
        self,
        *,
        tenant: Tenant,
        business: Business,
        party_kind: str,
        customer: Customer | None = None,
        supplier: ShopSupplier | None = None,
        entry_type: str,
        amount: Decimal,
        direction: str,
        voucher: ShopBooksVoucher | None = None,
        notes: str = "",
    ) -> ShopPartyLedgerEntry | None:
        amount = _q(amount)
        if amount <= 0:
            return None
        if party_kind == PartyKind.CUSTOMER and customer is None:
            return None
        if party_kind == PartyKind.SUPPLIER and supplier is None:
            return None

        previous = self._last_balance(
            tenant=tenant,
            business=business,
            party_kind=party_kind,
            customer=customer,
            supplier=supplier,
        )
        signed = amount if direction == LedgerDirection.DEBIT else -amount
        if party_kind == PartyKind.SUPPLIER:
            # Supplier ledger tracks accounts payable: credit increases what we owe.
            signed = -signed
        balance_after = _q(previous + signed)

        return ShopPartyLedgerEntry.objects.create(
            tenant=tenant,
            business=business,
            party_kind=party_kind,
            customer=customer,
            supplier=supplier,
            entry_type=entry_type,
            amount=amount,
            direction=direction,
            balance_after=balance_after,
            voucher=voucher,
            notes=notes or "",
        )

    def _cash_account_for(
        self, *, tenant: Tenant, business: Business, cash_account_id: UUID | str | None
    ) -> ShopCashAccount | None:
        if not cash_account_id:
            return None
        return ShopCashAccount.objects.select_for_update().get(
            tenant=tenant, business=business, id=cash_account_id
        )

    def _ensure_cash_account(
        self, *, tenant: Tenant, business: Business, cash_account_id: UUID | str | None = None
    ) -> ShopCashAccount:
        if cash_account_id:
            return self._cash_account_for(
                tenant=tenant, business=business, cash_account_id=cash_account_id
            )
        existing = (
            ShopCashAccount.objects.select_for_update()
            .filter(tenant=tenant, business=business, is_active=True, account_type=CashAccountType.CASH)
            .order_by("created_at")
            .first()
        )
        if existing is None:
            existing = (
                ShopCashAccount.objects.select_for_update()
                .filter(tenant=tenant, business=business, is_active=True)
                .order_by("created_at")
                .first()
            )
        if existing is not None:
            return existing
        return ShopCashAccount.objects.create(
            tenant=tenant,
            business=business,
            name="Cash",
            account_type=CashAccountType.CASH,
            opening_balance=Decimal("0.00"),
            current_balance=Decimal("0.00"),
        )

    def _adjust_cash_balance(self, *, account: ShopCashAccount | None, delta: Decimal) -> None:
        if account is None:
            return
        account.current_balance = _q(account.current_balance + delta)
        account.save(update_fields=["current_balance", "updated_at", "version"])

    def _resolve_line(
        self, *, tenant: Tenant, business: Business, raw: dict[str, Any]
    ) -> dict[str, Any]:
        row = dict(raw)
        product_id = row.get("product_id")
        if product_id:
            try:
                product = ShopProduct.objects.get(tenant=tenant, business=business, id=product_id)
            except ShopProduct.DoesNotExist as exc:
                raise ValidationError({"lines": f"Product {product_id} not found."}) from exc
            if not row.get("name"):
                row["name"] = product.name
            if not row.get("hsn_sac"):
                row["hsn_sac"] = product.hsn_sac
            if row.get("gst_rate") is None:
                row["gst_rate"] = product.gst_rate
            if row.get("rate") is None:
                row["rate"] = product.price
            if row.get("tax_inclusive") is None:
                product_meta = product.metadata if isinstance(product.metadata, dict) else {}
                row["tax_inclusive"] = bool(product_meta.get("tax_inclusive"))
        return row

    @staticmethod
    def _product_tax_inclusive(product: ShopProduct | None) -> bool:
        if product is None:
            return False
        meta = product.metadata if isinstance(product.metadata, dict) else {}
        return bool(meta.get("tax_inclusive"))

    @staticmethod
    def _books_line_from_order_line(line: ShopOrderLine) -> dict[str, Any]:
        """Build a books line that preserves finalized POS tax (incl. tax-inclusive pricing)."""
        qty = Decimal(str(line.quantity or "0"))
        unit = Decimal(str(line.unit_price or "0"))
        tax_rate = Decimal(str(line.tax_rate or "0"))
        line_subtotal = Decimal(str(line.line_subtotal or "0"))
        line_total = Decimal(str(line.line_total or "0"))
        inclusive = BooksService._product_tax_inclusive(line.product)
        if inclusive:
            # Keep shelf/MRP rate; fold line + bill discounts into discount so total matches POS.
            discount = _q((unit * qty) - line_total)
            if discount < 0:
                discount = Decimal("0.00")
            return {
                "product_id": line.product_id,
                "name": line.product_name,
                "qty": qty,
                "rate": unit,
                "discount": discount,
                "gst_rate": tax_rate,
                "tax_inclusive": True,
                "hsn_sac": getattr(line.product, "hsn_sac", "") if line.product_id else "",
            }
        # Exclusive: taxable base is already finalized on the order line.
        discount = _q((unit * qty) - line_subtotal)
        if discount < 0:
            discount = Decimal("0.00")
        return {
            "product_id": line.product_id,
            "name": line.product_name,
            "qty": qty,
            "rate": unit,
            "discount": discount,
            "gst_rate": tax_rate,
            "tax_inclusive": False,
            "hsn_sac": getattr(line.product, "hsn_sac", "") if line.product_id else "",
        }

    # ------------------------------------------------------------------
    # Sale / purchase vouchers
    # ------------------------------------------------------------------
    @transaction.atomic
    def create_sale_voucher(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
    ) -> ShopBooksVoucher:
        lines = data.get("lines") or []
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        resolved_lines = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        interstate = bool(data.get("is_interstate"))
        totals = compute_voucher_totals(resolved_lines, interstate=interstate)

        customer = data.get("customer")
        linked_order = data.get("linked_order")
        status = str(data.get("status") or VoucherStatus.CONFIRMED)
        points_to_redeem = int(data.get("points_to_redeem") or 0)
        loyalty_eligible = _q(totals.get("subtotal") or "0")
        if points_to_redeem > 0 and linked_order is None:
            if customer is None:
                raise ValidationError(
                    {"points_to_redeem": "Select a customer to redeem reward points."}
                )
            from apps.customers.services.loyalty import LoyaltyService

            loyalty = LoyaltyService()
            account = loyalty.ensure_account(
                tenant=tenant, business=business, customer=customer
            )
            quote = loyalty.quote_redemption(
                business=business,
                amount=loyalty_eligible,
                points_to_redeem=points_to_redeem,
                points_balance=account.points_balance,
            )
            extra = _q(quote["discount_amount"])
            totals["discount_total"] = _q(totals["discount_total"]) + extra
            totals["total"] = max(Decimal("0.00"), _q(totals["total"]) - extra)

        amount_paid = _q(data.get("amount_paid") or "0")
        if amount_paid > totals["total"]:
            raise ValidationError({"amount_paid": "Amount paid cannot exceed the voucher total."})

        cash_account = None
        if amount_paid > 0:
            cash_account = self._cash_account_for(
                tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
            )
            if cash_account is None:
                raise ValidationError(
                    {"cash_account_id": "Select a cash/bank account to record the payment."}
                )

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.SALE,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.SALE),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=status,
            customer=customer,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=totals["subtotal"],
            discount_total=totals["discount_total"],
            tax_total=totals["tax_total"],
            cgst_total=totals["cgst_total"],
            sgst_total=totals["sgst_total"],
            igst_total=totals["igst_total"],
            total=totals["total"],
            amount_paid=amount_paid,
            place_of_supply=str(data.get("place_of_supply") or ""),
            is_interstate=interstate,
            notes=str(data.get("notes") or ""),
            line_items=totals["lines"],
            linked_order=data.get("linked_order"),
            linked_invoice=data.get("linked_invoice"),
            metadata=data.get("metadata") or {},
        )

        if status == VoucherStatus.CONFIRMED:
            if data.get("adjust_stock", True):
                self._apply_stock_movements(
                    tenant=tenant,
                    business=business,
                    voucher=voucher,
                    direction=-1,
                    movement_type=StockMovementType.SALE,
                )
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.CUSTOMER,
                customer=customer,
                entry_type=LedgerEntryType.SALE,
                amount=totals["total"],
                direction=LedgerDirection.DEBIT,
                voucher=voucher,
                notes=f"Sale {voucher.voucher_number}",
            )
            if amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.CUSTOMER,
                    customer=customer,
                    entry_type=LedgerEntryType.PAYMENT_IN,
                    amount=amount_paid,
                    direction=LedgerDirection.CREDIT,
                    voucher=voucher,
                    notes=f"Payment for {voucher.voucher_number}",
                )
                self._adjust_cash_balance(account=cash_account, delta=amount_paid)
        self._apply_sale_loyalty(
            tenant=tenant,
            business=business,
            voucher=voucher,
            customer=customer,
            linked_order=linked_order,
            points_to_redeem=points_to_redeem,
            eligible_amount=loyalty_eligible,
            status=status,
        )
        return voucher

    @transaction.atomic
    def create_purchase_voucher(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
    ) -> ShopBooksVoucher:
        lines = data.get("lines") or []
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        resolved_lines = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        interstate = bool(data.get("is_interstate"))
        totals = compute_voucher_totals(resolved_lines, interstate=interstate)

        supplier = data.get("supplier")
        status = str(data.get("status") or VoucherStatus.CONFIRMED)
        amount_paid = _q(data.get("amount_paid") or "0")
        if amount_paid > totals["total"]:
            raise ValidationError({"amount_paid": "Amount paid cannot exceed the voucher total."})

        cash_account = None
        if amount_paid > 0:
            cash_account = self._cash_account_for(
                tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
            )
            if cash_account is None:
                raise ValidationError(
                    {"cash_account_id": "Select a cash/bank account to record the payment."}
                )

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.PURCHASE,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.PURCHASE),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=status,
            supplier=supplier,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=totals["subtotal"],
            discount_total=totals["discount_total"],
            tax_total=totals["tax_total"],
            cgst_total=totals["cgst_total"],
            sgst_total=totals["sgst_total"],
            igst_total=totals["igst_total"],
            total=totals["total"],
            amount_paid=amount_paid,
            place_of_supply=str(data.get("place_of_supply") or ""),
            is_interstate=interstate,
            notes=str(data.get("notes") or ""),
            line_items=totals["lines"],
            metadata=data.get("metadata") or {},
        )

        if status == VoucherStatus.CONFIRMED:
            if data.get("adjust_stock", True):
                self._apply_stock_movements(
                    tenant=tenant,
                    business=business,
                    voucher=voucher,
                    direction=1,
                    movement_type=StockMovementType.RECEIVE,
                )
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.SUPPLIER,
                supplier=supplier,
                entry_type=LedgerEntryType.PURCHASE,
                amount=totals["total"],
                direction=LedgerDirection.CREDIT,
                voucher=voucher,
                notes=f"Purchase {voucher.voucher_number}",
            )
            if amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.SUPPLIER,
                    supplier=supplier,
                    entry_type=LedgerEntryType.PAYMENT_OUT,
                    amount=amount_paid,
                    direction=LedgerDirection.DEBIT,
                    voucher=voucher,
                    notes=f"Payment for {voucher.voucher_number}",
                )
                self._adjust_cash_balance(account=cash_account, delta=-amount_paid)
        return voucher

    @transaction.atomic
    def create_credit_note(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
    ) -> ShopBooksVoucher:
        """Customer credit note — reduces receivable and returns stock."""
        lines = data.get("lines") or []
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        resolved_lines = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        interstate = bool(data.get("is_interstate"))
        totals = compute_voucher_totals(resolved_lines, interstate=interstate)

        customer = data.get("customer")
        status = str(data.get("status") or VoucherStatus.CONFIRMED)
        amount_paid = _q(data.get("amount_paid") or "0")
        if amount_paid > totals["total"]:
            raise ValidationError({"amount_paid": "Refund amount cannot exceed the note total."})

        cash_account = None
        if amount_paid > 0:
            cash_account = self._cash_account_for(
                tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
            )
            if cash_account is None:
                raise ValidationError(
                    {"cash_account_id": "Select a cash/bank account to record the refund."}
                )

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.CREDIT_NOTE,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.CREDIT_NOTE),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=status,
            customer=customer,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=totals["subtotal"],
            discount_total=totals["discount_total"],
            tax_total=totals["tax_total"],
            cgst_total=totals["cgst_total"],
            sgst_total=totals["sgst_total"],
            igst_total=totals["igst_total"],
            total=totals["total"],
            amount_paid=amount_paid,
            place_of_supply=str(data.get("place_of_supply") or ""),
            is_interstate=interstate,
            notes=str(data.get("notes") or ""),
            line_items=totals["lines"],
            linked_order=data.get("linked_order"),
            metadata=data.get("metadata") or {},
        )

        if status == VoucherStatus.CONFIRMED:
            if data.get("adjust_stock", True):
                self._apply_stock_movements(
                    tenant=tenant,
                    business=business,
                    voucher=voucher,
                    direction=1,
                    movement_type=StockMovementType.RETURN,
                )
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.CUSTOMER,
                customer=customer,
                entry_type=LedgerEntryType.CREDIT,
                amount=totals["total"],
                direction=LedgerDirection.CREDIT,
                voucher=voucher,
                notes=f"Credit note {voucher.voucher_number}",
            )
            if amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.CUSTOMER,
                    customer=customer,
                    entry_type=LedgerEntryType.PAYMENT_OUT,
                    amount=amount_paid,
                    direction=LedgerDirection.DEBIT,
                    voucher=voucher,
                    notes=f"Refund for {voucher.voucher_number}",
                )
                self._adjust_cash_balance(account=cash_account, delta=-amount_paid)
            self._clawback_loyalty_for_credit_note(
                tenant=tenant,
                business=business,
                voucher=voucher,
                customer=customer,
            )
        return voucher

    def _clawback_loyalty_for_credit_note(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher: ShopBooksVoucher,
        customer: Customer | None,
    ) -> None:
        """Revoke earned points when a books credit note refunds a sale (non-order returns)."""
        if customer is None:
            return
        meta = voucher.metadata if isinstance(voucher.metadata, dict) else {}
        # Order returns claw back via ReturnService against the order ledger.
        if meta.get("source") == "return" or meta.get("source_return_id") or voucher.linked_order_id:
            return
        against_id = meta.get("against_sale_voucher_id")
        if not against_id:
            return
        try:
            from apps.customers.services.loyalty import LoyaltyService

            sale = (
                ShopBooksVoucher.objects.filter(
                    tenant=tenant,
                    business=business,
                    id=against_id,
                    voucher_type=VoucherType.SALE,
                )
                .select_related("customer")
                .first()
            )
            if sale is None or sale.customer_id is None or sale.linked_order_id is not None:
                return
            LoyaltyService().clawback_earn_for_spend(
                tenant=tenant,
                business=business,
                customer=sale.customer,
                amount=voucher.total,
                voucher_id=sale.id,
                reason=f"Reversed earn for credit note {voucher.voucher_number}",
            )
        except Exception:
            return

    @transaction.atomic
    def create_debit_note(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
    ) -> ShopBooksVoucher:
        """Supplier debit note — reduces payable and removes stock."""
        lines = data.get("lines") or []
        if not lines:
            raise ValidationError({"lines": "At least one line item is required."})
        resolved_lines = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        interstate = bool(data.get("is_interstate"))
        totals = compute_voucher_totals(resolved_lines, interstate=interstate)

        supplier = data.get("supplier")
        status = str(data.get("status") or VoucherStatus.CONFIRMED)
        amount_paid = _q(data.get("amount_paid") or "0")
        if amount_paid > totals["total"]:
            raise ValidationError({"amount_paid": "Amount cannot exceed the note total."})

        cash_account = None
        if amount_paid > 0:
            cash_account = self._cash_account_for(
                tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
            )
            if cash_account is None:
                raise ValidationError(
                    {"cash_account_id": "Select a cash/bank account to record the receipt."}
                )

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.DEBIT_NOTE,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.DEBIT_NOTE),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=status,
            supplier=supplier,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=totals["subtotal"],
            discount_total=totals["discount_total"],
            tax_total=totals["tax_total"],
            cgst_total=totals["cgst_total"],
            sgst_total=totals["sgst_total"],
            igst_total=totals["igst_total"],
            total=totals["total"],
            amount_paid=amount_paid,
            place_of_supply=str(data.get("place_of_supply") or ""),
            is_interstate=interstate,
            notes=str(data.get("notes") or ""),
            line_items=totals["lines"],
            metadata=data.get("metadata") or {},
        )

        if status == VoucherStatus.CONFIRMED:
            if data.get("adjust_stock", True):
                try:
                    self._apply_stock_movements(
                        tenant=tenant,
                        business=business,
                        voucher=voucher,
                        direction=-1,
                        movement_type=StockMovementType.ADJUST,
                    )
                except ValidationError:
                    pass
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.SUPPLIER,
                supplier=supplier,
                entry_type=LedgerEntryType.DEBIT,
                amount=totals["total"],
                direction=LedgerDirection.DEBIT,
                voucher=voucher,
                notes=f"Debit note {voucher.voucher_number}",
            )
            if amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.SUPPLIER,
                    supplier=supplier,
                    entry_type=LedgerEntryType.PAYMENT_IN,
                    amount=amount_paid,
                    direction=LedgerDirection.CREDIT,
                    voucher=voucher,
                    notes=f"Receipt for {voucher.voucher_number}",
                )
                self._adjust_cash_balance(account=cash_account, delta=amount_paid)
        return voucher

    def _apply_stock_movements(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher: ShopBooksVoucher,
        direction: int,
        movement_type: str,
    ) -> None:
        for row in voucher.line_items or []:
            product_id = row.get("product_id")
            if not product_id:
                continue
            try:
                product = ShopProduct.objects.select_for_update().get(
                    tenant=tenant, business=business, id=product_id
                )
            except ShopProduct.DoesNotExist:
                continue
            qty = Decimal(str(row.get("qty") or "0"))
            if qty <= 0:
                continue
            self.catalog.adjust_stock(
                tenant=tenant,
                business=business,
                product=product,
                quantity_delta=qty * direction,
                movement_type=movement_type,
                reason=f"{voucher.get_voucher_type_display()} {voucher.voucher_number}",
            )

    # ------------------------------------------------------------------
    # Payments / expenses / income / transfers
    # ------------------------------------------------------------------
    @transaction.atomic
    def create_payment_in(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBooksVoucher:
        amount = _q(data.get("amount"))
        if amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        customer = data.get("customer")
        if customer is None:
            raise ValidationError({"customer_id": "A customer is required for payment-in."})
        cash_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
        )
        if cash_account is None:
            raise ValidationError({"cash_account_id": "Select a cash/bank account."})

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.PAYMENT_IN,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.PAYMENT_IN),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=VoucherStatus.CONFIRMED,
            customer=customer,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=amount,
            total=amount,
            amount_paid=amount,
            notes=str(data.get("notes") or ""),
            metadata=data.get("metadata") or {},
        )
        self._record_ledger(
            tenant=tenant,
            business=business,
            party_kind=PartyKind.CUSTOMER,
            customer=customer,
            entry_type=LedgerEntryType.PAYMENT_IN,
            amount=amount,
            direction=LedgerDirection.CREDIT,
            voucher=voucher,
            notes=str(data.get("notes") or f"Payment received {voucher.voucher_number}"),
        )
        self._adjust_cash_balance(account=cash_account, delta=amount)
        return voucher

    @transaction.atomic
    def create_payment_out(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBooksVoucher:
        amount = _q(data.get("amount"))
        if amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        supplier = data.get("supplier")
        if supplier is None:
            raise ValidationError({"supplier_id": "A supplier is required for payment-out."})
        cash_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
        )
        if cash_account is None:
            raise ValidationError({"cash_account_id": "Select a cash/bank account."})

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.PAYMENT_OUT,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.PAYMENT_OUT),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=VoucherStatus.CONFIRMED,
            supplier=supplier,
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=amount,
            total=amount,
            amount_paid=amount,
            notes=str(data.get("notes") or ""),
            metadata=data.get("metadata") or {},
        )
        self._record_ledger(
            tenant=tenant,
            business=business,
            party_kind=PartyKind.SUPPLIER,
            supplier=supplier,
            entry_type=LedgerEntryType.PAYMENT_OUT,
            amount=amount,
            direction=LedgerDirection.DEBIT,
            voucher=voucher,
            notes=str(data.get("notes") or f"Payment made {voucher.voucher_number}"),
        )
        self._adjust_cash_balance(account=cash_account, delta=-amount)
        return voucher

    @transaction.atomic
    def create_expense(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBooksVoucher:
        amount = _q(data.get("amount"))
        if amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        cash_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
        )
        if cash_account is None:
            raise ValidationError({"cash_account_id": "Select a cash/bank account."})
        metadata = dict(data.get("metadata") or {})
        if data.get("category"):
            metadata["category"] = str(data["category"])

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.EXPENSE,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.EXPENSE),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=VoucherStatus.CONFIRMED,
            supplier=data.get("supplier"),
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=amount,
            total=amount,
            amount_paid=amount,
            notes=str(data.get("notes") or ""),
            metadata=metadata,
        )
        self._adjust_cash_balance(account=cash_account, delta=-amount)
        return voucher

    @transaction.atomic
    def create_other_income(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBooksVoucher:
        amount = _q(data.get("amount"))
        if amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        cash_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
        )
        if cash_account is None:
            raise ValidationError({"cash_account_id": "Select a cash/bank account."})
        metadata = dict(data.get("metadata") or {})
        if data.get("category"):
            metadata["category"] = str(data["category"])

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.OTHER_INCOME,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.OTHER_INCOME),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=VoucherStatus.CONFIRMED,
            customer=data.get("customer"),
            cash_account=cash_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=amount,
            total=amount,
            amount_paid=amount,
            notes=str(data.get("notes") or ""),
            metadata=metadata,
        )
        self._adjust_cash_balance(account=cash_account, delta=amount)
        return voucher

    @transaction.atomic
    def create_transfer(
        self, *, tenant: Tenant, business: Business, data: dict[str, Any]
    ) -> ShopBooksVoucher:
        amount = _q(data.get("amount"))
        if amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        from_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("cash_account_id")
        )
        to_account = self._cash_account_for(
            tenant=tenant, business=business, cash_account_id=data.get("contra_account_id")
        )
        if from_account is None or to_account is None:
            raise ValidationError(
                {"cash_account_id": "Both source and destination accounts are required."}
            )
        if from_account.id == to_account.id:
            raise ValidationError(
                {"contra_account_id": "Source and destination accounts must differ."}
            )

        voucher = ShopBooksVoucher.objects.create(
            tenant=tenant,
            business=business,
            voucher_type=VoucherType.TRANSFER,
            voucher_number=data.get("voucher_number")
            or self._next_number(business=business, voucher_type=VoucherType.TRANSFER),
            voucher_date=data.get("voucher_date") or timezone.localdate(),
            status=VoucherStatus.CONFIRMED,
            cash_account=from_account,
            contra_account=to_account,
            currency=data.get("currency") or business.currency or "INR",
            subtotal=amount,
            total=amount,
            amount_paid=amount,
            notes=str(data.get("notes") or ""),
            metadata=data.get("metadata") or {},
        )
        self._adjust_cash_balance(account=from_account, delta=-amount)
        self._adjust_cash_balance(account=to_account, delta=amount)
        return voucher

    # ------------------------------------------------------------------
    # Void
    # ------------------------------------------------------------------
    @transaction.atomic
    def void_voucher(
        self, *, tenant: Tenant, business: Business, voucher: ShopBooksVoucher
    ) -> ShopBooksVoucher:
        locked = (
            ShopBooksVoucher.objects.select_for_update()
            .filter(tenant=tenant, business=business, id=voucher.id)
            .first()
        )
        if locked is None:
            raise ValidationError({"voucher": "Voucher not found."})
        if locked.status == VoucherStatus.VOID:
            return locked
        if locked.status != VoucherStatus.CONFIRMED:
            raise ValidationError({"status": "Only confirmed vouchers can be voided."})

        vtype = locked.voucher_type
        if vtype == VoucherType.SALE:
            self._apply_stock_movements(
                tenant=tenant,
                business=business,
                voucher=locked,
                direction=1,
                movement_type=StockMovementType.RETURN,
            )
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.CUSTOMER,
                customer=locked.customer,
                entry_type=LedgerEntryType.ADJUSTMENT,
                amount=locked.total,
                direction=LedgerDirection.CREDIT,
                voucher=locked,
                notes=f"Void {locked.voucher_number}",
            )
            if locked.amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.CUSTOMER,
                    customer=locked.customer,
                    entry_type=LedgerEntryType.ADJUSTMENT,
                    amount=locked.amount_paid,
                    direction=LedgerDirection.DEBIT,
                    voucher=locked,
                    notes=f"Void payment {locked.voucher_number}",
                )
                self._adjust_cash_balance(account=locked.cash_account, delta=-locked.amount_paid)
        elif vtype == VoucherType.PURCHASE:
            try:
                self._apply_stock_movements(
                    tenant=tenant,
                    business=business,
                    voucher=locked,
                    direction=-1,
                    movement_type=StockMovementType.ADJUST,
                )
            except ValidationError:
                # Stock already sold/consumed — proceed with the financial reversal regardless.
                pass
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.SUPPLIER,
                supplier=locked.supplier,
                entry_type=LedgerEntryType.ADJUSTMENT,
                amount=locked.total,
                direction=LedgerDirection.DEBIT,
                voucher=locked,
                notes=f"Void {locked.voucher_number}",
            )
            if locked.amount_paid > 0:
                self._record_ledger(
                    tenant=tenant,
                    business=business,
                    party_kind=PartyKind.SUPPLIER,
                    supplier=locked.supplier,
                    entry_type=LedgerEntryType.ADJUSTMENT,
                    amount=locked.amount_paid,
                    direction=LedgerDirection.CREDIT,
                    voucher=locked,
                    notes=f"Void payment {locked.voucher_number}",
                )
                self._adjust_cash_balance(account=locked.cash_account, delta=locked.amount_paid)
        elif vtype == VoucherType.PAYMENT_IN:
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.CUSTOMER,
                customer=locked.customer,
                entry_type=LedgerEntryType.ADJUSTMENT,
                amount=locked.total,
                direction=LedgerDirection.DEBIT,
                voucher=locked,
                notes=f"Void {locked.voucher_number}",
            )
            self._adjust_cash_balance(account=locked.cash_account, delta=-locked.total)
        elif vtype == VoucherType.PAYMENT_OUT:
            self._record_ledger(
                tenant=tenant,
                business=business,
                party_kind=PartyKind.SUPPLIER,
                supplier=locked.supplier,
                entry_type=LedgerEntryType.ADJUSTMENT,
                amount=locked.total,
                direction=LedgerDirection.CREDIT,
                voucher=locked,
                notes=f"Void {locked.voucher_number}",
            )
            self._adjust_cash_balance(account=locked.cash_account, delta=locked.total)
        elif vtype == VoucherType.EXPENSE:
            self._adjust_cash_balance(account=locked.cash_account, delta=locked.total)
        elif vtype == VoucherType.OTHER_INCOME:
            self._adjust_cash_balance(account=locked.cash_account, delta=-locked.total)
        elif vtype == VoucherType.TRANSFER:
            self._adjust_cash_balance(account=locked.cash_account, delta=locked.total)
            self._adjust_cash_balance(account=locked.contra_account, delta=-locked.total)

        locked.status = VoucherStatus.VOID
        locked.save(update_fields=["status", "updated_at", "version"])
        self._refund_sale_loyalty(voucher=locked)
        return locked

    # ------------------------------------------------------------------
    # Listing / lookups
    # ------------------------------------------------------------------
    def list_vouchers(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher_type: str | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        customer_id: UUID | None = None,
        supplier_id: UUID | None = None,
    ) -> QuerySet[ShopBooksVoucher]:
        qs = (
            ShopBooksVoucher.objects.filter(tenant=tenant, business=business)
            .select_related("customer", "supplier", "cash_account", "contra_account")
            .order_by("-voucher_date", "-created_at")
        )
        if voucher_type:
            qs = qs.filter(voucher_type=voucher_type)
        if status:
            qs = qs.filter(status=status)
        if date_from:
            qs = qs.filter(voucher_date__gte=date_from)
        if date_to:
            qs = qs.filter(voucher_date__lte=date_to)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        return qs

    def _apply_sale_loyalty(
        self,
        *,
        tenant: Tenant,
        business: Business,
        voucher: ShopBooksVoucher,
        customer: Customer | None,
        linked_order: Any,
        points_to_redeem: int,
        eligible_amount: Decimal,
        status: str,
    ) -> None:
        if linked_order is not None or customer is None:
            return
        # Booking completion already awards/redeems loyalty against the booking ledger.
        # Do not also apply shop spend-based earn/redeem on the books sale.
        meta = voucher.metadata if isinstance(voucher.metadata, dict) else {}
        if meta.get("source_booking_id") or str(meta.get("source") or "") == "booking":
            return
        from apps.customers.services.loyalty import LoyaltyService

        loyalty = LoyaltyService()
        snapshot = None
        if int(points_to_redeem or 0) > 0:
            snapshot = loyalty.redeem_for_voucher(
                tenant=tenant,
                business=business,
                customer=customer,
                voucher_id=voucher.id,
                amount=eligible_amount,
                points_to_redeem=int(points_to_redeem),
            )
            metadata = dict(voucher.metadata or {})
            metadata["loyalty"] = snapshot
            voucher.metadata = metadata
            voucher.save(update_fields=["metadata", "updated_at", "version"])
        if status == VoucherStatus.CONFIRMED:
            earned = int(
                loyalty.award_for_voucher(
                    tenant=tenant,
                    business=business,
                    customer=customer,
                    voucher_id=voucher.id,
                    amount=voucher.total,
                    voucher_number=voucher.voucher_number,
                )
                or 0
            )
            if earned > 0:
                metadata = dict(voucher.metadata or {})
                snap = dict(metadata.get("loyalty") or {}) if isinstance(metadata.get("loyalty"), dict) else {}
                snap["points_earned"] = earned
                metadata["loyalty"] = snap
                billing = dict(metadata.get("billing") or {}) if isinstance(metadata.get("billing"), dict) else {}
                billing["points_earned"] = earned
                metadata["billing"] = billing
                voucher.metadata = metadata
                voucher.save(update_fields=["metadata", "updated_at", "version"])

    def _refund_sale_loyalty(self, *, voucher: ShopBooksVoucher) -> None:
        if voucher.voucher_type != VoucherType.SALE:
            return
        if voucher.customer_id is None:
            return
        try:
            from apps.customers.services.loyalty import LoyaltyService

            loyalty = LoyaltyService()
            # POS / online sales post earn+redeem on the order ledger — reverse there.
            if voucher.linked_order_id is not None:
                order = voucher.linked_order
                if order is None or order.customer_id is None:
                    return
                order_loyalty = (
                    (order.metadata or {}).get("loyalty")
                    if isinstance(order.metadata, dict)
                    else {}
                )
                points_redeemed = int((order_loyalty or {}).get("points_redeemed") or 0)
                loyalty.refund_for_order(
                    tenant=voucher.tenant,
                    business=voucher.business,
                    customer=order.customer,
                    order_id=order.id,
                    points_redeemed=points_redeemed,
                )
                meta = dict(order.metadata or {})
                snap = dict(meta.get("loyalty") or {}) if isinstance(meta.get("loyalty"), dict) else {}
                earned = int(snap.get("points_earned") or 0)
                if earned > 0:
                    snap["points_revoked"] = int(snap.get("points_revoked") or 0) + earned
                    snap["points_earned"] = 0
                snap["refunded"] = True
                meta["loyalty"] = snap
                order.metadata = meta
                order.save(update_fields=["metadata", "updated_at", "version"])
                return

            loyalty_meta = (
                (voucher.metadata or {}).get("loyalty") if isinstance(voucher.metadata, dict) else {}
            )
            points_redeemed = int((loyalty_meta or {}).get("points_redeemed") or 0)
            loyalty.refund_for_voucher(
                tenant=voucher.tenant,
                business=voucher.business,
                customer=voucher.customer,
                voucher_id=voucher.id,
                points_redeemed=points_redeemed,
            )
        except Exception:
            return

    def get_voucher(
        self, *, tenant: Tenant, business: Business, voucher_id: UUID
    ) -> ShopBooksVoucher:
        return (
            ShopBooksVoucher.objects.filter(tenant=tenant, business=business, id=voucher_id)
            .select_related("customer", "supplier", "cash_account", "contra_account")
            .get()
        )

    # ------------------------------------------------------------------
    # Dashboard / statements
    # ------------------------------------------------------------------
    def get_dashboard_metrics(self, *, tenant: Tenant, business: Business) -> dict[str, Any]:
        accounts = ShopCashAccount.objects.filter(tenant=tenant, business=business, is_active=True)
        balance_sum = Sum("current_balance")
        cash_agg = accounts.filter(account_type=CashAccountType.CASH).aggregate(total=balance_sum)
        bank_agg = accounts.filter(account_type=CashAccountType.BANK).aggregate(total=balance_sum)
        cash = cash_agg["total"] or Decimal("0.00")
        bank = bank_agg["total"] or Decimal("0.00")

        to_collect = self._outstanding_total(
            tenant=tenant, business=business, party_kind=PartyKind.CUSTOMER
        )
        to_pay = self._outstanding_total(
            tenant=tenant, business=business, party_kind=PartyKind.SUPPLIER
        )

        return {
            "cash": str(_q(cash)),
            "bank": str(_q(bank)),
            "to_collect": str(_q(to_collect)),
            "to_pay": str(_q(to_pay)),
            "accounts": [
                {
                    "id": str(account.id),
                    "name": account.name,
                    "account_type": account.account_type,
                    "current_balance": str(account.current_balance),
                }
                for account in accounts.order_by("name")
            ],
        }

    def _outstanding_total(self, *, tenant: Tenant, business: Business, party_kind: str) -> Decimal:
        id_field = "customer_id" if party_kind == PartyKind.CUSTOMER else "supplier_id"
        entries = (
            ShopPartyLedgerEntry.objects.filter(
                tenant=tenant, business=business, party_kind=party_kind
            )
            .exclude(**{f"{id_field}__isnull": True})
            .order_by(id_field, "-created_at", "-id")
        )
        seen: set[str] = set()
        total = Decimal("0.00")
        for entry in entries:
            key = str(getattr(entry, id_field))
            if key in seen:
                continue
            seen.add(key)
            if entry.balance_after > 0:
                total += entry.balance_after
        return total

    def party_statement(
        self,
        *,
        tenant: Tenant,
        business: Business,
        party_kind: str,
        party_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        filters: dict[str, Any] = dict(tenant=tenant, business=business, party_kind=party_kind)
        if party_kind == PartyKind.CUSTOMER:
            party = Customer.objects.filter(tenant=tenant, business=business, id=party_id).first()
            filters["customer_id"] = party_id
        else:
            party = ShopSupplier.objects.filter(
                tenant=tenant, business=business, id=party_id
            ).first()
            filters["supplier_id"] = party_id
        if party is None:
            raise ValidationError({"party_id": "Party not found."})

        qs = ShopPartyLedgerEntry.objects.filter(**filters).order_by("created_at", "id")
        opening_balance = Decimal("0.00")
        if party_kind == PartyKind.SUPPLIER:
            opening_balance = _q(getattr(party, "opening_balance", 0))

        if date_from is not None:
            prior = qs.filter(created_at__date__lt=date_from).order_by("-created_at", "-id").first()
            if prior is not None:
                opening_balance = _q(prior.balance_after)
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to is not None:
            qs = qs.filter(created_at__date__lte=date_to)

        entries = list(qs)
        closing_balance = entries[-1].balance_after if entries else opening_balance

        party_name = getattr(party, "name", None) or getattr(party, "display_name", "")
        return {
            "party_kind": party_kind,
            "party_id": str(party_id),
            "party_name": party_name,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "opening_balance": str(opening_balance),
            "closing_balance": str(_q(closing_balance)),
            "entries": entries,
        }

    # ------------------------------------------------------------------
    # Bridges: quotations / POS orders
    # ------------------------------------------------------------------
    @transaction.atomic
    def convert_quotation_to_sale(
        self,
        *,
        tenant: Tenant,
        business: Business,
        quotation: ShopQuotation,
        data: dict[str, Any] | None = None,
    ) -> ShopBooksVoucher:
        if quotation.status == QuotationStatus.CONVERTED:
            raise ValidationError({"status": "Quotation has already been converted."})
        extra = data or {}
        lines = [
            {
                "product_id": row.get("product_id"),
                "name": row.get("name"),
                "qty": row.get("quantity"),
                "rate": row.get("unit_price"),
                "gst_rate": row.get("tax_rate"),
                "discount": 0,
            }
            for row in quotation.line_items or []
        ]
        voucher = self.create_sale_voucher(
            tenant=tenant,
            business=business,
            data={
                "customer": quotation.customer,
                "lines": lines,
                "voucher_date": extra.get("voucher_date") or timezone.localdate(),
                "notes": (
                    extra.get("notes") or f"Converted from quotation {quotation.quotation_number}"
                ),
                "amount_paid": extra.get("amount_paid") or 0,
                "cash_account_id": extra.get("cash_account_id"),
                "is_interstate": extra.get("is_interstate", False),
                "place_of_supply": extra.get("place_of_supply") or "",
                "metadata": {"source_quotation_id": str(quotation.id)},
            },
        )
        quotation.status = QuotationStatus.CONVERTED
        quotation.metadata = {**(quotation.metadata or {}), "books_voucher_id": str(voucher.id)}
        quotation.save(update_fields=["status", "metadata", "updated_at", "version"])
        return voucher

    @transaction.atomic
    def create_sale_from_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        cash_account_id: UUID | str | None = None,
    ) -> ShopBooksVoucher:
        existing = ShopBooksVoucher.objects.filter(
            tenant=tenant, business=business, linked_order=order
        ).first()
        if existing is not None:
            return self._repair_sale_amount_paid_from_order(voucher=existing, order=order)

        if order.status not in {OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED}:
            raise ValidationError(
                {"order": "Only confirmed/ready/completed orders can be posted to books."}
            )

        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        pos = metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}
        payment_method = str(pos.get("payment_method") or "").strip().lower()
        payment_status = str(pos.get("payment_status") or "").lower()
        # Prefer explicit till amount (supports partial payments).
        if pos.get("amount_paid") not in (None, ""):
            amount_paid = Decimal(str(pos.get("amount_paid") or "0"))
        elif payment_status in {"paid", "settled"}:
            amount_paid = order.total
        elif payment_method == "borrow":
            amount_paid = Decimal("0.00")
        elif (
            str(order.fulfillment_mode or "").lower() == "pos"
            and payment_method in {"cash", "upi", "card"}
        ):
            # Counter till payment — treat as collected even if metadata was incomplete.
            amount_paid = order.total
        else:
            amount_paid = Decimal("0.00")

        lines = [
            self._books_line_from_order_line(line)
            for line in order.lines.select_related("product").all()
        ]
        if not lines:
            raise ValidationError({"order": "Order has no line items to post."})

        resolved_cash_id = cash_account_id
        if amount_paid > 0 and not resolved_cash_id:
            resolved_cash_id = self._ensure_cash_account(tenant=tenant, business=business).id

        customer_gstin = str(
            metadata.get("customer_gstin")
            or (getattr(order.customer, "gstin", None) if order.customer_id else "")
            or ""
        ).strip().upper()
        customer_name = str(
            metadata.get("customer_name")
            or (
                order.customer.display_name
                if order.customer_id and order.customer
                else "Walk-in / B2C"
            )
        )
        delivery_state = str(metadata.get("delivery_state") or "").strip()
        gst_meta = metadata.get("gst") if isinstance(metadata.get("gst"), dict) else {}
        from apps.shopie.services.gst import resolve_sale_supply

        supply = resolve_sale_supply(
            business=business,
            customer_gstin=customer_gstin or str(gst_meta.get("customer_gstin") or ""),
            delivery_state=delivery_state,
            place_of_supply=str(gst_meta.get("place_of_supply") or ""),
        )
        amount_due = max(Decimal("0.00"), _q(order.total) - _q(amount_paid))
        payment_status = str(pos.get("payment_status") or "").strip().lower()
        if not payment_status:
            if amount_due <= 0:
                payment_status = "paid"
            elif amount_paid > 0:
                payment_status = "partially_paid"
            else:
                payment_status = "due"
        order_loyalty = metadata.get("loyalty") if isinstance(metadata.get("loyalty"), dict) else None
        reward_discount = _q((order_loyalty or {}).get("discount_amount") or "0")
        coupon_meta = metadata.get("coupon") if isinstance(metadata.get("coupon"), dict) else None
        coupon_discount = _q((coupon_meta or {}).get("discount_amount") or "0")
        combined_bill = _q(pos.get("bill_discount_amount") or "0")
        # Manual bill discount only. Coupons are stored under metadata.coupon — when a
        # coupon is present, older orders may have duplicated the amount into bill_*.
        if coupon_meta:
            bill_discount_only = Decimal("0.00")
        else:
            bill_discount_only = max(Decimal("0.00"), combined_bill - reward_discount)
        order_lines = list(order.lines.all())
        line_discount_total = _q(pos.get("line_discount_total") or "0")
        if line_discount_total <= 0:
            line_discount_total = sum(
                (_q(line.discount_amount) for line in order_lines),
                Decimal("0.00"),
            ).quantize(Decimal("0.01"))
        merchandise_gross = sum(
            (_q(line.unit_price) * _q(line.quantity) for line in order_lines),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))
        # Prefer the actual inclusive fold when coupon meta disagrees with shelf math.
        if coupon_meta and merchandise_gross > 0:
            line_total_sum = sum(
                (_q(line.line_total) for line in order_lines),
                Decimal("0.00"),
            ).quantize(Decimal("0.01"))
            actual_save = max(Decimal("0.00"), merchandise_gross - line_total_sum)
            coupon_from_actual = max(
                Decimal("0.00"),
                actual_save - line_discount_total - reward_discount,
            )
            if coupon_from_actual > 0:
                coupon_discount = coupon_from_actual
                coupon_meta = {**coupon_meta, "discount_amount": str(coupon_discount)}
        voucher_meta: dict[str, Any] = {
            "source_order_id": str(order.id),
            "source": "sale",
            "customer_name": customer_name,
            "gst": dict(supply),
            "payment": {
                "method": payment_method,
                "status": payment_status,
                "amount_paid": str(_q(amount_paid)),
                "amount_due": str(_q(amount_due)),
            },
            "billing": {
                "merchandise_gross": str(_q(merchandise_gross)),
                "line_discount_total": str(line_discount_total),
                "bill_discount_type": "" if coupon_meta else str(pos.get("bill_discount_type") or ""),
                "bill_discount_value": "0" if coupon_meta else str(pos.get("bill_discount_value") or "0"),
                "bill_discount_amount": str(bill_discount_only),
                "coupon_discount": str(coupon_discount),
                "reward_discount": str(reward_discount),
                "reward_points": int((order_loyalty or {}).get("points_redeemed") or 0),
                "points_earned": int((order_loyalty or {}).get("points_earned") or 0),
                "points_to_earn": int(pos.get("points_to_earn") or 0),
                "award_loyalty_points": pos.get("award_loyalty_points") is not False,
                "taxable_value": str(_q(order.subtotal)),
                "tax_total": str(_q(order.tax_total)),
                "total": str(_q(order.total)),
            },
        }
        if supply["customer_gstin"]:
            voucher_meta["customer_gstin"] = supply["customer_gstin"]
        if order_loyalty:
            voucher_meta["loyalty"] = dict(order_loyalty)
        if coupon_meta:
            voucher_meta["coupon"] = coupon_meta

        pay_note = ""
        if payment_method:
            pay_note = f" · {payment_method.upper()}"
        if amount_due > 0 and amount_paid > 0:
            pay_note += f" · paid {_q(amount_paid)} · due {_q(amount_due)}"
        elif amount_due > 0:
            pay_note += f" · due {_q(amount_due)}"

        voucher = self.create_sale_voucher(
            tenant=tenant,
            business=business,
            data={
                "customer": order.customer,
                "lines": lines,
                "voucher_date": order.created_at.date(),
                "notes": f"Sale {order.order_number}{pay_note}",
                "amount_paid": amount_paid,
                "cash_account_id": resolved_cash_id,
                "linked_order": order,
                "adjust_stock": False,
                "is_interstate": supply["is_interstate"],
                "place_of_supply": supply["place_of_supply"],
                "metadata": voucher_meta,
            },
        )
        return voucher

    @staticmethod
    def books_voucher_for_booking(*, tenant: Tenant, business: Business, booking_id: Any) -> ShopBooksVoucher | None:
        return (
            ShopBooksVoucher.objects.filter(
                tenant=tenant,
                business=business,
                voucher_type=VoucherType.SALE,
                metadata__source_booking_id=str(booking_id),
            )
            .order_by("-created_at")
            .first()
        )

    def _service_pricing_for_books(self, *, tenant: Tenant, service_id: Any):
        from apps.services.models import ServicePricing

        if not service_id:
            return None
        pricing = (
            ServicePricing.objects.require_tenant(tenant)
            .filter(service_id=service_id, is_default=True)
            .order_by("-created_at")
            .first()
        )
        if pricing is None:
            pricing = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service_id=service_id)
                .order_by("-created_at")
                .first()
            )
        return pricing

    def _books_line_from_booking_item(self, *, tenant: Tenant, item: Any) -> dict[str, Any]:
        from apps.services.models import Service, TaxConfiguration

        service_id = getattr(item, "service_id", None)
        service = (
            Service.objects.require_tenant(tenant).filter(id=service_id).first()
            if service_id
            else None
        )
        rate = _q(getattr(item, "price_snapshot", None) or "0")
        name = ""
        if service is not None:
            name = service.display_name or service.name
        if not name:
            name = "Service"
        tax_rate = Decimal("0")
        hsn_sac = ""
        tax_inclusive = False
        pricing = self._service_pricing_for_books(tenant=tenant, service_id=service_id)
        # Older / migrated line items often have price_snapshot=0 — use catalog price.
        if rate <= 0 and pricing is not None:
            if pricing.sale_price is not None:
                rate = _q(pricing.sale_price)
            else:
                rate = _q(pricing.base_price)
        if pricing is not None:
            tax_inclusive = bool(pricing.tax_inclusive)
        if service is not None:
            tax = (
                TaxConfiguration.objects.require_tenant(tenant)
                .filter(service=service, is_active_tax=True)
                .order_by("-updated_at")
                .first()
            )
            if tax is not None:
                tax_rate = _q(tax.tax_rate)
                hsn_sac = str(tax.tax_identifier or "").strip()
            meta = service.metadata if isinstance(service.metadata, dict) else {}
            if not hsn_sac:
                hsn_sac = str(meta.get("hsn_sac") or meta.get("hsn") or meta.get("sac") or "").strip()
        return {
            "name": name,
            "qty": Decimal("1"),
            "rate": rate,
            "discount": Decimal("0.00"),
            "gst_rate": tax_rate,
            "tax_inclusive": tax_inclusive,
            "hsn_sac": hsn_sac,
        }

    def resolve_booking_payment_split(
        self,
        *,
        total: Decimal,
        payment_method: str,
        amount_paid: Decimal | str | int | float | None,
        customer: Any | None,
    ) -> tuple[Decimal, Decimal, str]:
        """POS-style paid/due split for booking completion (cash/upi/card/borrow)."""
        bill = _q(total)
        method = str(payment_method or "").strip().lower()
        if method == "borrow":
            default_paid = Decimal("0.00")
        elif method in {"cash", "upi", "card"}:
            default_paid = bill
        else:
            raise ValidationError(
                {"payment_method": "payment_method must be cash, upi, card, or borrow."}
            )

        if amount_paid is None or amount_paid == "":
            paid = default_paid
        else:
            paid = _q(amount_paid)
        if paid < 0:
            raise ValidationError({"amount_paid": "Amount paid cannot be negative."})
        if paid > bill:
            raise ValidationError({"amount_paid": "Amount paid cannot exceed the bill total."})

        due = (bill - paid).quantize(Decimal("0.01"))
        if due > 0 and customer is None:
            raise ValidationError(
                {
                    "customer_id": (
                        "A customer is required when the booking bill is not fully paid "
                        "(partial payment or credit)."
                    )
                }
            )
        if due <= 0:
            return paid, Decimal("0.00"), "paid"
        if paid > 0:
            return paid, due, "partially_paid"
        return paid, due, "due"

    def preview_booking_sale_total(
        self,
        *,
        tenant: Tenant,
        business: Business,
        booking: Any,
    ) -> Decimal:
        """Invoice total for a booking (same line/GST math as create_sale_from_booking)."""
        lines, _reward, supply = self._booking_sale_lines_and_supply(
            tenant=tenant, business=business, booking=booking
        )
        resolved_preview = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        preview_totals = compute_voucher_totals(
            resolved_preview, interstate=bool(supply["is_interstate"])
        )
        return _q(preview_totals.get("total"))

    def _booking_sale_lines_and_supply(
        self,
        *,
        tenant: Tenant,
        business: Business,
        booking: Any,
    ) -> tuple[list[dict[str, Any]], Decimal, dict[str, Any]]:
        line_items = list(booking.line_items.order_by("sort_order", "start_at"))
        if line_items:
            lines = [self._books_line_from_booking_item(tenant=tenant, item=item) for item in line_items]
        else:

            class _Pseudo:
                service_id = booking.service_id
                price_snapshot = Decimal("0.00")

            lines = [self._books_line_from_booking_item(tenant=tenant, item=_Pseudo())]

        if not lines or all(_q(row.get("rate")) <= 0 for row in lines):
            raise ValidationError({"booking": "Booking has no priced services to invoice."})

        metadata = booking.metadata if isinstance(getattr(booking, "metadata", None), dict) else {}
        loyalty_meta = metadata.get("loyalty") if isinstance(metadata.get("loyalty"), dict) else {}
        reward_discount = _q(loyalty_meta.get("discount_amount") or "0")
        if loyalty_meta.get("refunded"):
            reward_discount = Decimal("0.00")
        if reward_discount > 0 and lines:
            lines[0]["discount"] = _q(lines[0].get("discount") or 0) + reward_discount

        customer = None
        if getattr(booking, "customer_id", None):
            customer = (
                Customer.objects.require_tenant(tenant)
                .filter(id=booking.customer_id, business=business)
                .first()
            )

        from apps.shopie.services.gst import resolve_sale_supply

        customer_gstin = str(
            getattr(customer, "gstin", None) if customer is not None else ""
        ).strip().upper()
        supply = resolve_sale_supply(
            business=business,
            customer_gstin=customer_gstin,
            delivery_state="",
            place_of_supply="",
        )
        return lines, reward_discount, supply

    @transaction.atomic
    def create_sale_from_booking(
        self,
        *,
        tenant: Tenant,
        business: Business,
        booking: Any,
        cash_account_id: UUID | str | None = None,
    ) -> ShopBooksVoucher:
        """Post a completed booking as a Books sale (GST tax invoice), idempotent per booking."""
        from apps.bookings.models import BookingStatus

        existing = self.books_voucher_for_booking(
            tenant=tenant, business=business, booking_id=booking.id
        )
        if existing is not None:
            return existing

        if str(getattr(booking, "status", "") or "") != BookingStatus.COMPLETED:
            raise ValidationError({"booking": "Only completed bookings can be posted to books."})

        lines, reward_discount, supply = self._booking_sale_lines_and_supply(
            tenant=tenant, business=business, booking=booking
        )

        metadata = booking.metadata if isinstance(getattr(booking, "metadata", None), dict) else {}
        loyalty_meta = metadata.get("loyalty") if isinstance(metadata.get("loyalty"), dict) else {}
        payment_meta = metadata.get("payment") if isinstance(metadata.get("payment"), dict) else {}

        from apps.customers.services.loyalty import LoyaltyService

        loyalty_svc = LoyaltyService()
        booking_earn = int(
            loyalty_svc.credited_earn_for_booking(tenant=tenant, booking_id=booking.id)
            or loyalty_svc.expected_earn_for_booking(
                tenant=tenant, business=business, booking=booking
            )
            or 0
        )

        customer = None
        if getattr(booking, "customer_id", None):
            customer = (
                Customer.objects.require_tenant(tenant)
                .filter(id=booking.customer_id, business=business)
                .first()
            )

        resolved_preview = [
            self._resolve_line(tenant=tenant, business=business, raw=row) for row in lines
        ]
        preview_totals = compute_voucher_totals(
            resolved_preview, interstate=bool(supply["is_interstate"])
        )
        bill_total = _q(preview_totals["total"])

        # Prefer stamped completion payment (POS-style); legacy completes fall back to full paid.
        method = str(payment_meta.get("method") or metadata.get("payment_mode") or "pay_at_venue").strip().lower()
        if payment_meta.get("amount_paid") not in (None, ""):
            amount_paid = _q(payment_meta.get("amount_paid"))
            amount_due = _q(payment_meta.get("amount_due") or max(Decimal("0.00"), bill_total - amount_paid))
            pay_status = str(payment_meta.get("status") or ("paid" if amount_due <= 0 else "partially_paid" if amount_paid > 0 else "due"))
        else:
            amount_paid = bill_total
            amount_due = Decimal("0.00")
            pay_status = "paid"

        if amount_paid > bill_total:
            amount_paid = bill_total
            amount_due = Decimal("0.00")
            pay_status = "paid"

        resolved_cash_id = cash_account_id or payment_meta.get("cash_account_id")
        if amount_paid > 0 and not resolved_cash_id:
            resolved_cash_id = self._ensure_cash_account(tenant=tenant, business=business).id
        if amount_paid <= 0:
            resolved_cash_id = None

        customer_name = (
            customer.display_name
            if customer is not None and getattr(customer, "display_name", None)
            else "Customer"
        )
        voucher_loyalty = dict(loyalty_meta) if loyalty_meta else {}
        if booking_earn > 0:
            voucher_loyalty["points_earned"] = booking_earn
        method_label = {
            "cash": "cash",
            "upi": "UPI",
            "card": "card",
            "borrow": "credit",
        }.get(method, method or "pay at venue")
        voucher_meta: dict[str, Any] = {
            "source_booking_id": str(booking.id),
            "source": "booking",
            "customer_name": customer_name,
            "gst": dict(supply),
            "payment": {
                "method": method,
                "status": pay_status,
                "amount_paid": str(amount_paid),
                "amount_due": str(amount_due),
            },
            "billing": {
                "reward_discount": str(reward_discount),
                "reward_points": int(loyalty_meta.get("points_redeemed") or 0),
                "points_earned": booking_earn,
                "points_to_earn": booking_earn,
                "taxable_value": str(_q(preview_totals.get("subtotal"))),
                "tax_total": str(_q(preview_totals.get("tax_total"))),
                "total": str(bill_total),
            },
        }
        if supply["customer_gstin"]:
            voucher_meta["customer_gstin"] = supply["customer_gstin"]
        if voucher_loyalty:
            voucher_meta["loyalty"] = voucher_loyalty

        booking_number = str(getattr(booking, "booking_number", "") or booking.id)
        voucher = self.create_sale_voucher(
            tenant=tenant,
            business=business,
            data={
                "customer": customer,
                "lines": lines,
                "voucher_date": getattr(booking, "appointment_date", None) or timezone.localdate(),
                "notes": f"Booking {booking_number} · {method_label}",
                "amount_paid": amount_paid,
                "cash_account_id": resolved_cash_id,
                "adjust_stock": False,
                "is_interstate": supply["is_interstate"],
                "place_of_supply": supply["place_of_supply"],
                "metadata": voucher_meta,
            },
        )
        return voucher

    def _expected_amount_paid_from_order(self, order: ShopOrder) -> Decimal:
        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        pos = metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {}
        payment_method = str(pos.get("payment_method") or "").strip().lower()
        payment_status = str(pos.get("payment_status") or "").lower()
        # Prefer explicit amount_paid (kept in sync after returns / settlements).
        if pos.get("amount_paid") not in (None, ""):
            return _q(pos.get("amount_paid") or "0")
        if payment_status in {"paid", "settled"}:
            return _q(order.total)
        if payment_method == "borrow":
            return Decimal("0.00")
        if (
            str(order.fulfillment_mode or "").lower() == "pos"
            and payment_method in {"cash", "upi", "card"}
        ):
            return _q(order.total)
        return Decimal("0.00")

    def _repair_sale_amount_paid_from_order(
        self, *, voucher: ShopBooksVoucher, order: ShopOrder
    ) -> ShopBooksVoucher:
        """Fix vouchers that were posted before POS cash/UPI/card was marked paid."""
        expected = self._expected_amount_paid_from_order(order)
        current = _q(voucher.amount_paid or 0)
        if expected == current:
            return voucher
        # Only auto-correct unpaid→paid for till payments (avoid clobbering partial payments).
        if current == 0 and expected > 0:
            cash_account = voucher.cash_account
            if cash_account is None:
                cash_account = self._ensure_cash_account(
                    tenant=voucher.tenant, business=voucher.business
                )
                voucher.cash_account = cash_account
            delta = expected - current
            voucher.amount_paid = expected
            voucher.save(update_fields=["amount_paid", "cash_account", "updated_at", "version"])
            if delta > 0 and cash_account is not None:
                self._adjust_cash_balance(account=cash_account, delta=delta)
                self._record_ledger(
                    tenant=voucher.tenant,
                    business=voucher.business,
                    party_kind=PartyKind.CUSTOMER,
                    customer=voucher.customer,
                    entry_type=LedgerEntryType.PAYMENT_IN,
                    amount=delta,
                    direction=LedgerDirection.CREDIT,
                    voucher=voucher,
                    notes=f"Payment repair {voucher.voucher_number}",
                )
        return voucher

    def repair_unpaid_pos_sale_vouchers(self, *, tenant: Tenant, business: Business) -> int:
        """Correct sale vouchers linked to paid POS orders that still show amount_paid=0."""
        qs = (
            ShopBooksVoucher.objects.filter(
                tenant=tenant,
                business=business,
                voucher_type=VoucherType.SALE,
                amount_paid=0,
                linked_order__isnull=False,
            )
            .exclude(status=VoucherStatus.VOID)
            .select_related("linked_order", "cash_account", "customer")[:80]
        )
        fixed = 0
        for voucher in qs:
            order = voucher.linked_order
            if order is None:
                continue
            before = _q(voucher.amount_paid or 0)
            repaired = self._repair_sale_amount_paid_from_order(voucher=voucher, order=order)
            if _q(repaired.amount_paid or 0) != before:
                fixed += 1
        return fixed

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------
    def _date_range(self, *, date_from: date | None, date_to: date | None):
        qs_filter: dict[str, Any] = {}
        if date_from:
            qs_filter["voucher_date__gte"] = date_from
        if date_to:
            qs_filter["voucher_date__lte"] = date_to
        return qs_filter

    def _net_summary(
        self,
        *,
        tenant: Tenant,
        business: Business,
        primary_type: str,
        adjustment_type: str,
        date_from: date | None,
        date_to: date | None,
    ) -> dict[str, Any]:
        """Aggregate a register while subtracting its return/note vouchers."""
        filters = self._date_range(date_from=date_from, date_to=date_to)
        qs = ShopBooksVoucher.objects.filter(
            tenant=tenant,
            business=business,
            status=VoucherStatus.CONFIRMED,
            voucher_type__in=[primary_type, adjustment_type],
            **filters,
        )

        def _totals(voucher_type: str) -> dict[str, Decimal]:
            aggregate = qs.filter(voucher_type=voucher_type).aggregate(
                taxable=Sum("subtotal"),
                cgst=Sum("cgst_total"),
                sgst=Sum("sgst_total"),
                igst=Sum("igst_total"),
                tax=Sum("tax_total"),
                total=Sum("total"),
            )
            return {key: _q(value) for key, value in aggregate.items()}

        primary = _totals(primary_type)
        adjustment = _totals(adjustment_type)

        def _net(key: str) -> str:
            return str(_q(primary[key] - adjustment[key]))

        return {
            "count": qs.count(),
            "adjustment_count": qs.filter(voucher_type=adjustment_type).count(),
            "taxable_value": _net("taxable"),
            "cgst": _net("cgst"),
            "sgst": _net("sgst"),
            "igst": _net("igst"),
            "tax_total": _net("tax"),
            "total": _net("total"),
        }

    def sales_summary(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        return self._net_summary(
            tenant=tenant,
            business=business,
            primary_type=VoucherType.SALE,
            adjustment_type=VoucherType.CREDIT_NOTE,
            date_from=date_from,
            date_to=date_to,
        )

    def purchase_summary(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        return self._net_summary(
            tenant=tenant,
            business=business,
            primary_type=VoucherType.PURCHASE,
            adjustment_type=VoucherType.DEBIT_NOTE,
            date_from=date_from,
            date_to=date_to,
        )

    def gstr1_rows(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        filters = self._date_range(date_from=date_from, date_to=date_to)
        qs = (
            ShopBooksVoucher.objects.filter(
                tenant=tenant,
                business=business,
                status=VoucherStatus.CONFIRMED,
                voucher_type__in=[VoucherType.SALE, VoucherType.CREDIT_NOTE],
                **filters,
            )
            .select_related("customer")
            .order_by("voucher_date")
        )
        if limit is not None:
            qs = qs[offset : offset + limit]
        rows: list[dict[str, Any]] = []
        for voucher in qs:
            metadata = voucher.metadata if isinstance(voucher.metadata, dict) else {}
            gstin = str(
                metadata.get("customer_gstin")
                or (getattr(voucher.customer, "gstin", None) if voucher.customer_id else "")
                or ""
            ).strip().upper()
            customer_name = str(
                metadata.get("customer_name")
                or (
                    getattr(voucher.customer, "full_name", None)
                    or voucher.customer.display_name
                    if voucher.customer_id
                    else "Walk-in / B2C"
                )
            )
            rows.append(
                {
                    "id": str(voucher.id),
                    "voucher_type": voucher.voucher_type,
                    "voucher_number": voucher.voucher_number,
                    "voucher_date": voucher.voucher_date.isoformat(),
                    "created_at": voucher.created_at.isoformat() if voucher.created_at else None,
                    "invoice_type": "B2B" if gstin else "B2C",
                    "customer_name": customer_name,
                    "customer_gstin": gstin,
                    "place_of_supply": voucher.place_of_supply,
                    "is_interstate": voucher.is_interstate,
                    "taxable_value": str(voucher.subtotal),
                    "cgst": str(voucher.cgst_total),
                    "sgst": str(voucher.sgst_total),
                    "igst": str(voucher.igst_total),
                    "total": str(voucher.total),
                }
            )
        return rows

    def gstr3b_summary(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        sales = self.sales_summary(
            tenant=tenant, business=business, date_from=date_from, date_to=date_to
        )
        purchases = self.purchase_summary(
            tenant=tenant, business=business, date_from=date_from, date_to=date_to
        )

        def _net(head: str) -> str:
            out = Decimal(sales[head])
            inp = Decimal(purchases[head])
            return str(_q(max(out - inp, Decimal("0.00"))))

        return {
            "outward_taxable_supplies": sales["taxable_value"],
            "output_tax": {
                "cgst": sales["cgst"],
                "sgst": sales["sgst"],
                "igst": sales["igst"],
                "total": sales["tax_total"],
            },
            "inward_supplies": purchases["taxable_value"],
            "input_tax_credit": {
                "cgst": purchases["cgst"],
                "sgst": purchases["sgst"],
                "igst": purchases["igst"],
                "total": purchases["tax_total"],
            },
            "net_tax_payable": {
                "cgst": _net("cgst"),
                "sgst": _net("sgst"),
                "igst": _net("igst"),
                "total": _net("tax_total"),
            },
        }

    def daybook(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        filters = self._date_range(date_from=date_from, date_to=date_to)
        qs = (
            ShopBooksVoucher.objects.filter(tenant=tenant, business=business, **filters)
            .exclude(status=VoucherStatus.DRAFT)
            .select_related("customer", "supplier", "cash_account", "contra_account")
            .order_by("voucher_date", "created_at")
        )
        if limit is not None:
            qs = qs[offset : offset + limit]
        rows: list[dict[str, Any]] = []
        for voucher in qs:
            party = None
            party_gstin = ""
            if voucher.customer_id:
                party = voucher.customer.display_name
                party_gstin = getattr(voucher.customer, "gstin", "") or ""
            elif voucher.supplier_id:
                party = voucher.supplier.name
                party_gstin = getattr(voucher.supplier, "gstin", "") or ""
            metadata = voucher.metadata if isinstance(voucher.metadata, dict) else {}
            gstin = str(metadata.get("customer_gstin") or party_gstin or "").strip().upper()
            rows.append(
                {
                    "id": str(voucher.id),
                    "voucher_type": voucher.voucher_type,
                    "voucher_number": voucher.voucher_number,
                    "voucher_date": voucher.voucher_date.isoformat(),
                    "status": voucher.status,
                    "party": party,
                    "party_gstin": gstin,
                    "total": str(voucher.total),
                    "amount_paid": str(voucher.amount_paid),
                    "taxable_value": str(voucher.subtotal),
                    "cgst": str(voucher.cgst_total),
                    "sgst": str(voucher.sgst_total),
                    "igst": str(voucher.igst_total),
                    "tax_total": str(voucher.tax_total),
                    "place_of_supply": voucher.place_of_supply,
                    "is_interstate": voucher.is_interstate,
                    "cash_account": voucher.cash_account.name if voucher.cash_account_id else None,
                }
            )
        return rows

    def pnl_simple(
        self,
        *,
        tenant: Tenant,
        business: Business,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[str, Any]:
        filters = self._date_range(date_from=date_from, date_to=date_to)
        confirmed = dict(
            tenant=tenant, business=business, status=VoucherStatus.CONFIRMED, **filters
        )

        def _voucher_total(voucher_type: str) -> Decimal:
            agg = ShopBooksVoucher.objects.filter(voucher_type=voucher_type, **confirmed).aggregate(
                total=Sum("total")
            )
            return agg["total"] or Decimal("0.00")

        sales_total = _voucher_total(VoucherType.SALE)
        credit_notes_total = _voucher_total(VoucherType.CREDIT_NOTE)
        other_income_total = _voucher_total(VoucherType.OTHER_INCOME)
        purchase_total = _voucher_total(VoucherType.PURCHASE)
        debit_notes_total = _voucher_total(VoucherType.DEBIT_NOTE)
        expense_total = _voucher_total(VoucherType.EXPENSE)

        income = _q(sales_total - credit_notes_total + other_income_total)
        expenses = _q(purchase_total - debit_notes_total + expense_total)
        return {
            "income": {
                "sales": str(_q(sales_total)),
                "credit_notes": str(_q(credit_notes_total)),
                "other_income": str(_q(other_income_total)),
                "total": str(income),
            },
            "expenses": {
                "purchases": str(_q(purchase_total)),
                "debit_notes": str(_q(debit_notes_total)),
                "operating_expenses": str(_q(expense_total)),
                "total": str(expenses),
            },
            "net_profit": str(_q(income - expenses)),
        }
