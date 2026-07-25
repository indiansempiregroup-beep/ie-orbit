from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger

DEFAULT_COMPLETION_POINTS = 10


class LoyaltyService:
    @transaction.atomic
    def ensure_account(self, *, tenant: Any, business: Any, customer: Customer) -> CustomerLoyaltyAccount:
        account, _ = CustomerLoyaltyAccount.objects.get_or_create(
            tenant=tenant,
            business=business,
            customer=customer,
            defaults={"points_balance": 0},
        )
        return account

    def get_balance(self, *, tenant: Any, business: Any, customer: Customer) -> dict[str, Any]:
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        ledger = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(account=account)
            .order_by("-created_at")[:20]
        )
        return {
            "points_balance": account.points_balance,
            "ledger": [
                {
                    "id": str(entry.id),
                    "points_delta": entry.points_delta,
                    "reason": entry.reason,
                    "booking_id": str(entry.booking_id) if entry.booking_id else None,
                    "created_at": entry.created_at,
                }
                for entry in ledger
            ],
        }

    @transaction.atomic
    def award_for_completed_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        points: int = DEFAULT_COMPLETION_POINTS,
    ) -> CustomerLoyaltyAccount | None:
        if points <= 0:
            return None
        already = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(booking_id=booking_id, points_delta__gt=0)
            .exists()
        )
        if already:
            return None
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason="Completed booking",
            booking_id=booking_id,
        )
        return account
