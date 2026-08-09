from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import LoanStatus, PartyKind, ShopLoan, ShopSupplier
from apps.tenancy.models import Tenant


def _q(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


class LoansService:
    def list_loans(self, *, tenant: Tenant, business: Business):
        return ShopLoan.objects.filter(tenant=tenant, business=business)

    @transaction.atomic
    def create_loan(
        self,
        *,
        tenant: Tenant,
        business: Business,
        title: str,
        principal: Any,
        party_kind: str = PartyKind.CUSTOMER,
        customer: Customer | None = None,
        supplier: ShopSupplier | None = None,
        interest_rate: Any = 0,
        start_date=None,
        notes: str = "",
    ) -> ShopLoan:
        title = (title or "").strip()
        if not title:
            raise ValidationError({"title": "Title is required."})
        amt = _q(principal)
        if amt <= 0:
            raise ValidationError({"principal": "Principal must be greater than zero."})
        party_kind = (party_kind or PartyKind.CUSTOMER).strip().lower()
        if party_kind == PartyKind.CUSTOMER and customer is None:
            raise ValidationError({"customer_id": "Customer is required."})
        if party_kind == PartyKind.SUPPLIER and supplier is None:
            raise ValidationError({"supplier_id": "Supplier is required."})
        return ShopLoan.objects.create(
            tenant=tenant,
            business=business,
            title=title,
            principal=amt,
            balance=amt,
            interest_rate=_q(interest_rate),
            party_kind=party_kind,
            customer=customer if party_kind == PartyKind.CUSTOMER else None,
            supplier=supplier if party_kind == PartyKind.SUPPLIER else None,
            start_date=start_date or timezone.localdate(),
            notes=notes or "",
            status=LoanStatus.ACTIVE,
            repayments=[],
        )

    @transaction.atomic
    def record_repayment(
        self,
        *,
        tenant: Tenant,
        business: Business,
        loan: ShopLoan,
        amount: Any,
        notes: str = "",
    ) -> ShopLoan:
        if loan.status != LoanStatus.ACTIVE:
            raise ValidationError({"status": "Only active loans accept repayments."})
        amt = _q(amount)
        if amt <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        if amt > loan.balance:
            raise ValidationError({"amount": "Amount cannot exceed outstanding balance."})
        repayments = list(loan.repayments or [])
        repayments.append(
            {
                "amount": str(amt),
                "date": timezone.localdate().isoformat(),
                "notes": notes or "",
            }
        )
        loan.repayments = repayments
        loan.balance = _q(loan.balance - amt)
        if loan.balance <= 0:
            loan.balance = Decimal("0.00")
            loan.status = LoanStatus.CLOSED
        loan.save(update_fields=["repayments", "balance", "status", "updated_at", "version"])
        return loan
