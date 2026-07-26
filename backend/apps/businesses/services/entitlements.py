from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.billing.constants import (
    ADDON_OFFICE_PRICE_PAISE,
    ADDON_STAFF_PRICE_PAISE,
    PLAN_PRICE_PAISE,
    YEARLY_PRICE_MULTIPLIER,
)
from apps.businesses.constants import (
    BI_FEATURES_FULL,
    BI_FEATURES_LIMITED,
    DEFAULT_PRODUCT_CODE,
    FEATURE_REWARD_POINTS,
    PLAN_FEATURES_FULL,
    PLAN_FEATURES_LIMITED,
    get_plan_definition,
)
from apps.businesses.models import (
    Branch,
    BranchStatus,
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.staff.models import EmploymentStatus, Staff


@dataclass(frozen=True)
class PlanEntitlements:
    plan_code: str
    max_staff: int
    max_branches: int
    bi_features: tuple[str, ...]
    features: tuple[str, ...]
    extra_staff: int
    extra_offices: int
    billing_interval: str
    status: str
    soft_locked: bool
    trial_ends_at: Any | None
    current_period_starts_at: Any | None = None
    current_period_ends_at: Any | None = None
    subscribed_at: Any | None = None
    canceled_at: Any | None = None

    @property
    def has_reward_points(self) -> bool:
        return FEATURE_REWARD_POINTS in self.features

    @property
    def effective_max_staff(self) -> int:
        return self.max_staff + self.extra_staff

    @property
    def effective_max_branches(self) -> int:
        return self.max_branches + self.extra_offices

    @property
    def base_amount_paise(self) -> int:
        monthly = PLAN_PRICE_PAISE.get(self.plan_code, 0)
        if self.billing_interval == "yearly":
            return monthly * YEARLY_PRICE_MULTIPLIER
        return monthly

    @property
    def addon_amount_paise(self) -> int:
        staff_unit = ADDON_STAFF_PRICE_PAISE
        office_unit = ADDON_OFFICE_PRICE_PAISE
        if self.billing_interval == "yearly":
            staff_unit *= YEARLY_PRICE_MULTIPLIER
            office_unit *= YEARLY_PRICE_MULTIPLIER
        return (self.extra_staff * staff_unit) + (self.extra_offices * office_unit)

    @property
    def total_amount_paise(self) -> int:
        return self.base_amount_paise + self.addon_amount_paise

    def to_dict(
        self,
        *,
        used_staff: int = 0,
        used_branches: int = 0,
        pending: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        staff_unit = ADDON_STAFF_PRICE_PAISE
        office_unit = ADDON_OFFICE_PRICE_PAISE
        if self.billing_interval == "yearly":
            staff_unit *= YEARLY_PRICE_MULTIPLIER
            office_unit *= YEARLY_PRICE_MULTIPLIER
        pending_payload = pending or {}
        return {
            "plan_code": self.plan_code,
            "status": self.status,
            "billing_interval": self.billing_interval,
            "soft_locked": self.soft_locked,
            "trial_ends_at": self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            "current_period_starts_at": (
                self.current_period_starts_at.isoformat() if self.current_period_starts_at else None
            ),
            "current_period_ends_at": (
                self.current_period_ends_at.isoformat() if self.current_period_ends_at else None
            ),
            "subscribed_at": self.subscribed_at.isoformat() if self.subscribed_at else None,
            "canceled_at": self.canceled_at.isoformat() if self.canceled_at else None,
            "renews_at": (
                self.current_period_ends_at.isoformat()
                if self.current_period_ends_at
                and not self.soft_locked
                and self.status
                not in {
                    BusinessProductSubscriptionStatus.CANCELED,
                    BusinessProductSubscriptionStatus.SOFT_LOCKED,
                }
                else None
            ),
            "pending_plan_code": pending_payload.get("pending_plan_code"),
            "pending_billing_interval": pending_payload.get("pending_billing_interval"),
            "pending_cancel": bool(pending_payload.get("pending_cancel")),
            "pending_plan_scheduled_at": pending_payload.get("pending_plan_scheduled_at"),
            "plan_change_effective_at": pending_payload.get("plan_change_effective_at"),
            "plan_locked_until": (
                self.current_period_ends_at.isoformat()
                if self.current_period_ends_at
                and self.status == BusinessProductSubscriptionStatus.ACTIVE
                and not self.soft_locked
                else None
            ),
            "included_staff": self.max_staff,
            "included_offices": self.max_branches,
            "extra_staff": self.extra_staff,
            "extra_offices": self.extra_offices,
            "effective_max_staff": self.effective_max_staff,
            "effective_max_branches": self.effective_max_branches,
            "used_staff": used_staff,
            "used_offices": used_branches,
            "bi_features": list(self.bi_features),
            "features": list(self.features),
            "pricing": {
                "currency": "INR",
                "base_amount_paise": self.base_amount_paise,
                "addon_staff_unit_paise": staff_unit,
                "addon_office_unit_paise": office_unit,
                "addon_amount_paise": self.addon_amount_paise,
                "total_amount_paise": self.total_amount_paise,
            },
        }


class EntitlementService:
    """Resolve plan limits, soft-lock, add-ons, and BI entitlements for a business."""

    def get_subscription(
        self,
        *,
        business: Business,
        product_code: str = DEFAULT_PRODUCT_CODE,
    ) -> BusinessProductSubscription | None:
        return (
            business.product_subscriptions.filter(product_code=product_code.strip().lower())
            .select_related("plan")
            .first()
        )

    def resolve(
        self,
        *,
        business: Business,
        product_code: str = DEFAULT_PRODUCT_CODE,
    ) -> PlanEntitlements:
        subscription = self.get_subscription(business=business, product_code=product_code)
        plan_code = "appointie-starter"
        billing_interval = "monthly"
        status = BusinessProductSubscriptionStatus.TRIALING
        trial_ends_at = None
        current_period_starts_at = None
        current_period_ends_at = None
        subscribed_at = None
        canceled_at = None
        extra_staff = 0
        extra_offices = 0
        soft_locked = False

        if subscription is not None:
            plan_code = subscription.plan.code if subscription.plan_id else plan_code
            billing_interval = subscription.billing_interval or billing_interval
            status = subscription.status
            trial_ends_at = subscription.trial_ends_at
            current_period_starts_at = subscription.current_period_starts_at
            current_period_ends_at = subscription.current_period_ends_at
            subscribed_at = subscription.subscribed_at
            canceled_at = subscription.canceled_at
            extra_staff = int(getattr(subscription, "extra_staff", 0) or 0)
            extra_offices = int(getattr(subscription, "extra_offices", 0) or 0)
            soft_locked = self.is_soft_locked(subscription)

        definition = get_plan_definition(product_code.strip().lower(), plan_code) or {}
        # Trialing (and not soft-locked) gets Pro-level included limits.
        if (
            subscription is not None
            and subscription.status == BusinessProductSubscriptionStatus.TRIALING
            and not soft_locked
        ):
            max_staff = 5
            max_branches = 5
            bi_features = BI_FEATURES_FULL
            features = PLAN_FEATURES_FULL
        else:
            max_staff = int(definition.get("max_staff", 1) or 1)
            max_branches = int(definition.get("max_branches", 1) or 1)
            raw_bi = definition.get("bi_features") or list(BI_FEATURES_LIMITED)
            bi_features = tuple(str(item) for item in raw_bi)
            raw_features = definition.get("features") or list(PLAN_FEATURES_LIMITED)
            features = tuple(str(item) for item in raw_features)

        return PlanEntitlements(
            plan_code=plan_code,
            max_staff=max_staff,
            max_branches=max_branches,
            bi_features=bi_features,
            features=features,
            extra_staff=extra_staff,
            extra_offices=extra_offices,
            billing_interval=billing_interval,
            status=status,
            soft_locked=soft_locked,
            trial_ends_at=trial_ends_at,
            current_period_starts_at=current_period_starts_at,
            current_period_ends_at=current_period_ends_at,
            subscribed_at=subscribed_at,
            canceled_at=canceled_at,
        )

    def is_soft_locked(self, subscription: BusinessProductSubscription) -> bool:
        if subscription.status == BusinessProductSubscriptionStatus.SOFT_LOCKED:
            return True
        now = timezone.now()
        if (
            subscription.status == BusinessProductSubscriptionStatus.TRIALING
            and subscription.trial_ends_at is not None
            and subscription.trial_ends_at <= now
        ):
            return True
        if (
            subscription.status == BusinessProductSubscriptionStatus.ACTIVE
            and subscription.current_period_ends_at is not None
            and subscription.current_period_ends_at <= now
        ):
            return True
        return False

    def refresh_soft_lock(self, *, business: Business, product_code: str = DEFAULT_PRODUCT_CODE) -> bool:
        subscription = self.get_subscription(business=business, product_code=product_code)
        if subscription is None:
            return False
        now = timezone.now()
        if subscription.status == BusinessProductSubscriptionStatus.SOFT_LOCKED:
            return True
        if (
            subscription.status == BusinessProductSubscriptionStatus.TRIALING
            and subscription.trial_ends_at is not None
            and subscription.trial_ends_at <= now
        ):
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.save(update_fields=["status", "updated_at"])
            return True
        if (
            subscription.status == BusinessProductSubscriptionStatus.ACTIVE
            and subscription.current_period_ends_at is not None
            and subscription.current_period_ends_at <= now
        ):
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.save(update_fields=["status", "updated_at"])
            return True
        return False

    def ensure_not_soft_locked(self, *, business: Business, product_code: str = DEFAULT_PRODUCT_CODE) -> None:
        if self.refresh_soft_lock(business=business, product_code=product_code):
            raise PermissionDenied(
                "Your plan period has ended or your trial expired. "
                "Renew or upgrade from billing settings to continue making changes."
            )

    def count_bookable_staff(self, *, business: Business) -> int:
        return (
            Staff.objects.filter(
                business=business,
                is_bookable=True,
                employment_status=EmploymentStatus.ACTIVE,
                is_active=True,
            ).count()
        )

    def count_active_branches(self, *, business: Business) -> int:
        return Branch.objects.filter(
            business=business,
            status=BranchStatus.ACTIVE,
            is_active=True,
        ).count()

    def ensure_can_add_staff(self, *, business: Business, is_bookable: bool = True) -> None:
        self.ensure_not_soft_locked(business=business)
        if not is_bookable:
            return
        entitlements = self.resolve(business=business)
        used = self.count_bookable_staff(business=business)
        if used >= entitlements.effective_max_staff:
            raise ValidationError(
                {
                    "staff": (
                        f"Staff limit reached ({entitlements.effective_max_staff}). "
                        "Add more seats from billing or upgrade your plan."
                    )
                }
            )

    def ensure_can_add_branch(self, *, business: Business) -> None:
        self.ensure_not_soft_locked(business=business)
        entitlements = self.resolve(business=business)
        used = self.count_active_branches(business=business)
        if used >= entitlements.effective_max_branches:
            raise ValidationError(
                {
                    "branch": (
                        f"Office limit reached ({entitlements.effective_max_branches}). "
                        "Add more offices from billing or upgrade your plan."
                    )
                }
            )

    def ensure_can_create_booking(self, *, business: Business) -> None:
        self.ensure_not_soft_locked(business=business)

    def ensure_bi_feature(self, *, business: Business, feature: str) -> None:
        entitlements = self.resolve(business=business)
        if feature not in entitlements.bi_features:
            raise PermissionDenied(
                f"'{feature}' analytics require AppointIE Pro. Upgrade to unlock full BI."
            )

    def ensure_reward_points(self, *, business: Business) -> None:
        entitlements = self.resolve(business=business)
        if not entitlements.has_reward_points:
            raise PermissionDenied(
                "Reward points require AppointIE Pro. Upgrade to unlock this feature."
            )
        if entitlements.soft_locked:
            raise PermissionDenied(
                "Your plan period has ended or your trial expired. "
                "Renew or upgrade from billing settings to use reward points."
            )

    def ensure_can_downgrade(
        self,
        *,
        business: Business,
        target_plan_code: str,
        product_code: str = DEFAULT_PRODUCT_CODE,
        extra_staff: int | None = None,
        extra_offices: int | None = None,
    ) -> None:
        definition = get_plan_definition(product_code, target_plan_code)
        if definition is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})
        subscription = self.get_subscription(business=business, product_code=product_code)
        next_extra_staff = (
            int(extra_staff)
            if extra_staff is not None
            else int(getattr(subscription, "extra_staff", 0) or 0)
            if subscription
            else 0
        )
        next_extra_offices = (
            int(extra_offices)
            if extra_offices is not None
            else int(getattr(subscription, "extra_offices", 0) or 0)
            if subscription
            else 0
        )
        max_staff = int(definition.get("max_staff", 1) or 1) + next_extra_staff
        max_branches = int(definition.get("max_branches", 1) or 1) + next_extra_offices
        used_staff = self.count_bookable_staff(business=business)
        used_branches = self.count_active_branches(business=business)
        errors: dict[str, str] = {}
        if used_staff > max_staff:
            errors["staff"] = (
                f"Reduce bookable staff to {max_staff} or fewer before switching to this plan "
                f"(currently {used_staff})."
            )
        if used_branches > max_branches:
            errors["offices"] = (
                f"Reduce offices to {max_branches} or fewer before switching to this plan "
                f"(currently {used_branches})."
            )
        if errors:
            raise ValidationError(errors)

    def billing_snapshot(self, *, business: Business, product_code: str = DEFAULT_PRODUCT_CODE) -> dict[str, Any]:
        entitlements = self.resolve(business=business, product_code=product_code)
        subscription = self.get_subscription(business=business, product_code=product_code)
        pending: dict[str, Any] = {
            "pending_plan_code": None,
            "pending_billing_interval": None,
            "pending_cancel": False,
            "pending_plan_scheduled_at": None,
            "plan_change_effective_at": None,
        }
        if subscription is not None:
            has_pending = bool(subscription.pending_plan_id or subscription.pending_cancel)
            pending = {
                "pending_plan_code": (
                    "canceled"
                    if subscription.pending_cancel
                    else (subscription.pending_plan.code if subscription.pending_plan_id else None)
                ),
                "pending_billing_interval": subscription.pending_billing_interval or None,
                "pending_cancel": bool(subscription.pending_cancel),
                "pending_plan_scheduled_at": (
                    subscription.pending_plan_scheduled_at.isoformat()
                    if subscription.pending_plan_scheduled_at
                    else None
                ),
                "plan_change_effective_at": (
                    subscription.current_period_ends_at.isoformat()
                    if has_pending and subscription.current_period_ends_at
                    else None
                ),
            }
        return entitlements.to_dict(
            used_staff=self.count_bookable_staff(business=business),
            used_branches=self.count_active_branches(business=business),
            pending=pending,
        )
