from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
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
        try:
            merged["earn_points_per_100"] = max(0, int(merged.get("earn_points_per_100") or 0))
        except (TypeError, ValueError):
            merged["earn_points_per_100"] = 1
        merged["enabled"] = bool(merged.get("enabled"))
        self._overlay_legacy_shop_loyalty(business=business, stored=raw, merged=merged)
        return merged

    def _overlay_legacy_shop_loyalty(
        self, *, business: Any, stored: dict[str, Any], merged: dict[str, Any]
    ) -> None:
        if "earn_points_per_100" in stored and stored.get("earn_points_per_100") is not None:
            return
        legacy = self._legacy_shop_loyalty(business=business)
        if not legacy:
            if "earn_points_per_100" not in stored:
                merged["earn_points_per_100"] = int(
                    DEFAULT_LOYALTY_PREFERENCES.get("earn_points_per_100") or 1
                )
            return
        try:
            merged["earn_points_per_100"] = max(0, int(legacy.get("points_per_100") or 1))
        except (TypeError, ValueError):
            merged["earn_points_per_100"] = 1
        if "enabled" not in stored and legacy.get("enabled"):
            merged["enabled"] = True
        if "points_per_currency_unit" not in stored:
            try:
                redeem_value = Decimal(str(legacy.get("redeem_value") or "0"))
            except (TypeError, ValueError, ArithmeticError):
                redeem_value = Decimal("0")
            if redeem_value > 0:
                merged["points_per_currency_unit"] = max(
                    1, int((Decimal("1") / redeem_value).to_integral_value(rounding=ROUND_HALF_UP))
                )

    def _legacy_shop_loyalty(self, *, business: Any) -> dict[str, Any]:
        try:
            shop_settings = business.shop_settings
        except Exception:
            return {}
        metadata = getattr(shop_settings, "metadata", None) or {}
        if not isinstance(metadata, dict):
            return {}
        grow = metadata.get("grow")
        if not isinstance(grow, dict):
            return {}
        loyalty = grow.get("loyalty")
        return loyalty if isinstance(loyalty, dict) else {}

    def has_plan_entitlement(self, *, business: Any) -> bool:
        entitled, _locked = self.entitlements.loyalty_program_access(business=business)
        return entitled

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
            "earn_points_per_100": prefs["earn_points_per_100"],
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
        if "earn_points_per_100" in data:
            try:
                next_prefs["earn_points_per_100"] = max(0, int(data["earn_points_per_100"]))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "earn_points_per_100 must be a non-negative integer."}
                ) from exc
        if next_prefs["enabled"]:
            self.entitlements.ensure_loyalty_program(business=business)
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
                    "order_id": str(entry.order_id) if entry.order_id else None,
                    "voucher_id": str(entry.voucher_id) if entry.voucher_id else None,
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
        points_to_redeem: int,
        service_id: Any | None = None,
        amount: Decimal | str | int | float | None = None,
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

        if amount is None:
            if service_id is None:
                raise ValidationError({"points_to_redeem": "A price is required to quote redemption."})
            eligible = self.resolve_service_price(tenant=business.tenant, service_id=service_id)
        else:
            eligible = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
        if eligible < 0:
            eligible = Decimal("0.00")

        rate = int(prefs["points_per_currency_unit"])
        discount = (Decimal(points) / Decimal(rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        max_percent = int(prefs["max_redeem_percent"])
        max_discount = (eligible * Decimal(max_percent) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if discount > max_discount:
            raise ValidationError(
                {
                    "points_to_redeem": (
                        f"Redeem is capped at {max_percent}% of the price "
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
            "service_price": str(eligible),
            "max_discount_amount": str(max_discount),
        }

    def earn_points_for_spend(self, *, business: Any, amount: Decimal | str | int | float) -> int:
        if not self.is_program_active(business=business):
            return 0
        prefs = self.get_loyalty_preferences(business=business)
        rate = int(prefs["earn_points_per_100"] or 0)
        if rate <= 0:
            return 0
        spent = Decimal(str(amount or "0"))
        if spent <= 0:
            return 0
        return int((spent * Decimal(rate) / Decimal("100")).to_integral_value(rounding=ROUND_DOWN))

    def _lock_account(
        self, *, tenant: Any, business: Any, customer: Customer
    ) -> CustomerLoyaltyAccount:
        account = (
            CustomerLoyaltyAccount.objects.select_for_update()
            .filter(tenant=tenant, business=business, customer=customer)
            .first()
        )
        if account is None:
            self.ensure_account(tenant=tenant, business=business, customer=customer)
            account = (
                CustomerLoyaltyAccount.objects.select_for_update()
                .filter(tenant=tenant, business=business, customer=customer)
                .first()
            )
        assert account is not None
        return account

    def _ledger_qs(
        self,
        *,
        tenant: Any,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ):
        qs = CustomerLoyaltyLedger.objects.require_tenant(tenant)
        if booking_id is not None:
            qs = qs.filter(booking_id=booking_id)
        if order_id is not None:
            qs = qs.filter(order_id=order_id)
        if voucher_id is not None:
            qs = qs.filter(voucher_id=voucher_id)
        return qs

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
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__gt=0, metadata__type="earn")
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
    def award_for_completed_booking_items(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        line_items: list[Any],
    ) -> CustomerLoyaltyAccount | None:
        if not self.is_program_active(business=business):
            return None
        already = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return None

        service_ids = [item.service_id for item in line_items]
        services = {
            str(service.id): service
            for service in Service.objects.require_tenant(tenant).filter(
                id__in=service_ids, business=business
            )
        }
        total_points = 0
        service_names: list[str] = []
        for item in line_items:
            service = services.get(str(item.service_id))
            if service is None:
                continue
            points = int(service.loyalty_points_earn or 0)
            if points > 0:
                total_points += points
                service_names.append(service.display_name or service.name)
        if total_points <= 0:
            return None

        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + total_points
        account.save(update_fields=["points_balance", "updated_at"])
        if len(service_names) == 1:
            reason = f"Completed booking — {service_names[0]}"
        else:
            reason = f"Completed booking — {', '.join(service_names)}"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=total_points,
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
        amount: Decimal | str | int | float | None = None,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            service_id=service_id if amount is None else None,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
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
        return self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            booking_id=booking_id,
            reason="Refunded cancelled booking redemption",
        )

    def _refund_redemption(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        points_redeemed: int,
        reason: str,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ) -> CustomerLoyaltyAccount | None:
        points = int(points_redeemed or 0)
        if points <= 0:
            return None
        qs = self._ledger_qs(
            tenant=tenant, booking_id=booking_id, order_id=order_id, voucher_id=voucher_id
        )
        if qs.filter(points_delta__gt=0, metadata__type="redeem_refund").exists():
            return None
        if not qs.filter(points_delta__lt=0, metadata__type="redeem").exists():
            return None
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
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
            reason=reason[:160],
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
            metadata={"type": "redeem_refund", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    def _reverse_earn(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        reason: str,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ) -> CustomerLoyaltyAccount | None:
        qs = self._ledger_qs(
            tenant=tenant, booking_id=booking_id, order_id=order_id, voucher_id=voucher_id
        )
        if qs.filter(points_delta__lt=0, metadata__type="earn_reversal").exists():
            return None
        earn = qs.filter(points_delta__gt=0, metadata__type="earn").first()
        if earn is None:
            return None
        points = int(earn.points_delta)
        if points <= 0:
            return None
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        current = int(account.points_balance)
        deduct = min(current, points)
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - deduct
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-deduct,
            reason=reason[:160],
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
            metadata={"type": "earn_reversal", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def redeem_for_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        amount: Decimal | str | int | float,
        points_to_redeem: int,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, order_id=order_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError(
                {"points_to_redeem": "Points were already redeemed on this order."}
            )
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
            reason="Redeemed on order",
            order_id=order_id,
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
    def award_for_paid_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        amount: Decimal | str | int | float,
        order_number: str = "",
    ) -> CustomerLoyaltyAccount | None:
        points = self.earn_points_for_spend(business=business, amount=amount)
        if points <= 0:
            return None
        already = (
            self._ledger_qs(tenant=tenant, order_id=order_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return None
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        label = f"Paid order — {order_number}" if order_number else "Paid order"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=label[:160],
            order_id=order_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def refund_for_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        points_redeemed: int = 0,
    ) -> None:
        self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            order_id=order_id,
            reason="Refunded cancelled order redemption",
        )
        self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            order_id=order_id,
            reason="Reversed cancelled order earn",
        )

    @transaction.atomic
    def redeem_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        amount: Decimal | str | int | float,
        points_to_redeem: int,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, voucher_id=voucher_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError(
                {"points_to_redeem": "Points were already redeemed on this sale."}
            )
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
            reason="Redeemed on sale",
            voucher_id=voucher_id,
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
    def award_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        amount: Decimal | str | int | float,
        voucher_number: str = "",
    ) -> CustomerLoyaltyAccount | None:
        points = self.earn_points_for_spend(business=business, amount=amount)
        if points <= 0:
            return None
        already = (
            self._ledger_qs(tenant=tenant, voucher_id=voucher_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return None
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        label = f"Books sale — {voucher_number}" if voucher_number else "Books sale"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=label[:160],
            voucher_id=voucher_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def refund_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        points_redeemed: int = 0,
    ) -> None:
        self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            voucher_id=voucher_id,
            reason="Refunded voided sale redemption",
        )
        self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            voucher_id=voucher_id,
            reason="Reversed voided sale earn",
        )
