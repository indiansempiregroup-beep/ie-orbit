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
from apps.authentication.models import User
from apps.authentication.services.passwords import PasswordService
from apps.authentication.services.roles import RoleService
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.models import (
    HelpArticle,
    PlatformAnnouncement,
    PlatformAuditEvent,
    PlatformCoupon,
    PlatformCouponRedemption,
    PlatformCreditLedger,
    PlatformFeatureFlag,
    PlatformLedgerInvoice,
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
        business = self.primary_business(tenant)
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
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.save(update_fields=["status", "updated_at"])
        elif action == "force_soft_lock":
            subscription.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
            subscription.save(update_fields=["status", "updated_at"])
        elif action == "extend_trial":
            days = int(payload.get("days") or 0)
            if days < 1:
                raise ValidationError({"days": "Must be >= 1."})
            base = subscription.trial_ends_at or timezone.now()
            if base < timezone.now():
                base = timezone.now()
            subscription.trial_ends_at = base + timedelta(days=days)
            subscription.status = BusinessProductSubscriptionStatus.TRIALING
            subscription.save(update_fields=["trial_ends_at", "status", "updated_at"])
        elif action == "set_complimentary":
            days = int(payload.get("days") or 30)
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.trial_ends_at = timezone.now() + timedelta(days=days)
            subscription.external_billing_reference = f"comp:{actor.id}:{timezone.now().date().isoformat()}"
            subscription.save(
                update_fields=["status", "trial_ends_at", "external_billing_reference", "updated_at"]
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
        user.save(update_fields=["is_active", "updated_at"])
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
        reset = self.passwords.request_reset(
            email=user.email,
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
        defaults = ["appointie", "shopie", "crmie", "bi_full", "white_label"]
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
            payment_id = (session.metadata or {}).get("payment_id") or ""
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
                    "paid_at": session.paid_at.isoformat() if session.paid_at else None,
                    "created_at": session.created_at.isoformat(),
                    "refunded_paise": invoice.refunded_paise if invoice else 0,
                    "invoice_id": str(invoice.id) if invoice else None,
                    "invoice_number": invoice.invoice_number if invoice else None,
                }
            )
        return rows

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
