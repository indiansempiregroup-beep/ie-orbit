from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import F

from apps.businesses.constants import DEFAULT_LOYALTY_PREFERENCES, FEATURE_REWARD_POINTS
from apps.businesses.services.entitlements import EntitlementService
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.services.models import Service, ServicePricing


class LoyaltyService:
    def __init__(self, *, entitlements: EntitlementService | None = None) -> None:
        self.entitlements = entitlements or EntitlementService()

    def get_loyalty_preferences(self, *, business: Any) -> dict[str, Any]:
        try:
            settings = business.settings
        except ObjectDoesNotExist:
            settings = None
        raw = getattr(settings, "loyalty_preferences", None) or {}
        if not isinstance(raw, dict):
            raw = {}
        merged = dict(DEFAULT_LOYALTY_PREFERENCES)
        merged.update({k: v for k, v in raw.items() if k in DEFAULT_LOYALTY_PREFERENCES})
        try:
            merged["points_per_currency_unit"] = max(
                1, int(merged.get("points_per_currency_unit") or 10)
            )
        except (TypeError, ValueError):
            merged["points_per_currency_unit"] = 10
        try:
            merged["max_redeem_percent"] = min(
                100, max(0, int(merged.get("max_redeem_percent") or 50))
            )
        except (TypeError, ValueError):
            merged["max_redeem_percent"] = 50
        try:
            merged["min_redeem_points"] = max(0, int(merged.get("min_redeem_points") or 10))
        except (TypeError, ValueError):
            merged["min_redeem_points"] = 10
        merged["enabled"] = bool(merged.get("enabled"))
        return merged

    def has_plan_entitlement(self, *, business: Any) -> bool:
        entitlements = self.entitlements.resolve(business=business)
        return entitlements.has_reward_points and not entitlements.soft_locked

    def is_program_active(self, *, business: Any) -> bool:
        if not self.has_plan_entitlement(business=business):
            return False
        prefs = self.get_loyalty_preferences(business=business)
        return bool(prefs.get("enabled"))

    def get_program_summary(self, *, business: Any) -> dict[str, Any]:
        prefs = self.get_loyalty_preferences(business=business)
        plan_ok = self.has_plan_entitlement(business=business)
        enabled = bool(prefs.get("enabled")) and plan_ok
        return {
            "enabled": enabled,
            "plan_entitled": plan_ok,
            "points_per_currency_unit": prefs["points_per_currency_unit"],
            "max_redeem_percent": prefs["max_redeem_percent"],
            "min_redeem_points": prefs["min_redeem_points"],
            "currency": getattr(business, "currency", None) or "INR",
        }

    def normalize_loyalty_preferences(self, *, business: Any, data: dict[str, Any]) -> dict[str, Any]:
        current = self.get_loyalty_preferences(business=business)
        next_prefs = dict(current)
        if "enabled" in data:
            next_prefs["enabled"] = bool(data["enabled"])
        if "points_per_currency_unit" in data:
            try:
                next_prefs["points_per_currency_unit"] = max(
                    1, int(data["points_per_currency_unit"])
                )
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "points_per_currency_unit must be a positive integer."}
                ) from exc
        if "max_redeem_percent" in data:
            try:
                next_prefs["max_redeem_percent"] = min(100, max(0, int(data["max_redeem_percent"])))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "max_redeem_percent must be between 0 and 100."}
                ) from exc
        if "min_redeem_points" in data:
            try:
                next_prefs["min_redeem_points"] = max(0, int(data["min_redeem_points"]))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "min_redeem_points must be a non-negative integer."}
                ) from exc
        if next_prefs["enabled"]:
            self.entitlements.ensure_reward_points(business=business)
        return next_prefs

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
        program = self.get_program_summary(business=business)
        if not program["enabled"]:
            return {
                "enabled": False,
                "points_balance": 0,
                "program": program,
                "ledger": [],
            }
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        ledger = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(account=account)
            .order_by("-created_at")[:20]
        )
        return {
            "enabled": True,
            "points_balance": account.points_balance,
            "program": program,
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

    def resolve_service_price(self, *, tenant: Any, service_id: Any) -> Decimal:
        pricing = (
            ServicePricing.objects.require_tenant(tenant)
            .filter(service_id=service_id, is_default=True)
            .order_by("id")
            .first()
        )
        if pricing is None:
            pricing = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service_id=service_id)
                .order_by("id")
                .first()
            )
        if pricing is None:
            return Decimal("0.00")
        if pricing.sale_price is not None:
            return Decimal(pricing.sale_price)
        return Decimal(pricing.base_price or 0)

    def quote_redemption(
        self,
        *,
        business: Any,
        service_id: Any,
        points_to_redeem: int,
        points_balance: int | None = None,
    ) -> dict[str, Any]:
        if not self.is_program_active(business=business):
            raise ValidationError({"points_to_redeem": "Reward points are not enabled for this business."})
        prefs = self.get_loyalty_preferences(business=business)
        points = int(points_to_redeem or 0)
        if points <= 0:
            raise ValidationError({"points_to_redeem": "Select a positive number of points to redeem."})
        min_points = int(prefs["min_redeem_points"])
        if points < min_points:
            raise ValidationError(
                {"points_to_redeem": f"Minimum redeem is {min_points} points."}
            )
        if points_balance is not None and points > int(points_balance):
            raise ValidationError({"points_to_redeem": "Insufficient reward points balance."})

        rate = int(prefs["points_per_currency_unit"])
        service_price = self.resolve_service_price(tenant=business.tenant, service_id=service_id)
        discount = (Decimal(points) / Decimal(rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        max_percent = int(prefs["max_redeem_percent"])
        max_discount = (service_price * Decimal(max_percent) / Decimal(100)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if discount > max_discount:
            raise ValidationError(
                {
                    "points_to_redeem": (
                        f"Redeem is capped at {max_percent}% of the service price "
                        f"(max {max_discount} off)."
                    )
                }
            )
        currency = getattr(business, "currency", None) or "INR"
        return {
            "points_redeemed": points,
            "discount_amount": str(discount),
            "currency": currency,
            "rate": rate,
            "service_price": str(service_price),
            "max_discount_amount": str(max_discount),
        }

    @transaction.atomic
    def award_for_completed_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        service_id: Any | None = None,
    ) -> CustomerLoyaltyAccount | None:
        if not self.is_program_active(business=business):
            return None
        points = 0
        service_name = ""
        if service_id:
            service = (
                Service.objects.require_tenant(tenant)
                .filter(id=service_id, business=business)
                .first()
            )
            if service is not None:
                points = int(service.loyalty_points_earn or 0)
                service_name = service.display_name or service.name
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
        reason = f"Completed booking — {service_name}" if service_name else "Completed booking"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=reason[:160],
            booking_id=booking_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def redeem_for_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        service_id: Any,
        points_to_redeem: int,
    ) -> dict[str, Any]:
        account = (
            CustomerLoyaltyAccount.objects.select_for_update()
            .filter(tenant=tenant, business=business, customer=customer)
            .first()
        )
        if account is None:
            account = self.ensure_account(tenant=tenant, business=business, customer=customer)
            account = (
                CustomerLoyaltyAccount.objects.select_for_update()
                .filter(id=account.id)
                .first()
            )
        assert account is not None
        quote = self.quote_redemption(
            business=business,
            service_id=service_id,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(booking_id=booking_id, points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError({"points_to_redeem": "Points were already redeemed on this booking."})

        points = int(quote["points_redeemed"])
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-points,
            reason="Redeemed on booking",
            booking_id=booking_id,
            metadata={
                "type": "redeem",
                "feature": FEATURE_REWARD_POINTS,
                "discount_amount": quote["discount_amount"],
                "currency": quote["currency"],
                "rate": quote["rate"],
            },
        )
        return {
            "points_redeemed": points,
            "discount_amount": quote["discount_amount"],
            "currency": quote["currency"],
            "rate": quote["rate"],
        }

    @transaction.atomic
    def refund_redemption(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        points_redeemed: int,
    ) -> CustomerLoyaltyAccount | None:
        points = int(points_redeemed or 0)
        if points <= 0:
            return None
        already_refunded = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(booking_id=booking_id, points_delta__gt=0, metadata__type="redeem_refund")
            .exists()
        )
        if already_refunded:
            return None
        had_redeem = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(booking_id=booking_id, points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if not had_redeem:
            return None
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account = (
            CustomerLoyaltyAccount.objects.select_for_update().filter(id=account.id).first()
        )
        assert account is not None
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") + points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason="Refunded cancelled booking redemption",
            booking_id=booking_id,
            metadata={"type": "redeem_refund", "feature": FEATURE_REWARD_POINTS},
        )
        return account
