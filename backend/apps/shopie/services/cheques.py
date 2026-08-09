from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import (
    ChequeDirection,
    ChequeStatus,
    ShopCashAccount,
    ShopCheque,
    ShopSupplier,
)
from apps.shopie.services.books import BooksService
from apps.tenancy.models import Tenant


def _q(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


class ChequesService:
    books = BooksService()

    def list_cheques(self, *, tenant: Tenant, business: Business):
        return ShopCheque.objects.filter(tenant=tenant, business=business)

    @transaction.atomic
    def create_cheque(
        self,
        *,
        tenant: Tenant,
        business: Business,
        direction: str,
        amount: Any,
        cheque_number: str,
        bank_name: str = "",
        due_date=None,
        customer: Customer | None = None,
        supplier: ShopSupplier | None = None,
        cash_account: ShopCashAccount | None = None,
        notes: str = "",
    ) -> ShopCheque:
        direction = (direction or "").strip().lower()
        if direction not in {ChequeDirection.IN, ChequeDirection.OUT}:
            raise ValidationError({"direction": "direction must be 'in' or 'out'."})
        amt = _q(amount)
        if amt <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        cheque_number = (cheque_number or "").strip()
        if not cheque_number:
            raise ValidationError({"cheque_number": "Cheque number is required."})
        if direction == ChequeDirection.IN and customer is None:
            raise ValidationError({"customer_id": "Customer is required for cheque-in."})
        if direction == ChequeDirection.OUT and supplier is None:
            raise ValidationError({"supplier_id": "Supplier is required for cheque-out."})
        return ShopCheque.objects.create(
            tenant=tenant,
            business=business,
            direction=direction,
            amount=amt,
            cheque_number=cheque_number,
            bank_name=(bank_name or "").strip(),
            due_date=due_date,
            customer=customer,
            supplier=supplier,
            cash_account=cash_account,
            notes=notes or "",
            status=ChequeStatus.PENDING,
        )

    @transaction.atomic
    def clear_cheque(
        self,
        *,
        tenant: Tenant,
        business: Business,
        cheque: ShopCheque,
        cash_account_id=None,
    ) -> ShopCheque:
        if cheque.status != ChequeStatus.PENDING:
            raise ValidationError({"status": "Only pending cheques can be cleared."})
        cash_account_id = cash_account_id or (cheque.cash_account_id if cheque.cash_account_id else None)
        if not cash_account_id:
            raise ValidationError({"cash_account_id": "Select a cash/bank account to clear the cheque."})

        if cheque.direction == ChequeDirection.IN:
            voucher = self.books.create_payment_in(
                tenant=tenant,
                business=business,
                data={
                    "customer": cheque.customer,
                    "cash_account_id": cash_account_id,
                    "amount": cheque.amount,
                    "notes": f"Cheque {cheque.cheque_number} cleared",
                    "metadata": {"cheque_id": str(cheque.id)},
                },
            )
        else:
            voucher = self.books.create_payment_out(
                tenant=tenant,
                business=business,
                data={
                    "supplier": cheque.supplier,
                    "cash_account_id": cash_account_id,
                    "amount": cheque.amount,
                    "notes": f"Cheque {cheque.cheque_number} cleared",
                    "metadata": {"cheque_id": str(cheque.id)},
                },
            )
        cheque.status = ChequeStatus.CLEARED
        cheque.cleared_at = timezone.now()
        cheque.linked_voucher = voucher
        if cash_account_id:
            cheque.cash_account_id = cash_account_id
        cheque.save(
            update_fields=[
                "status",
                "cleared_at",
                "linked_voucher",
                "cash_account",
                "updated_at",
                "version",
            ]
        )
        return cheque

    @transaction.atomic
    def bounce_cheque(self, *, tenant: Tenant, business: Business, cheque: ShopCheque) -> ShopCheque:
        if cheque.status != ChequeStatus.PENDING:
            raise ValidationError({"status": "Only pending cheques can be marked bounced."})
        cheque.status = ChequeStatus.BOUNCED
        cheque.save(update_fields=["status", "updated_at", "version"])
        return cheque
