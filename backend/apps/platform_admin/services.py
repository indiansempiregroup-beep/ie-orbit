from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services.audit import record_audit
from apps.authentication.models import RefreshTokenRecord, User, UserSession, UserStatus
from apps.authentication.services.passwords import PasswordService
from apps.authentication.services.roles import RoleService
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.constants import VALID_PRODUCT_CODES
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.models import (
    HelpArticle,
    PlatformAddonPricing,
    PlatformAnnouncement,
    PlatformAuditEvent,
    PlatformCoupon,
    PlatformCouponRedemption,
    PlatformCreditLedger,
    PlatformFeatureFlag,
    PlatformLedgerInvoice,
    PlatformPlanPackage,
    SupportTicket,
    SupportTicketNote,
)
from apps.tenancy.models import Tenant, TenantStatus


class PlatformAdminService:
    def __init__(self) -> None:
        self.businesses = BusinessService()
        self.entitlements = EntitlementService()
        self.roles = RoleService()
        self.passwords = PasswordService()
        self.razorpay = RazorpayClient()

    def audit(
        self,
        *,
        actor: User | None,
        action: str,
        resource_type: str,
        resource_id: str = "",
        tenant: Tenant | None = None,
        reason: str = "",
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformAuditEvent:
        event = PlatformAuditEvent.objects.create(
            actor=actor,
            tenant=tenant,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
            metadata=metadata or {},
            ip_address=ip_address,
            user_agent=user_agent[:512],
        )
        if tenant is not None:
            record_audit(
                tenant=tenant,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                actor_id=str(actor.id) if actor else None,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={**(metadata or {}), "reason": reason},
            )
        return event

    def require_reason(self, reason: str | None) -> str:
        value = (reason or "").strip()
        if len(value) < 3:
            raise ValidationError({"reason": "A reason of at least 3 characters is required."})
        return value

    def primary_business(self, tenant: Tenant) -> Business:
        business = (
            Business.active_objects.filter(tenant=tenant).order_by("created_at").first()
        )
        if business is None:
            raise ValidationError({"business": "Tenant has no business."})
        return business

    def resolve_business(self, tenant: Tenant, business_id: str | None) -> Business:
        """Resolve the business targeted by a platform billing action.

        When the tenant has multiple businesses, ``business_id`` is required so
        support actions never silently mutate the primary (oldest) business.
        """
        queryset = Business.active_objects.filter(tenant=tenant)
        count = queryset.count()
        if count == 0:
            raise ValidationError({"business": "Tenant has no business."})

        raw_id = (business_id or "").strip()
        if raw_id:
            business = queryset.filter(id=raw_id).first()
            if business is None:
                raise ValidationError({"business_id": "Business not found for this tenant."})
            return business

        if count > 1:
            raise ValidationError(
                {"business_id": "Required when the tenant has multiple businesses."}
            )
        return queryset.order_by("created_at").first()

    # --- lifecycle -----------------------------------------------------------------

    @transaction.atomic
    def set_tenant_status(
        self,
        *,
        tenant: Tenant,
        status: str,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> Tenant:
        reason = self.require_reason(reason)
        if status not in {c.value for c in TenantStatus}:
            raise ValidationError({"status": "Invalid tenant status."})
        before = tenant.status
        tenant.status = status
        tenant.save(update_fields=["status", "updated_at"])
        self.audit(
            actor=actor,
            tenant=tenant,
            action=f"platform.tenant.{status}",
            resource_type="tenant",
            resource_id=str(tenant.id),
            reason=reason,
            metadata={"before": before, "after": status},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return tenant

    # --- billing actions -----------------------------------------------------------

    @transaction.atomic
    def billing_action(
        self,
        *,
        tenant: Tenant,
        actor: User,
        action: str,
        payload: dict[str, Any],
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        business = self.resolve_business(tenant, payload.get("business_id"))
        product_code = (payload.get("product_code") or business.selected_product or "appointie").strip().lower()
        subscription = business.product_subscriptions.filter(product_code=product_code).first()
        if subscription is None:
            raise ValidationError({"product_code": "No subscription found for this product."})

        before = {
            "status": subscription.status,
            "plan_code": subscription.plan.code if subscription.plan else None,
            "extra_staff": subscription.extra_staff,
            "extra_offices": subscription.extra_offices,
            "trial_ends_at": subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
            "current_period_starts_at": (
                subscription.current_period_starts_at.isoformat()
                if subscription.current_period_starts_at
                else None
            ),
            "current_period_ends_at": (
                subscription.current_period_ends_at.isoformat()
                if subscription.current_period_ends_at
                else None
            ),
            "business_id": str(business.id),
        }

        if action == "change_plan":
            plan_code = payload.get("plan_code")
            if not plan_code:
                raise ValidationError({"plan_code": "Required."})
            self.businesses.change_product_plan(
                business=business,
                product_code=product_code,
                plan_code=plan_code,
                actor=actor,
                billing_interval=payload.get("billing_interval"),
                force_immediate=True,
            )
        elif action == "update_addons":
            self.businesses.update_product_addons(
                business=business,
                product_code=product_code,
                extra_staff=int(payload.get("extra_staff") or 0),
                extra_offices=int(payload.get("extra_offices") or 0),
                pets_pack_enabled=bool(payload.get("pets_pack_enabled", False)),
                actor=actor,
            )
        elif action == "clear_soft_lock":
            days = int(payload.get("days") or 30)
            if days < 1:
                raise ValidationError({"days": "Must be >= 1."})
            now = timezone.now()
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.current_period_starts_at = now
            subscription.current_period_ends_at = now + timedelta(days=days)
            subscription.save(
                update_fields=[
                    "status",
                    "current_period_starts_at",
                    "current_period_ends_at",
                    "updated_at",
                ]
            )
        elif action == "force_soft_lock":
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.save(update_fields=["status", "updated_at"])
        elif action == "extend_trial":
            days = int(payload.get("days") or 0)
            if days < 1:
                raise ValidationError({"days": "Must be >= 1."})
            now = timezone.now()
            base = subscription.trial_ends_at or now
            if base < now:
                base = now
            subscription.trial_ends_at = base + timedelta(days=days)
            subscription.status = BusinessProductSubscriptionStatus.TRIALING
            subscription.save(update_fields=["trial_ends_at", "status", "updated_at"])
        elif action == "set_complimentary":
            days = int(payload.get("days") or 30)
            if days < 1:
                raise ValidationError({"days": "Must be >= 1."})
            now = timezone.now()
            period_end = now + timedelta(days=days)
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.current_period_starts_at = now
            subscription.current_period_ends_at = period_end
            # Keep trial_ends_at aligned for display; paid unlock uses period end.
            subscription.trial_ends_at = period_end
            subscription.external_billing_reference = f"comp:{actor.id}:{now.date().isoformat()}"
            subscription.save(
                update_fields=[
                    "status",
                    "current_period_starts_at",
                    "current_period_ends_at",
                    "trial_ends_at",
                    "external_billing_reference",
                    "updated_at",
                ]
            )
        else:
            raise ValidationError({"action": f"Unknown billing action '{action}'."})

        subscription.refresh_from_db()
        after = {
            "status": subscription.status,
            "plan_code": subscription.plan.code if subscription.plan else None,
            "extra_staff": subscription.extra_staff,
            "extra_offices": subscription.extra_offices,
            "trial_ends_at": subscription.trial_ends_at.isoformat() if subscription.trial_ends_at else None,
            "current_period_starts_at": (
                subscription.current_period_starts_at.isoformat()
                if subscription.current_period_starts_at
                else None
            ),
            "current_period_ends_at": (
                subscription.current_period_ends_at.isoformat()
                if subscription.current_period_ends_at
                else None
            ),
            "business_id": str(business.id),
        }
        self.audit(
            actor=actor,
            tenant=tenant,
            action=f"platform.billing.{action}",
            resource_type="subscription",
            resource_id=str(subscription.id),
            reason=reason,
            metadata={"before": before, "after": after, "payload": payload},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return self.entitlements.billing_snapshot(business=business, product_code=product_code)

    # --- users ---------------------------------------------------------------------

    def search_users(self, *, email: str) -> list[dict[str, Any]]:
        q = (email or "").strip()
        if len(q) < 2:
            raise ValidationError({"email": "Provide at least 2 characters."})
        users = User.objects.filter(email__icontains=q).order_by("email")[:25]
        rows = []
        for user in users:
            owned = list(
                Tenant.active_objects.filter(owner=user).values("id", "slug", "display_name", "status")
            )
            roles = list(user.user_roles.values_list("role__code", flat=True))
            rows.append(
                {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "is_active": user.is_active,
                    "roles": roles,
                    "owned_tenants": [
                        {
                            "id": str(t["id"]),
                            "slug": t["slug"],
                            "display_name": t["display_name"],
                            "status": t["status"],
                        }
                        for t in owned
                    ],
                }
            )
        return rows

    def tenant_users(self, *, tenant: Tenant) -> list[dict[str, Any]]:
        owner = tenant.owner
        rows = []
        if owner:
            rows.append(
                {
                    "id": str(owner.id),
                    "email": owner.email,
                    "full_name": owner.full_name,
                    "roles": list(owner.user_roles.values_list("role__code", flat=True)),
                    "is_active": owner.is_active,
                    "relation": "owner",
                }
            )
        # Staff-linked users under tenant businesses
        from apps.staff.models import Staff

        staff_users = (
            Staff.objects.filter(business__tenant=tenant, user__isnull=False)
            .select_related("user")
            .distinct()
        )
        seen = {str(owner.id)} if owner else set()
        for member in staff_users:
            user = member.user
            if not user or str(user.id) in seen:
                continue
            seen.add(str(user.id))
            rows.append(
                {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "roles": list(user.user_roles.values_list("role__code", flat=True)),
                    "is_active": user.is_active,
                    "relation": "staff",
                }
            )
        return rows

    @transaction.atomic
    def set_user_active(
        self,
        *,
        user: User,
        active: bool,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> User:
        reason = self.require_reason(reason)
        if user.is_superuser or user.user_roles.filter(
            role__code__in={"platform_admin", "super_admin"}
        ).exists():
            raise PermissionDenied("Cannot disable platform administrators.")
        before = user.is_active
        user.is_active = active
        update_fields = ["is_active", "updated_at"]
        if not active:
            user.status = UserStatus.SUSPENDED
            update_fields.append("status")
            now = timezone.now()
            UserSession.objects.filter(user=user, revoked_at__isnull=True).update(
                revoked_at=now,
                revoked_reason="platform_disable",
                updated_at=now,
            )
            RefreshTokenRecord.objects.filter(user=user, revoked_at__isnull=True).update(
                revoked_at=now,
                updated_at=now,
            )
        elif user.status == UserStatus.SUSPENDED:
            user.status = (
                UserStatus.ACTIVE if user.email_verified_at else UserStatus.PENDING_VERIFICATION
            )
            update_fields.append("status")
        user.save(update_fields=update_fields)
        tenant = Tenant.active_objects.filter(owner=user).first()
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.user.enable" if active else "platform.user.disable",
            resource_type="user",
            resource_id=str(user.id),
            reason=reason,
            metadata={"before": before, "after": active, "email": user.email},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return user

    @transaction.atomic
    def reset_user_password(
        self,
        *,
        user: User,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        reset = self.passwords.issue_reset(
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        tenant = Tenant.active_objects.filter(owner=user).first()
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.user.reset_password",
            resource_type="user",
            resource_id=str(user.id),
            reason=reason,
            metadata={"email": user.email, "issued": bool(reset)},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {"email": user.email, "reset_issued": bool(reset)}

    # --- feature flags -------------------------------------------------------------

    def list_flags(self, *, tenant: Tenant) -> list[dict[str, Any]]:
        defaults = ["appointie", "shopie", "bi_full", "white_label"]
        existing = {f.key: f for f in PlatformFeatureFlag.objects.filter(tenant=tenant)}
        rows = []
        for key in defaults:
            flag = existing.get(key)
            rows.append(
                {
                    "key": key,
                    "enabled": True if flag is None else flag.enabled,
                    "metadata": flag.metadata if flag else {},
                }
            )
        for key, flag in existing.items():
            if key not in defaults:
                rows.append({"key": key, "enabled": flag.enabled, "metadata": flag.metadata})
        return rows

    @transaction.atomic
    def update_flags(
        self,
        *,
        tenant: Tenant,
        flags: dict[str, bool],
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> list[dict[str, Any]]:
        reason = self.require_reason(reason)
        before = {row["key"]: row["enabled"] for row in self.list_flags(tenant=tenant)}
        for key, enabled in flags.items():
            PlatformFeatureFlag.objects.update_or_create(
                tenant=tenant,
                key=slugify(key)[:80],
                defaults={"enabled": bool(enabled)},
            )
        after = {row["key"]: row["enabled"] for row in self.list_flags(tenant=tenant)}
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.flags.update",
            resource_type="tenant",
            resource_id=str(tenant.id),
            reason=reason,
            metadata={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return self.list_flags(tenant=tenant)

    # --- payments / refunds / ledger -----------------------------------------------

    def list_payments(self, *, tenant: Tenant) -> list[dict[str, Any]]:
        sessions = (
            BillingCheckoutSession.objects.filter(tenant=tenant)
            .select_related("business")
            .order_by("-created_at")[:100]
        )
        rows = []
        for session in sessions:
            meta = session.metadata or {}
            payment_id = meta.get("payment_id") or ""
            invoice = (
                PlatformLedgerInvoice.objects.filter(checkout_session=session).first()
                or PlatformLedgerInvoice.objects.filter(
                    tenant=tenant, razorpay_payment_id=payment_id
                ).first()
            )
            rows.append(
                {
                    "id": str(session.id),
                    "order_id": session.razorpay_order_id,
                    "payment_id": payment_id,
                    "amount_paise": session.amount_paise,
                    "currency": session.currency,
                    "status": session.status,
                    "plan_code": session.plan_code,
                    "product_code": session.product_code,
                    "business_id": str(session.business_id),
                    "business_name": session.business.display_name if session.business_id else "",
                    "paid_at": session.paid_at.isoformat() if session.paid_at else None,
                    "created_at": session.created_at.isoformat(),
                    "refunded_paise": invoice.refunded_paise if invoice else 0,
                    "invoice_id": str(invoice.id) if invoice else None,
                    "invoice_number": invoice.invoice_number if invoice else None,
                    "payment_channel": meta.get("payment_channel") or "",
                    "payment_status": meta.get("payment_status") or session.status,
                    "upi_utr": meta.get("upi_utr") or "",
                    "payment_proof_url": meta.get("payment_proof_url") or "",
                    "claimed_at": meta.get("claimed_at"),
                }
            )
        return rows

    def list_pending_upi_claims(self, *, limit: int = 100) -> list[dict[str, Any]]:
        sessions = (
            BillingCheckoutSession.objects.filter(metadata__payment_status="awaiting_confirmation")
            .select_related("tenant", "business")
            .order_by("-updated_at")[: max(1, min(int(limit), 200))]
        )
        rows = []
        for session in sessions:
            meta = session.metadata or {}
            rows.append(
                {
                    "id": str(session.id),
                    "tenant_id": str(session.tenant_id) if session.tenant_id else None,
                    "tenant_name": session.tenant.display_name if session.tenant_id else "Tenant",
                    "tenant_slug": session.tenant.slug if session.tenant_id else "",
                    "order_id": session.razorpay_order_id,
                    "payment_id": meta.get("payment_id") or "",
                    "amount_paise": session.amount_paise,
                    "currency": session.currency,
                    "status": session.status,
                    "plan_code": session.plan_code,
                    "product_code": session.product_code,
                    "business_id": str(session.business_id) if session.business_id else None,
                    "business_name": session.business.display_name if session.business_id else "",
                    "paid_at": session.paid_at.isoformat() if session.paid_at else None,
                    "created_at": session.created_at.isoformat(),
                    "payment_channel": meta.get("payment_channel") or "upi",
                    "payment_status": meta.get("payment_status") or session.status,
                    "upi_utr": meta.get("upi_utr") or "",
                    "payment_proof_url": meta.get("payment_proof_url") or "",
                    "claimed_at": meta.get("claimed_at"),
                }
            )
        return rows

    @transaction.atomic
    def confirm_upi_claim(
        self,
        *,
        tenant: Tenant,
        session_id: str,
        actor: User,
        action: str,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        session = get_object_or_404(BillingCheckoutSession, id=session_id, tenant=tenant)
        from apps.billing.services.checkout import CheckoutService

        result = CheckoutService().confirm_upi_session(
            session_id=str(session.id),
            action=action,
            note=reason,
            actor_id=str(actor.id),
        )
        meta = result.metadata or {}
        self.audit(
            actor=actor,
            action=f"upi_claim_{str(action).strip().lower()}",
            resource_type="billing_checkout_session",
            resource_id=str(result.id),
            tenant=tenant,
            reason=reason,
            metadata={
                "payment_status": meta.get("payment_status"),
                "upi_utr": meta.get("upi_utr"),
                "plan_code": result.plan_code,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {
            "session_id": str(result.id),
            "status": result.status,
            "payment_status": meta.get("payment_status"),
        }

    @transaction.atomic
    def refund_payment(
        self,
        *,
        tenant: Tenant,
        session_id: str,
        actor: User,
        reason: str,
        amount_paise: int | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        session = get_object_or_404(BillingCheckoutSession, id=session_id, tenant=tenant)
        if session.status != CheckoutSessionStatus.PAID:
            raise ValidationError({"status": "Only paid checkouts can be refunded."})
        payment_id = (session.metadata or {}).get("payment_id") or ""
        refund_amount = int(amount_paise or session.amount_paise)
        if refund_amount < 1 or refund_amount > session.amount_paise:
            raise ValidationError({"amount_paise": "Invalid refund amount."})

        invoice, _ = PlatformLedgerInvoice.objects.get_or_create(
            tenant=tenant,
            checkout_session=session,
            defaults={
                "business": session.business,
                "invoice_number": f"INV-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}",
                "amount_paise": session.amount_paise,
                "currency": session.currency,
                "status": "paid",
                "razorpay_payment_id": payment_id,
                "line_items": [
                    {
                        "description": f"{session.product_code} / {session.plan_code}",
                        "amount_paise": session.amount_paise,
                    }
                ],
            },
        )
        if invoice.refunded_paise + refund_amount > session.amount_paise:
            raise ValidationError({"amount_paise": "Refund exceeds remaining amount."})

        if not payment_id:
            raise ValidationError({"payment_id": "Checkout has no payment id to refund."})
        refund_payload = self.razorpay.refund_payment(
            payment_id=payment_id,
            amount_paise=refund_amount,
            notes={"reason": reason[:100]},
        )

        invoice.refunded_paise += refund_amount
        invoice.status = "refunded" if invoice.refunded_paise >= invoice.amount_paise else "partially_refunded"
        meta = dict(invoice.metadata or {})
        meta.setdefault("refunds", []).append(
            {"id": refund_payload.get("id"), "amount_paise": refund_amount, "reason": reason}
        )
        invoice.metadata = meta
        invoice.save(update_fields=["refunded_paise", "status", "metadata", "updated_at"])

        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.payment.refund",
            resource_type="checkout_session",
            resource_id=str(session.id),
            reason=reason,
            metadata={
                "amount_paise": refund_amount,
                "payment_id": payment_id,
                "refund_id": refund_payload.get("id"),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {
            "session_id": str(session.id),
            "refund_id": refund_payload.get("id"),
            "refunded_paise": invoice.refunded_paise,
            "status": invoice.status,
        }

    # --- credits / coupons ---------------------------------------------------------

    def credit_balance(self, *, tenant: Tenant) -> int:
        total = (
            PlatformCreditLedger.objects.filter(tenant=tenant).aggregate(v=Sum("amount_paise")).get("v")
            or 0
        )
        return int(total)

    @transaction.atomic
    def grant_credit(
        self,
        *,
        tenant: Tenant,
        actor: User,
        amount_paise: int,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        if amount_paise == 0:
            raise ValidationError({"amount_paise": "Must be non-zero."})
        balance = self.credit_balance(tenant=tenant) + amount_paise
        entry = PlatformCreditLedger.objects.create(
            tenant=tenant,
            business=self.primary_business(tenant),
            amount_paise=amount_paise,
            reason=reason,
            balance_after_paise=balance,
            created_by=actor,
        )
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.credit.grant",
            resource_type="credit",
            resource_id=str(entry.id),
            reason=reason,
            metadata={"amount_paise": amount_paise, "balance_after_paise": balance},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {"balance_paise": balance, "entry_id": str(entry.id)}

    @transaction.atomic
    def upsert_coupon(
        self,
        *,
        actor: User,
        code: str,
        percent_off: int | None,
        amount_off_paise: int | None,
        is_active: bool = True,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformCoupon:
        reason = self.require_reason(reason)
        code = slugify(code).upper().replace("-", "")[:40]
        if not code:
            raise ValidationError({"code": "Invalid code."})
        if not percent_off and not amount_off_paise:
            raise ValidationError({"percent_off": "Provide percent_off or amount_off_paise."})
        coupon, _ = PlatformCoupon.objects.update_or_create(
            code=code,
            defaults={
                "percent_off": percent_off,
                "amount_off_paise": amount_off_paise,
                "is_active": is_active,
            },
        )
        self.audit(
            actor=actor,
            action="platform.coupon.upsert",
            resource_type="coupon",
            resource_id=str(coupon.id),
            reason=reason,
            metadata={
                "code": code,
                "percent_off": percent_off,
                "amount_off_paise": amount_off_paise,
                "is_active": is_active,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return coupon

    @transaction.atomic
    def apply_coupon(
        self,
        *,
        tenant: Tenant,
        business: Business,
        code: str,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        coupon = get_object_or_404(PlatformCoupon, code=slugify(code).upper().replace("-", ""))
        if not coupon.is_active:
            raise ValidationError({"code": "Coupon is inactive."})
        if coupon.max_redemptions is not None and coupon.redemption_count >= coupon.max_redemptions:
            raise ValidationError({"code": "Coupon redemption limit reached."})
        PlatformCouponRedemption.objects.create(tenant=tenant, coupon=coupon, business=business)
        coupon.redemption_count += 1
        coupon.save(update_fields=["redemption_count", "updated_at"])
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.coupon.apply",
            resource_type="coupon",
            resource_id=str(coupon.id),
            reason=reason,
            metadata={"business_id": str(business.id), "code": coupon.code},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {"code": coupon.code, "redemption_count": coupon.redemption_count}

    # --- plan packages ---------------------------------------------------------------

    def list_plan_packages(self, *, product_code: str | None = None) -> list[dict[str, Any]]:
        qs = PlatformPlanPackage.objects.all()
        if product_code:
            qs = qs.filter(product_code=product_code.strip().lower())
        return [
            {
                "id": str(row.id),
                "product_code": row.product_code,
                "code": row.code,
                "name": row.name,
                "description": row.description,
                "billing_interval": row.billing_interval,
                "trial_days": row.trial_days,
                "is_default": row.is_default,
                "max_staff": row.max_staff,
                "max_branches": row.max_branches,
                "bi_features": row.bi_features,
                "features": row.features,
                "amount_paise": row.amount_paise,
                "yearly_amount_paise": row.yearly_amount_paise,
                "is_active": row.is_active,
                "is_public": row.is_public,
                "sort_order": row.sort_order,
                "metadata": row.metadata,
            }
            for row in qs
        ]

    @transaction.atomic
    def upsert_plan_package(
        self,
        *,
        actor: User,
        code: str,
        product_code: str,
        name: str,
        description: str = "",
        billing_interval: str = "monthly",
        trial_days: int = 15,
        is_default: bool = False,
        max_staff: int = 1,
        max_branches: int = 1,
        bi_features: list[str] | None = None,
        features: list[str] | None = None,
        amount_paise: int = 0,
        yearly_amount_paise: int | None = None,
        is_active: bool = True,
        is_public: bool = True,
        sort_order: int = 0,
        metadata: dict[str, Any] | None = None,
        reason: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PlatformPlanPackage:
        reason = self.require_reason(reason or "plan package upsert")
        normalized_code = slugify(code)[:60]
        if not normalized_code:
            raise ValidationError({"code": "Invalid code."})
        normalized_product = (product_code or "").strip().lower()
        if not normalized_product:
            raise ValidationError({"product_code": "Required."})
        if normalized_product not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})
        if not (name or "").strip():
            raise ValidationError({"name": "Required."})

        existing = PlatformPlanPackage.objects.filter(code=normalized_code).first()
        before = (
            {
                "name": existing.name,
                "amount_paise": existing.amount_paise,
                "is_active": existing.is_active,
                "is_default": existing.is_default,
            }
            if existing
            else None
        )

        if is_default:
            PlatformPlanPackage.objects.filter(product_code=normalized_product).exclude(
                code=normalized_code
            ).update(is_default=False)

        package, created = PlatformPlanPackage.objects.update_or_create(
            code=normalized_code,
            defaults={
                "product_code": normalized_product,
                "name": name.strip(),
                "description": description or "",
                "billing_interval": billing_interval or "monthly",
                "trial_days": max(0, int(trial_days)),
                "is_default": bool(is_default),
                "max_staff": max(1, int(max_staff)),
                "max_branches": max(1, int(max_branches)),
                "bi_features": list(bi_features or []),
                "features": list(features or []),
                "amount_paise": max(0, int(amount_paise)),
                "yearly_amount_paise": (
                    int(yearly_amount_paise) if yearly_amount_paise is not None else None
                ),
                "is_active": bool(is_active),
                "is_public": bool(is_public),
                "sort_order": int(sort_order),
                "metadata": metadata or {},
            },
        )
        self.audit(
            actor=actor,
            action="platform.plan_package.upsert",
            resource_type="plan_package",
            resource_id=str(package.id),
            reason=reason,
            metadata={
                "code": normalized_code,
                "product_code": normalized_product,
                "created": created,
                "before": before,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return package

    @transaction.atomic
    def seed_plan_packages_from_catalog(self, *, actor: User | None = None) -> int:
        from apps.billing.constants import PLAN_PRICE_PAISE, YEARLY_PRICE_MULTIPLIER
        from apps.businesses.constants import PRODUCT_PLAN_CATALOG

        count = 0
        sort_order = 0
        for product_code, plans in PRODUCT_PLAN_CATALOG.items():
            for plan in plans:
                sort_order += 1
                code = str(plan["code"])
                monthly = PLAN_PRICE_PAISE.get(code)
                PlatformPlanPackage.objects.update_or_create(
                    code=code,
                    defaults={
                        "product_code": product_code,
                        "name": str(plan.get("name", code)),
                        "description": str(plan.get("description", "")),
                        "billing_interval": str(plan.get("billing_interval", "monthly")),
                        "trial_days": int(plan.get("trial_days", 15) or 15),
                        "is_default": bool(plan.get("is_default", False)),
                        "max_staff": int(plan.get("max_staff", 1) or 1),
                        "max_branches": int(plan.get("max_branches", 1) or 1),
                        "bi_features": list(plan.get("bi_features") or []),
                        "features": list(plan.get("features") or []),
                        "amount_paise": monthly or 0,
                        "yearly_amount_paise": monthly * YEARLY_PRICE_MULTIPLIER if monthly else None,
                        "sort_order": sort_order,
                    },
                )
                count += 1
        if actor is not None:
            self.audit(
                actor=actor,
                action="platform.plan_package.seed_from_catalog",
                resource_type="plan_package",
                reason="seed from catalog",
                metadata={"count": count},
            )
        return count

    def get_addon_pricing(self) -> dict[str, Any]:
        from apps.billing.services.addon_pricing import serialize_addon_prices

        return serialize_addon_prices()

    @transaction.atomic
    def update_addon_pricing(
        self,
        *,
        actor: User,
        staff_price_paise: int,
        office_price_paise: int,
        pets_price_paise: int,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        from apps.billing.constants import (
            ADDON_OFFICE_PRICE_PAISE,
            ADDON_PETS_PRICE_PAISE,
            ADDON_STAFF_PRICE_PAISE,
        )
        from apps.billing.services.addon_pricing import serialize_addon_prices

        reason = self.require_reason(reason)
        if staff_price_paise < 0 or office_price_paise < 0 or pets_price_paise < 0:
            raise ValidationError({"amount": "Prices cannot be negative."})

        row, _created = PlatformAddonPricing.objects.get_or_create(
            key="default",
            defaults={
                "staff_price_paise": ADDON_STAFF_PRICE_PAISE,
                "office_price_paise": ADDON_OFFICE_PRICE_PAISE,
                "pets_price_paise": ADDON_PETS_PRICE_PAISE,
            },
        )
        before = {
            "staff_price_paise": row.staff_price_paise,
            "office_price_paise": row.office_price_paise,
            "pets_price_paise": row.pets_price_paise,
        }
        row.staff_price_paise = int(staff_price_paise)
        row.office_price_paise = int(office_price_paise)
        row.pets_price_paise = int(pets_price_paise)
        row.save(
            update_fields=[
                "staff_price_paise",
                "office_price_paise",
                "pets_price_paise",
                "updated_at",
            ]
        )
        after = serialize_addon_prices()
        self.audit(
            actor=actor,
            action="platform.addon_pricing.update",
            resource_type="addon_pricing",
            resource_id=str(row.id),
            reason=reason,
            metadata={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return after

    # --- tickets / announcements / help --------------------------------------------

    def list_tickets(self, *, tenant: Tenant | None = None) -> list[SupportTicket]:
        qs = SupportTicket.objects.select_related("requester", "assignee", "tenant").all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        return list(qs[:100])

    @transaction.atomic
    def create_ticket(
        self,
        *,
        tenant: Tenant,
        actor: User,
        subject: str,
        body: str,
        business: Business | None = None,
    ) -> SupportTicket:
        ticket = SupportTicket.objects.create(
            tenant=tenant,
            subject=subject.strip()[:255],
            requester=actor,
            business=business,
        )
        if body.strip():
            SupportTicketNote.objects.create(ticket=ticket, author=actor, body=body.strip(), is_internal=False)
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.ticket.create",
            resource_type="ticket",
            resource_id=str(ticket.id),
            reason=subject[:120],
        )
        return ticket

    def active_announcements(self) -> list[PlatformAnnouncement]:
        now = timezone.now()
        rows = PlatformAnnouncement.objects.filter(is_active=True)
        result = []
        for row in rows:
            if row.starts_at and row.starts_at > now:
                continue
            if row.ends_at and row.ends_at < now:
                continue
            result.append(row)
        return result

    def published_help_articles(self, *, query: str = "") -> list[HelpArticle]:
        qs = HelpArticle.objects.filter(is_published=True)
        q = (query or "").strip()
        if q:
            qs = qs.filter(models_q_title_body(q))
        return list(qs[:50])


def models_q_title_body(q: str):
    from django.db.models import Q

    return Q(title__icontains=q) | Q(body__icontains=q) | Q(keywords__icontains=q)
