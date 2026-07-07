from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.utils import timezone

from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.businesses.models import (
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.tenancy.models import Tenant


@dataclass(frozen=True)
class ReconciliationResult:
    tenant_id: str
    scanned_sessions: int
    mismatched_sessions: int
    missing_subscription: int
    missing_external_reference: int
    checked_since: str
    sample_order_ids: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "scanned_sessions": self.scanned_sessions,
            "mismatched_sessions": self.mismatched_sessions,
            "missing_subscription": self.missing_subscription,
            "missing_external_reference": self.missing_external_reference,
            "checked_since": self.checked_since,
            "sample_order_ids": self.sample_order_ids,
        }


class BillingReconciliationService:
    def reconcile(self, *, tenant: Tenant, lookback_hours: int = 72) -> ReconciliationResult:
        lookback_hours = max(1, min(lookback_hours, 24 * 30))
        checked_since = timezone.now() - timedelta(hours=lookback_hours)
        sessions = list(
            BillingCheckoutSession.objects.filter(
                tenant=tenant,
                status=CheckoutSessionStatus.PAID,
                paid_at__gte=checked_since,
            )
            .select_related("business")
            .order_by("-paid_at")
        )

        missing_subscription = 0
        missing_external_reference = 0
        mismatched_order_ids: list[str] = []
        active_statuses = (
            BusinessProductSubscriptionStatus.ACTIVE,
            BusinessProductSubscriptionStatus.TRIALING,
        )
        for session in sessions:
            subscription = BusinessProductSubscription.objects.filter(
                tenant=tenant,
                business=session.business,
                product_code=session.product_code,
                status__in=active_statuses,
            ).order_by("-updated_at").first()
            if not subscription:
                missing_subscription += 1
                mismatched_order_ids.append(session.razorpay_order_id)
                continue

            if not subscription.external_billing_reference:
                missing_external_reference += 1
                mismatched_order_ids.append(session.razorpay_order_id)

        return ReconciliationResult(
            tenant_id=str(tenant.id),
            scanned_sessions=len(sessions),
            mismatched_sessions=missing_subscription + missing_external_reference,
            missing_subscription=missing_subscription,
            missing_external_reference=missing_external_reference,
            checked_since=checked_since.isoformat(),
            sample_order_ids=mismatched_order_ids[:20],
        )
