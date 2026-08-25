from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.businesses.constants import DEFAULT_PRODUCT_CODE, get_plan_definition
from apps.businesses.models import BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.businesses.services.entitlements import EntitlementService
from apps.businesses.services.product_billing import ProductBillingService
from apps.common.utils.workspace_access import resolve_business_manager_users
from apps.notifications.models import Notification, NotificationChannel, NotificationStatus

logger = logging.getLogger("ie_orbit.businesses")

REMINDER_WINDOW_DAYS = 5


def _business_tz(business: Any) -> ZoneInfo:
    name = (getattr(business, "timezone", None) or "Asia/Kolkata").strip() or "Asia/Kolkata"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def local_today_for_business(business: Any, *, now: datetime | None = None) -> date:
    current = now or timezone.now()
    if timezone.is_naive(current):
        current = timezone.make_aware(current, timezone.get_current_timezone())
    return current.astimezone(_business_tz(business)).date()


def days_until_period_end(subscription: BusinessProductSubscription, *, now: datetime | None = None) -> int | None:
    if subscription.current_period_ends_at is None:
        return None
    business = subscription.business
    today = local_today_for_business(business, now=now)
    end_local = subscription.current_period_ends_at.astimezone(_business_tz(business)).date()
    return (end_local - today).days


class SubscriptionLifecycleService:
    """Period-end apply, soft-lock on unpaid expiry, and renewal reminders."""

    def __init__(
        self,
        entitlements: EntitlementService | None = None,
        billing_service: ProductBillingService | None = None,
    ) -> None:
        self.entitlements = entitlements or EntitlementService()
        self.billing_service = billing_service or ProductBillingService()

    def clear_pending(self, *, subscription: BusinessProductSubscription) -> None:
        subscription.pending_plan = None
        subscription.pending_billing_interval = ""
        subscription.pending_extra_staff = None
        subscription.pending_extra_offices = None
        subscription.pending_plan_scheduled_at = None
        subscription.pending_cancel = False

    @transaction.atomic
    def apply_due_period_ends(self, *, now: datetime | None = None) -> dict[str, int]:
        current = now or timezone.now()
        due = (
            BusinessProductSubscription.objects.select_related("business", "plan", "pending_plan", "tenant")
            .filter(
                status__in={
                    BusinessProductSubscriptionStatus.ACTIVE,
                    BusinessProductSubscriptionStatus.TRIALING,
                },
                current_period_ends_at__isnull=False,
                current_period_ends_at__lte=current,
            )
            .order_by("current_period_ends_at")
        )
        applied = 0
        soft_locked = 0
        blocked = 0
        rows = list(due)
        for subscription in rows:
            result = self._apply_one_period_end(subscription=subscription, now=current)
            if result == "applied":
                applied += 1
            elif result == "soft_locked":
                soft_locked += 1
            elif result == "blocked":
                blocked += 1
        return {"applied": applied, "soft_locked": soft_locked, "blocked": blocked, "scanned": len(rows)}

    def _apply_one_period_end(
        self,
        *,
        subscription: BusinessProductSubscription,
        now: datetime,
    ) -> str:
        business = subscription.business
        if subscription.pending_cancel:
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.canceled_at = subscription.canceled_at or now
            self.clear_pending(subscription=subscription)
            subscription.save()
            self._notify_operators(
                subscription=subscription,
                subject=f"{business.display_name}: subscription ended",
                body=(
                    f"Your {subscription.product_code} access ended on "
                    f"{subscription.current_period_ends_at}. Renew from Settings → Billing to continue."
                ),
            )
            return "soft_locked"

        if subscription.pending_plan_id:
            target_code = subscription.pending_plan.code
            try:
                self.entitlements.ensure_can_downgrade(
                    business=business,
                    target_plan_code=target_code,
                    product_code=subscription.product_code,
                    extra_staff=subscription.pending_extra_staff,
                    extra_offices=subscription.pending_extra_offices,
                )
            except ValidationError as exc:
                subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
                subscription.save(update_fields=["status", "updated_at"])
                detail = "; ".join(
                    f"{key}: {value}" for key, value in getattr(exc, "detail", {}).items()
                ) or str(exc)
                self._notify_operators(
                    subscription=subscription,
                    subject=f"{business.display_name}: pending plan could not be applied",
                    body=(
                        f"We could not switch to {target_code} at period end because usage is still too high "
                        f"({detail}). Your workspace is soft-locked until you reduce usage, cancel the pending "
                        "change, or renew a higher plan."
                    ),
                )
                return "blocked"

            previous = subscription.plan.code if subscription.plan else None
            plan, plan_definition = self.billing_service.resolve_subscription_plan(
                product_code=subscription.product_code,
                plan_code=target_code,
            )
            if subscription.pending_billing_interval:
                plan_definition = {
                    **(plan_definition or {}),
                    "billing_interval": subscription.pending_billing_interval,
                }
            self.billing_service.apply_plan_to_subscription(
                subscription=subscription,
                plan=plan,
                plan_definition=plan_definition,
                now=now,
            )
            if subscription.pending_extra_staff is not None:
                subscription.extra_staff = int(subscription.pending_extra_staff)
            if subscription.pending_extra_offices is not None:
                subscription.extra_offices = int(subscription.pending_extra_offices)
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            self.clear_pending(subscription=subscription)
            subscription.renewal_reminder_last_sent_on = None
            subscription.save()
            self.billing_service.hooks.on_plan_changed(
                subscription=subscription,
                previous_plan_code=previous,
            )
            self._notify_operators(
                subscription=subscription,
                subject=f"{business.display_name}: plan updated for new period",
                body=(
                    f"Your {subscription.product_code} plan is now {plan.code}. "
                    f"New period ends {subscription.current_period_ends_at}."
                ),
            )
            return "applied"

        # No pending change: require renewal payment / confirmation.
        if subscription.status != BusinessProductSubscriptionStatus.SOFT_LOCKED:
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.save(update_fields=["status", "updated_at"])
            self._notify_operators(
                subscription=subscription,
                subject=f"{business.display_name}: renewal required",
                body=(
                    f"Your {subscription.product_code} period ended. "
                    "Renew or change your plan from Settings → Billing to restore full access. "
                    "There is no automatic charge until you renew."
                ),
            )
            return "soft_locked"
        return "soft_locked"

    @transaction.atomic
    def send_renewal_reminders(self, *, now: datetime | None = None) -> dict[str, int]:
        current = now or timezone.now()
        window_end = current + timedelta(days=REMINDER_WINDOW_DAYS + 1)
        candidates = (
            BusinessProductSubscription.objects.select_related("business", "plan", "pending_plan", "tenant")
            .filter(
                status__in={
                    BusinessProductSubscriptionStatus.ACTIVE,
                    BusinessProductSubscriptionStatus.TRIALING,
                },
                current_period_ends_at__isnull=False,
                current_period_ends_at__gt=current,
                current_period_ends_at__lte=window_end,
            )
        )
        sent = 0
        skipped = 0
        for subscription in candidates:
            days_left = days_until_period_end(subscription, now=current)
            if days_left is None or days_left < 1 or days_left > REMINDER_WINDOW_DAYS:
                skipped += 1
                continue
            today_local = local_today_for_business(subscription.business, now=current)
            if subscription.renewal_reminder_last_sent_on == today_local:
                skipped += 1
                continue
            self._send_reminder(subscription=subscription, days_left=days_left)
            subscription.renewal_reminder_last_sent_on = today_local
            subscription.save(update_fields=["renewal_reminder_last_sent_on", "updated_at"])
            sent += 1
        return {"sent": sent, "skipped": skipped}

    def _send_reminder(self, *, subscription: BusinessProductSubscription, days_left: int) -> None:
        business = subscription.business
        plan_code = subscription.plan.code if subscription.plan else "unknown"
        pending = (
            "canceled at period end"
            if subscription.pending_cancel
            else (subscription.pending_plan.code if subscription.pending_plan_id else "same plan (renew to continue)")
        )
        renews = subscription.current_period_ends_at
        frontend = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
        subject = f"{business.display_name}: {days_left} day{'s' if days_left != 1 else ''} left to renew"
        body = (
            f"Your {subscription.product_code} plan ({plan_code}) access ends on {renews}.\n"
            f"Next period plan: {pending}.\n"
            f"Renew or change your subscription here: {frontend}/settings/products\n\n"
            "There is no automatic charge — renew before the date above to avoid a soft lock."
        )
        self._notify_operators(subscription=subscription, subject=subject, body=body)

    def _notify_operators(
        self,
        *,
        subscription: BusinessProductSubscription,
        subject: str,
        body: str,
    ) -> None:
        users = resolve_business_manager_users(tenant=subscription.tenant, business=subscription.business)
        # Prefer tenant operators over pure platform admins when possible.
        recipients = [
            user
            for user in users
            if user.user_roles.filter(
                role__is_active=True,
                role__code__in={"business_owner", "manager"},
            ).exists()
            or getattr(subscription.tenant, "owner_id", None) == user.id
        ]
        if not recipients:
            recipients = users

        for user in recipients:
            Notification.objects.create(
                tenant=subscription.tenant,
                business=subscription.business,
                user=user,
                channel=NotificationChannel.IN_APP,
                subject=subject[:255],
                body=body,
                status=NotificationStatus.SENT,
                metadata={
                    "type": "billing.renewal_reminder",
                    "product_code": subscription.product_code,
                    "subscription_id": str(subscription.id),
                },
            )
            email = (getattr(user, "email", "") or "").strip()
            if email:
                try:
                    send_mail(
                        subject=subject,
                        message=body,
                        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                        recipient_list=[email],
                        fail_silently=True,
                    )
                except Exception:
                    logger.exception("Failed sending renewal email", extra={"user_id": str(user.id)})
