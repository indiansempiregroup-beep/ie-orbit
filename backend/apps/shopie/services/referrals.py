from __future__ import annotations

import secrets
import string
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import F, QuerySet
from django.utils import timezone
from django.utils.text import slugify

from apps.businesses.constants import FEATURE_SHOPIE_CUSTOMER_REFERRAL, PRODUCT_SHOPIE
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.shopie.models import CustomerReferral, CustomerReferralCode, CustomerReferralStatus
from apps.tenancy.models import Tenant

DEFAULT_REFERRAL = {
    "enabled": False,
    "points_per_referral": 50,
    "success_event": "first_paid_order",
}


class CustomerReferralService:
    def __init__(self, *, entitlements: EntitlementService | None = None) -> None:
        self.entitlements = entitlements or EntitlementService()

    def get_referral_settings(self, *, business: Business) -> dict[str, Any]:
        try:
            settings = business.shop_settings
        except ObjectDoesNotExist:
            settings = None
        metadata = getattr(settings, "metadata", None) or {}
        grow = metadata.get("grow") if isinstance(metadata, dict) else {}
        raw = grow.get("referral") if isinstance(grow, dict) else {}
        if not isinstance(raw, dict):
            raw = {}
        merged = dict(DEFAULT_REFERRAL)
        if "enabled" in raw:
            merged["enabled"] = bool(raw["enabled"])
        try:
            merged["points_per_referral"] = max(0, int(raw.get("points_per_referral") or 50))
        except (TypeError, ValueError):
            merged["points_per_referral"] = 50
        event = str(raw.get("success_event") or "first_paid_order").strip().lower()
        if event not in {"signup", "first_booking", "first_paid_order"}:
            event = "first_paid_order"
        merged["success_event"] = event
        return merged

    def is_program_active(self, *, business: Business) -> bool:
        if not self.entitlements.has_feature(
            business=business,
            feature=FEATURE_SHOPIE_CUSTOMER_REFERRAL,
            product_code=PRODUCT_SHOPIE,
        ):
            return False
        return bool(self.get_referral_settings(business=business).get("enabled"))

    def list_referrals(self, *, tenant: Tenant, business: Business) -> QuerySet[CustomerReferral]:
        return CustomerReferral.objects.filter(tenant=tenant, business=business).select_related(
            "referrer", "referred"
        )

    def _generate_unique_code(self, *, tenant: Tenant, business: Business) -> str:
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(20):
            code = "".join(secrets.choice(alphabet) for _ in range(8))
            if not CustomerReferralCode.objects.filter(
                tenant=tenant, business=business, code=code
            ).exists():
                return code
        raise ValidationError({"code": "Unable to generate a unique referral code."})

    @transaction.atomic
    def get_or_create_code(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        code: str | None = None,
    ) -> CustomerReferralCode:
        existing = (
            CustomerReferralCode.objects.filter(
                tenant=tenant, business=business, customer=customer
            )
            .order_by("-created_at")
            .first()
        )
        if existing:
            return existing
        if code:
            normalized = slugify(code).upper().replace("-", "")[:40]
            if not normalized:
                raise ValidationError({"code": "Invalid referral code."})
            if CustomerReferralCode.objects.filter(
                tenant=tenant, business=business, code=normalized
            ).exists():
                raise ValidationError({"code": "This referral code is already in use."})
        else:
            normalized = self._generate_unique_code(tenant=tenant, business=business)
        return CustomerReferralCode.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            code=normalized,
        )

    @transaction.atomic
    def apply_code_on_customer_create(
        self,
        *,
        tenant: Tenant,
        business: Business,
        referred: Customer,
        code: str,
    ) -> CustomerReferral | None:
        if not self.is_program_active(business=business):
            return None
        normalized = slugify(str(code or "")).upper().replace("-", "")
        if not normalized:
            return None
        referral_code = (
            CustomerReferralCode.objects.filter(
                tenant=tenant, business=business, code=normalized, is_active=True
            )
            .select_related("customer")
            .first()
        )
        if referral_code is None:
            raise ValidationError({"referral_code": "Referral code not found."})
        if referral_code.customer_id == referred.id:
            raise ValidationError({"referral_code": "You cannot refer yourself."})
        if CustomerReferral.objects.filter(
            tenant=tenant, business=business, referred=referred
        ).exists():
            return None
        settings = self.get_referral_settings(business=business)
        status = (
            CustomerReferralStatus.QUALIFIED
            if settings["success_event"] == "signup"
            else CustomerReferralStatus.PENDING
        )
        referral = CustomerReferral.objects.create(
            tenant=tenant,
            business=business,
            referrer=referral_code.customer,
            referred=referred,
            status=status,
            metadata={"code": normalized, "success_event": settings["success_event"]},
        )
        if settings["success_event"] == "signup":
            self._award_if_entitled(referral=referral, event="signup")
        return referral

    def maybe_award_for_event(
        self,
        *,
        tenant: Tenant,
        business: Business,
        referred: Customer,
        event: str,
    ) -> CustomerReferral | None:
        if not self.is_program_active(business=business):
            return None
        settings = self.get_referral_settings(business=business)
        if settings["success_event"] != event:
            return None
        referral = (
            CustomerReferral.objects.filter(
                tenant=tenant,
                business=business,
                referred=referred,
                status__in=[CustomerReferralStatus.PENDING, CustomerReferralStatus.QUALIFIED],
            )
            .select_related("referrer")
            .first()
        )
        if referral is None:
            return None
        return self._award_if_entitled(referral=referral, event=event)

    @transaction.atomic
    def _award_if_entitled(self, *, referral: CustomerReferral, event: str) -> CustomerReferral | None:
        locked = (
            CustomerReferral.objects.select_for_update()
            .filter(id=referral.id)
            .select_related("referrer", "business", "tenant")
            .first()
        )
        if locked is None:
            return None
        if locked.status == CustomerReferralStatus.REWARDED:
            return locked
        settings = self.get_referral_settings(business=locked.business)
        points = int(settings.get("points_per_referral") or 0)
        if points <= 0:
            locked.status = CustomerReferralStatus.QUALIFIED
            locked.save(update_fields=["status", "updated_at"])
            return locked

        account, _ = CustomerLoyaltyAccount.objects.get_or_create(
            tenant=locked.tenant,
            business=locked.business,
            customer=locked.referrer,
            defaults={"points_balance": 0},
        )
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") + points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=locked.tenant,
            business=locked.business,
            account=account,
            customer=locked.referrer,
            points_delta=points,
            reason=f"Customer referral reward ({event})",
            metadata={
                "type": "referral_reward",
                "feature": FEATURE_SHOPIE_CUSTOMER_REFERRAL,
                "referral_id": str(locked.id),
                "event": event,
            },
        )
        locked.status = CustomerReferralStatus.REWARDED
        locked.rewarded_at = timezone.now()
        locked.metadata = {
            **(locked.metadata or {}),
            "points_awarded": points,
            "awarded_event": event,
        }
        locked.save(update_fields=["status", "rewarded_at", "metadata", "updated_at"])
        return locked
