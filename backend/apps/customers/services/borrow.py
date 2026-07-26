from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import (
    BorrowLedgerEntryType,
    Customer,
    CustomerBorrowAccount,
    CustomerBorrowLedger,
)
from apps.tenancy.models import Tenant


class BorrowService:
    def ensure_account(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
    ) -> CustomerBorrowAccount:
        account, _ = CustomerBorrowAccount.objects.get_or_create(
            tenant=tenant,
            business=business,
            customer=customer,
            defaults={
                "balance_due": Decimal("0.00"),
                "currency": getattr(business, "currency", "") or "INR",
            },
        )
        return account

    def get_balance(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
    ) -> dict[str, Any]:
        account = (
            CustomerBorrowAccount.objects.filter(
                tenant=tenant, business=business, customer=customer
            ).first()
        )
        balance = account.balance_due if account else Decimal("0.00")
        currency = (account.currency if account else None) or getattr(business, "currency", "") or "INR"
        return {
            "customer_id": str(customer.id),
            "balance_due": str(balance.quantize(Decimal("0.01"))),
            "currency": currency,
        }

    def list_ledger(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
    ) -> QuerySet[CustomerBorrowLedger]:
        return CustomerBorrowLedger.objects.filter(
            tenant=tenant,
            business=business,
            customer=customer,
        ).order_by("-created_at")

    @transaction.atomic
    def charge_from_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        order_id: UUID | str,
        order_number: str,
        amount: Decimal | str | int | float,
        currency: str = "",
    ) -> CustomerBorrowAccount:
        amount_due = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
        if amount_due <= 0:
            raise ValidationError({"amount": "Borrow charge must be greater than zero."})
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        if currency:
            account.currency = currency
        account.balance_due = (Decimal(account.balance_due) + amount_due).quantize(Decimal("0.01"))
        account.save(update_fields=["balance_due", "currency", "updated_at"])
        CustomerBorrowLedger.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            account=account,
            entry_type=BorrowLedgerEntryType.CHARGE,
            amount=amount_due,
            balance_after=account.balance_due,
            notes=f"POS borrow · {order_number}",
            order_id=order_id,
            order_number=order_number or "",
            metadata={"source": "shop_order"},
        )
        return account

    @transaction.atomic
    def record_payment(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        amount: Decimal | str | int | float,
        payment_method: str = "cash",
        notes: str = "",
        order_id: UUID | str | None = None,
    ) -> dict[str, Any]:
        pay_amount = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
        if pay_amount <= 0:
            raise ValidationError({"amount": "Payment amount must be greater than zero."})
        method = str(payment_method or "cash").strip().lower() or "cash"
        if method not in {"cash", "upi", "card"}:
            raise ValidationError({"payment_method": "Use cash, upi, or card."})

        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        balance = Decimal(account.balance_due).quantize(Decimal("0.01"))
        if pay_amount > balance:
            raise ValidationError(
                {
                    "amount": f"Payment cannot exceed outstanding borrow balance ({balance})."
                }
            )

        account.balance_due = (balance - pay_amount).quantize(Decimal("0.01"))
        account.save(update_fields=["balance_due", "updated_at"])

        entry = CustomerBorrowLedger.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            account=account,
            entry_type=BorrowLedgerEntryType.PAYMENT,
            amount=pay_amount,
            balance_after=account.balance_due,
            payment_method=method,
            notes=(notes or "").strip()[:255],
            order_id=order_id,
            order_number="",
            metadata={"recorded_at": timezone.now().isoformat()},
        )

        allocations = self._allocate_payment_to_orders(
            tenant=tenant,
            business=business,
            customer=customer,
            amount=pay_amount,
            prefer_order_id=order_id,
            payment_method=method,
            ledger_entry_id=str(entry.id),
        )
        if allocations and not entry.order_number:
            entry.order_number = allocations[0].get("order_number") or ""
            entry.metadata = {
                **(entry.metadata or {}),
                "allocations": allocations,
            }
            entry.save(update_fields=["order_number", "metadata", "updated_at"])

        return {
            "entry_id": str(entry.id),
            "amount": str(pay_amount),
            "payment_method": method,
            "balance_due": str(account.balance_due),
            "currency": account.currency or getattr(business, "currency", "") or "INR",
            "allocations": allocations,
        }

    @transaction.atomic
    def credit_from_return(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        amount: Decimal | str | int | float,
        order_id: UUID | str,
        order_number: str = "",
        return_number: str = "",
        return_id: UUID | str | None = None,
    ) -> CustomerBorrowAccount:
        """Reduce outstanding borrow when returned goods were still unpaid on the bill."""
        credit = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
        if credit <= 0:
            raise ValidationError({"amount": "Return credit must be greater than zero."})

        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        balance = Decimal(account.balance_due).quantize(Decimal("0.01"))
        applied = min(credit, balance).quantize(Decimal("0.01"))
        if applied <= 0:
            return account

        account.balance_due = (balance - applied).quantize(Decimal("0.01"))
        account.save(update_fields=["balance_due", "updated_at"])
        CustomerBorrowLedger.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            account=account,
            entry_type=BorrowLedgerEntryType.ADJUSTMENT,
            amount=applied,
            balance_after=account.balance_due,
            notes=f"Return {return_number or ''} · {order_number}".strip(" ·"),
            order_id=order_id,
            order_number=order_number or "",
            metadata={
                "source": "shop_return",
                "return_id": str(return_id) if return_id else "",
                "return_number": return_number or "",
                "requested": str(credit),
                "applied": str(applied),
            },
        )
        return account

    def _allocate_payment_to_orders(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        amount: Decimal,
        prefer_order_id: UUID | str | None,
        payment_method: str,
        ledger_entry_id: str,
    ) -> list[dict[str, Any]]:
        # Late import avoids circular dependency with shopie.
        from apps.shopie.models import ShopOrder

        remaining = amount
        allocations: list[dict[str, Any]] = []
        qs = ShopOrder.objects.filter(
            tenant=tenant,
            business=business,
            customer=customer,
        ).order_by("created_at")

        preferred = None
        if prefer_order_id:
            preferred = qs.filter(id=prefer_order_id).first()

        candidates: list[ShopOrder] = []
        if preferred is not None:
            candidates.append(preferred)
        candidates.extend([order for order in qs if preferred is None or order.id != preferred.id])

        for order in candidates:
            if remaining <= 0:
                break
            metadata = dict(order.metadata or {})
            pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
            if str(pos.get("payment_method") or "").lower() != "borrow":
                continue
            try:
                due = Decimal(str(pos.get("amount_due") if pos.get("amount_due") is not None else order.total))
            except Exception:
                due = Decimal(str(order.total or "0"))
            due = due.quantize(Decimal("0.01"))
            if due <= 0:
                continue
            applied = min(remaining, due).quantize(Decimal("0.01"))
            paid = Decimal(str(pos.get("amount_paid") or "0")).quantize(Decimal("0.01")) + applied
            new_due = (due - applied).quantize(Decimal("0.01"))
            pos["amount_paid"] = str(paid)
            pos["amount_due"] = str(new_due)
            # Keep financial progress on the bill without changing fulfillment status.
            pos["payment_status"] = "due" if new_due > 0 else "settled"
            payments = list(pos.get("payments") if isinstance(pos.get("payments"), list) else [])
            payments.append(
                {
                    "amount": str(applied),
                    "payment_method": payment_method,
                    "ledger_entry_id": ledger_entry_id,
                    "at": timezone.now().isoformat(),
                }
            )
            pos["payments"] = payments
            metadata["pos"] = pos
            order.metadata = metadata
            order.save(update_fields=["metadata", "updated_at", "version"])
            allocations.append(
                {
                    "order_id": str(order.id),
                    "order_number": order.order_number,
                    "applied": str(applied),
                    "amount_due": str(new_due),
                }
            )
            remaining = (remaining - applied).quantize(Decimal("0.01"))

        return allocations
