from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Any
from uuid import uuid4

from django.db import transaction
from django.db.models import Count, F, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services.audit import record_audit
from apps.authentication.models import (
    RefreshTokenRecord,
    Role,
    User,
    UserSession,
    UserStatus,
)
from apps.authentication.services.passwords import PasswordService
from apps.authentication.services.roles import RoleService
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.constants import VALID_PRODUCT_CODES, plan_display_name, product_display_name
from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.models import (
    HelpArticle,
    PlatformAddonPricing,
    PlatformAuthSettings,
    PlatformAnnouncement,
    PlatformAuditEvent,
    PlatformCoupon,
    PlatformCouponRedemption,
    PlatformCreditLedger,
    PlatformFeatureFlag,
    PlatformLedgerInvoice,
    PlatformPlanPackage,
    PlatformSmartLookupSettings,
    SupportTicket,
    SupportTicketNote,
)
from apps.tenancy.models import Tenant, TenantStatus

logger = logging.getLogger("ie_orbit.platform_admin")


_WHATSAPP_STATUS_LABELS = {
    "live": "Live",
    "paused": "Paused",
    "verification_required": "Templates pending",
    "not_in_plan": "Not in plan",
    "not_configured": "Not configured",
}


def _whatsapp_status_label(status: str, last_error: str = "") -> str:
    if last_error:
        return "Needs attention"
    return _WHATSAPP_STATUS_LABELS.get(status, status.replace("_", " ").title())


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

    USER_SORTS: dict[str, tuple[Any, ...]] = {
        "recent": (F("created_at").desc(nulls_last=True),),
        "oldest": (F("created_at").asc(nulls_last=True),),
        "email": ("email",),
        "name": ("first_name", "last_name", "email"),
        "last_login": (F("last_login").desc(nulls_last=True),),
        "stale": (F("last_login").asc(nulls_last=True),),
    }

    def _user_status_filter(self, status: str, now: Any) -> Q | None:
        if status == "active":
            return Q(is_active=True, status=UserStatus.ACTIVE)
        if status == "disabled":
            return Q(is_active=False)
        if status == "locked":
            return Q(locked_until__gt=now)
        if status == "unverified":
            return Q(email_verified_at__isnull=True)
        if status == "suspended":
            return Q(status=UserStatus.SUSPENDED)
        if status == "never_logged_in":
            return Q(last_login__isnull=True)
        return None

    def search_users(
        self,
        *,
        query: str = "",
        status: str = "all",
        role: str = "all",
        tenants: str = "all",
        joined_within_days: int | None = None,
        sort: str = "recent",
        limit: int = 25,
        offset: int = 0,
    ) -> dict[str, Any]:
        needle = (query or "").strip()
        limit = max(1, min(int(limit or 25), 100))
        offset = max(0, int(offset or 0))
        now = timezone.now()

        base = User.objects.all()
        if needle:
            base = base.filter(
                Q(email__icontains=needle)
                | Q(first_name__icontains=needle)
                | Q(last_name__icontains=needle)
                | Q(phone_number__icontains=needle)
            )
        if role and role != "all":
            base = base.filter(user_roles__role__code=role).distinct()
        if joined_within_days:
            try:
                days = max(1, min(int(joined_within_days), 3650))
            except (TypeError, ValueError):
                raise ValidationError({"joined_within_days": "Must be a number of days."}) from None
            base = base.filter(created_at__gte=now - timedelta(days=days))

        base = base.annotate(
            owned_tenant_count=Count(
                "owned_tenants",
                filter=Q(owned_tenants__deleted_at__isnull=True),
                distinct=True,
            )
        )
        if tenants == "owners":
            base = base.filter(owned_tenant_count__gt=0)
        elif tenants == "none":
            base = base.filter(owned_tenant_count=0)

        counts = base.aggregate(
            all=Count("id", distinct=True),
            **{
                key: Count("id", filter=condition, distinct=True)
                for key, condition in {
                    "active": Q(is_active=True, status=UserStatus.ACTIVE),
                    "disabled": Q(is_active=False),
                    "locked": Q(locked_until__gt=now),
                    "unverified": Q(email_verified_at__isnull=True),
                    "suspended": Q(status=UserStatus.SUSPENDED),
                    "never_logged_in": Q(last_login__isnull=True),
                }.items()
            },
        )

        status_q = self._user_status_filter(status, now)
        filtered = base.filter(status_q) if status_q is not None else base

        ordering = self.USER_SORTS.get(sort) or self.USER_SORTS["recent"]
        total = filtered.count()
        page = list(
            filtered.order_by(*ordering).prefetch_related(
                "user_roles__role",
                Prefetch(
                    "owned_tenants",
                    queryset=Tenant.active_objects.all(),
                    to_attr="active_owned_tenants",
                ),
            )[offset : offset + limit]
        )

        rows = []
        for user in page:
            rows.append(
                {
                    "id": str(user.id),
                    "email": user.email,
                    "full_name": user.full_name,
                    "phone_number": user.phone_number,
                    "is_active": user.is_active,
                    "status": user.status,
                    "is_locked": user.is_locked,
                    "email_verified": bool(user.email_verified_at),
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                    "roles": [link.role.code for link in user.user_roles.all()],
                    "owned_tenants": [
                        {
                            "id": str(tenant.id),
                            "slug": tenant.slug,
                            "display_name": tenant.display_name,
                            "status": tenant.status,
                        }
                        for tenant in user.active_owned_tenants
                    ],
                }
            )

        return {
            "users": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
            "counts": counts,
            "roles": sorted(
                Role.objects.filter(user_roles__isnull=False).values_list("code", flat=True).distinct()
            ),
        }

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
        from apps.authentication.services.auth_otp import AuthOtpService

        sent = AuthOtpService().send(
            client="ops",
            channel="email",
            identifier=user.email,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        tenant = Tenant.active_objects.filter(owner=user).first()
        self.audit(
            actor=actor,
            tenant=tenant,
            action="platform.user.sign_in_code_sent",
            resource_type="user",
            resource_id=str(user.id),
            reason=reason,
            metadata={"email": user.email, "sent": bool(sent.get("sent"))},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        issued = bool(sent.get("sent"))
        return {"email": user.email, "sign_in_code_sent": issued, "reset_issued": issued}

    # --- feature flags -------------------------------------------------------------

    def list_flags(self, *, tenant: Tenant) -> list[dict[str, Any]]:
        defaults = [
            "appointie",
            "shopie",
            "bi_full",
            "white_label",
            "google_ads",
            "razorpay",
            "cashfree",
            "shopie_smart_lookup",
        ]
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
        from apps.billing.services.orders import product_codes_for_session, serialize_checkout_order
        from apps.billing.services.upi_proof import proof_url_from_meta

        sessions = (
            BillingCheckoutSession.objects.filter(tenant=tenant)
            .select_related("business")
            .order_by("-created_at")[:200]
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
            row = serialize_checkout_order(session)
            row.update(
                {
                    "refunded_paise": invoice.refunded_paise if invoice else 0,
                    "invoice_id": str(invoice.id) if invoice else None,
                    "invoice_number": invoice.invoice_number if invoice else None,
                    "product_codes": product_codes_for_session(session),
                    "payment_proof_url": proof_url_from_meta(meta),
                }
            )
            rows.append(row)
        return rows

    def list_upi_orders(self, *, scope: str = "pending", limit: int = 100) -> list[dict[str, Any]]:
        from apps.billing.services.orders import serialize_checkout_order

        cap = max(1, min(int(limit), 200))
        queryset = BillingCheckoutSession.objects.select_related("tenant", "business").order_by(
            "-updated_at"
        )
        wanted = str(scope or "pending").strip().lower()
        if wanted == "history":
            queryset = queryset.filter(
                Q(metadata__payment_status__in=["paid", "rejected"])
                | Q(status=CheckoutSessionStatus.PAID)
            ).exclude(metadata__payment_status="awaiting_confirmation")
        elif wanted == "all":
            queryset = queryset.filter(
                Q(metadata__payment_channel="upi_claim")
                | Q(metadata__payment_status__in=["awaiting_confirmation", "paid", "rejected"])
                | Q(status=CheckoutSessionStatus.PAID)
            )
        else:
            queryset = queryset.filter(metadata__payment_status="awaiting_confirmation")
        return [
            serialize_checkout_order(session, include_tenant=True)
            for session in queryset[:cap]
        ]

    def list_pending_upi_claims(self, *, limit: int = 100) -> list[dict[str, Any]]:
        return self.list_upi_orders(scope="pending", limit=limit)

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
                        "description": (
                            f"{product_display_name(session.product_code)} / "
                            f"{plan_display_name(plan_code=session.plan_code, product_code=session.product_code)}"
                        ),
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
                "max_extra_staff": row.max_extra_staff,
                "max_extra_offices": row.max_extra_offices,
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
        max_extra_staff: int | None = None,
        max_extra_offices: int | None = None,
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
                "max_extra_staff": (
                    None if max_extra_staff is None else max(0, int(max_extra_staff))
                ),
                "max_extra_offices": (
                    None if max_extra_offices is None else max(0, int(max_extra_offices))
                ),
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
        from apps.businesses.constants import PRODUCT_PLAN_CATALOG, plan_extra_cap

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
                        "max_extra_staff": plan_extra_cap(plan, "max_extra_staff"),
                        "max_extra_offices": plan_extra_cap(plan, "max_extra_offices"),
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

    def get_smart_lookup_settings(self) -> dict[str, Any]:
        from apps.shopie.services.smart_lookup import serialize_platform_smart_lookup_settings

        return serialize_platform_smart_lookup_settings()

    @transaction.atomic
    def update_smart_lookup_settings(
        self,
        *,
        actor: User,
        enabled: bool,
        usd_to_inr: Decimal | float | str,
        gst_percent: Decimal | float | str,
        markup_bps: int,
        min_charge_paise: int,
        input_usd_per_million: Decimal | float | str,
        output_usd_per_million: Decimal | float | str,
        suggested_top_up_paise: list[int] | None,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        from apps.shopie.services.smart_lookup import serialize_platform_smart_lookup_settings

        reason = self.require_reason(reason)
        markup = max(0, int(markup_bps or 0))
        min_charge = max(0, int(min_charge_paise or 0))
        fx = Decimal(str(usd_to_inr or "0"))
        gst = Decimal(str(gst_percent if gst_percent is not None else "18"))
        input_rate = Decimal(str(input_usd_per_million or "0"))
        output_rate = Decimal(str(output_usd_per_million or "0"))
        if fx <= 0:
            raise ValidationError({"usd_to_inr": "FX rate must be greater than zero."})
        if gst < 0 or gst > 100:
            raise ValidationError({"gst_percent": "GST % must be between 0 and 100."})
        if input_rate < 0 or output_rate < 0:
            raise ValidationError({"rates": "Token rates cannot be negative."})
        if markup > 100_000:
            raise ValidationError({"markup_bps": "Markup is too high."})

        tops: list[int] = []
        for raw in suggested_top_up_paise or []:
            value = int(raw)
            if value < 100:
                raise ValidationError({"suggested_top_up_paise": "Each top-up must be at least ₹1."})
            if value > 100_000_00:
                raise ValidationError({"suggested_top_up_paise": "Each top-up must be at most ₹1,00,000."})
            tops.append(value)
        tops = sorted(set(tops))[:8]

        row, _created = PlatformSmartLookupSettings.objects.get_or_create(
            key="default",
            defaults={
                "enabled": True,
                "usd_to_inr": Decimal("85"),
                "gst_percent": Decimal("18"),
                "markup_bps": 0,
                "min_charge_paise": 1,
                "input_usd_per_million": Decimal("0.10"),
                "output_usd_per_million": Decimal("0.40"),
                "suggested_top_up_paise": [5000, 10000, 25000, 50000],
            },
        )
        before = serialize_platform_smart_lookup_settings(row)
        previous_fx = Decimal(str(row.usd_to_inr))
        row.enabled = bool(enabled)
        row.usd_to_inr = fx
        row.gst_percent = gst
        row.markup_bps = markup
        row.min_charge_paise = min_charge
        row.input_usd_per_million = input_rate
        row.output_usd_per_million = output_rate
        row.suggested_top_up_paise = tops
        update_fields = [
            "enabled",
            "usd_to_inr",
            "gst_percent",
            "markup_bps",
            "min_charge_paise",
            "input_usd_per_million",
            "output_usd_per_million",
            "suggested_top_up_paise",
            "updated_at",
            "version",
        ]
        if previous_fx != fx:
            row.usd_to_inr_source = "manual"
            update_fields.append("usd_to_inr_source")
        row.save(update_fields=update_fields)
        after = serialize_platform_smart_lookup_settings(row)
        self.audit(
            actor=actor,
            action="platform.smart_lookup_settings.update",
            resource_type="smart_lookup_settings",
            resource_id=str(row.id),
            reason=reason,
            metadata={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return after

    def refresh_smart_lookup_fx(
        self,
        *,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        from apps.platform_admin.fx import refresh_platform_usd_inr
        from apps.shopie.services.smart_lookup import serialize_platform_smart_lookup_settings

        reason = self.require_reason(reason)
        before = serialize_platform_smart_lookup_settings()
        try:
            result = refresh_platform_usd_inr()
        except Exception as exc:  # noqa: BLE001 — surface fetch failures to admin UI
            raise ValidationError({"fx": f"Unable to refresh USD→INR: {exc}"}) from exc
        after = serialize_platform_smart_lookup_settings()
        self.audit(
            actor=actor,
            action="platform.smart_lookup_fx.refresh",
            resource_type="smart_lookup_settings",
            resource_id="default",
            reason=reason,
            metadata={"before": before, "after": after, "result": result},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {**after, "refresh": result}

    def _platform_auth_settings_row(self) -> PlatformAuthSettings:
        row, _ = PlatformAuthSettings.objects.get_or_create(key="default")
        return row

    def serialize_platform_auth_settings(self) -> dict[str, Any]:
        row = (
            PlatformAuthSettings.objects.select_related(
                "ops_otp_whatsapp_business",
                "ops_otp_whatsapp_business__tenant",
            )
            .filter(key="default")
            .first()
        )
        from apps.notifications.services.whatsapp_catalog import UNMAPPED_EVENTS, WHATSAPP_CATALOG

        business = row.ops_otp_whatsapp_business if row else None
        catalog = {
            "mapped": [
                {
                    "event_type": entry.event_type,
                    "title": entry.title,
                    "group": entry.group,
                    "meta_name": entry.meta_name,
                    "whatsapp_template_code": entry.code,
                    "notification_template_code": entry.notification_template_code,
                    "audience": entry.audience,
                    "language": entry.language,
                    "body": entry.body,
                }
                for entry in WHATSAPP_CATALOG
            ],
            "unmapped": list(UNMAPPED_EVENTS),
        }
        payload: dict[str, Any] = {
            "tenant_slug": None,
            "business_code": None,
            "business_id": None,
            "business_name": None,
            "whatsapp_status": "not_configured",
            "whatsapp_status_label": "Not configured",
            "ops_mobile_whatsapp_otp_enabled": False,
            "configured": False,
            "enabled": False,
            "display_number": "",
            "last_error": "",
            "last_tested_at": None,
            "quality_rating": "",
            "template_counts": {"total": len(WHATSAPP_CATALOG), "approved": 0, "pending": 0, "rejected": 0},
            "catalog": catalog,
        }
        if business is None:
            return payload

        from apps.authentication.services.auth_otp import AuthOtpService
        from apps.notifications.services.whatsapp_settings import WhatsAppIntegrationService

        wa = WhatsAppIntegrationService()
        public = wa.public_settings(business=business)
        status = str(public.get("status") or "not_configured")
        caps = AuthOtpService().capabilities(client="ops")
        payload.update(
            {
                "tenant_slug": business.tenant.slug,
                "business_code": business.business_code,
                "business_id": str(business.id),
                "business_name": business.display_name or business.business_name,
                "whatsapp_status": status,
                "whatsapp_status_label": _whatsapp_status_label(status, str(public.get("last_error") or "")),
                "ops_mobile_whatsapp_otp_enabled": caps.mobile_otp_via_whatsapp,
                "configured": bool(public.get("configured")),
                "enabled": bool(public.get("enabled")),
                "display_number": str(public.get("display_number") or ""),
                "last_error": str(public.get("last_error") or ""),
                "last_tested_at": public.get("last_tested_at"),
                "quality_rating": str(public.get("quality_rating") or ""),
                "template_counts": public.get("template_counts") or payload["template_counts"],
            }
        )
        return payload

    @transaction.atomic
    def update_platform_auth_settings(
        self,
        *,
        actor: User,
        tenant_slug: str | None,
        business_code: str | None,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        reason = self.require_reason(reason)
        row = self._platform_auth_settings_row()
        before = self.serialize_platform_auth_settings()
        slug = (tenant_slug or "").strip()
        code = (business_code or "").strip()
        if not slug and not code:
            row.ops_otp_whatsapp_business = None
        elif not slug or not code:
            raise ValidationError(
                {"tenant_slug": "Provide both tenant slug and business code, or clear both to disable."}
            )
        else:
            from apps.api.mobile_helpers import resolve_tenant_business

            try:
                _tenant, business = resolve_tenant_business(tenant_slug=slug, business_code=code)
            except ValueError as exc:
                raise ValidationError({"tenant_slug": str(exc)}) from exc
            row.ops_otp_whatsapp_business = business
        row.save(update_fields=["ops_otp_whatsapp_business", "updated_at"])
        after = self.serialize_platform_auth_settings()
        self.audit(
            actor=actor,
            action="platform.auth_settings.update",
            resource_type="platform_auth_settings",
            resource_id=str(row.id),
            reason=reason,
            metadata={"before": before, "after": after},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return after

    # --- tickets / announcements / help --------------------------------------------

    def list_tickets(self, *, tenant: Tenant | None = None) -> list[SupportTicket]:
        qs = (
            SupportTicket.objects.select_related("requester", "assignee", "tenant")
            .prefetch_related(_public_notes_prefetch())
            .all()
        )
        if tenant:
            qs = qs.filter(tenant=tenant)
        return list(qs[:100])

    def list_visible_tickets(self, *, user: User, tenant: Tenant | None = None) -> list[SupportTicket]:
        qs = SupportTicket.objects.select_related("requester", "assignee", "tenant").prefetch_related(
            _public_notes_prefetch()
        )
        if tenant and user_can_manage_tenant_tickets(user, tenant):
            qs = qs.filter(tenant=tenant)
        else:
            qs = qs.filter(requester=user)
            if tenant:
                qs = qs.filter(tenant=tenant)
        return list(qs.order_by("-created_at")[:50])

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
        if business is None:
            business = Business.objects.filter(tenant=tenant).order_by("created_at").first()
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
        ticket_id = ticket.id
        body_text = body
        transaction.on_commit(lambda: notify_support_ticket_created(ticket_id, body=body_text))
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
    return Q(title__icontains=q) | Q(body__icontains=q) | Q(keywords__icontains=q)


def _public_notes_prefetch():
    return Prefetch(
        "notes",
        queryset=SupportTicketNote.objects.filter(is_internal=False).order_by("created_at"),
        to_attr="public_notes",
    )


def user_is_platform_admin(user: User | None) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user.user_roles.filter(
        role__code__in={"platform_admin", "super_admin"},
        role__is_active=True,
    ).exists()


def user_can_manage_tenant_tickets(user: User, tenant: Tenant | None) -> bool:
    from apps.common.utils.workspace_access import is_workspace_manager_or_above

    if user_is_platform_admin(user):
        return True
    return is_workspace_manager_or_above(user=user, tenant=tenant)


def user_can_access_ticket(user: User, ticket: SupportTicket) -> bool:
    if ticket.requester_id == getattr(user, "id", None):
        return True
    return user_can_manage_tenant_tickets(user, ticket.tenant)


def _ticket_business(ticket: SupportTicket) -> Business | None:
    if ticket.business_id:
        return ticket.business
    return Business.objects.filter(tenant=ticket.tenant).order_by("created_at").first()


def _platform_admin_users() -> list[User]:
    return list(
        User.objects.filter(is_active=True)
        .filter(
            Q(is_superuser=True)
            | Q(
                user_roles__role__code__in=["platform_admin", "super_admin"],
                user_roles__role__is_active=True,
            )
        )
        .distinct()
    )


def notify_support_ticket_created(ticket_id: Any, *, body: str = "") -> None:
    ticket = (
        SupportTicket.objects.select_related("tenant", "requester", "business")
        .filter(id=ticket_id)
        .first()
    )
    if ticket is None:
        return
    try:
        message = body.strip() or ticket.subject
        requester = ticket.requester.email if ticket.requester_id else "someone"
        tenant_name = ticket.tenant.display_name if ticket.tenant_id else "your workspace"
        _notify_workspace_users(
            ticket,
            actor=ticket.requester,
            subject=f"New support request · {ticket.subject}",
            body=message,
            event_type="SupportTicketCreated",
            include_requester=True,
            requester_subject="We’ve received your request",
            requester_body=f"Thanks — “{ticket.subject}” is with our team. We’ll reply in Help & Support.",
        )
        admin_emails = _platform_admin_emails()
        _send_ticket_emails(
            ticket,
            recipients=admin_emails,
            headline="New support request",
            intro=f"{requester} asked for help at {tenant_name}.",
            message=message,
            cta_label="Open ticket inbox",
            cta_url=_frontend_url(f"/admin/tickets?ticket={ticket.id}"),
            accent="#0f766e",
        )
        admin_keys = {email.lower() for email in admin_emails}
        manager_emails = [
            user.email
            for user in _ticket_managers(ticket)
            if user.email
            and user.id != getattr(ticket.requester, "id", None)
            and user.email.strip().lower() not in admin_keys
        ]
        _send_ticket_emails(
            ticket,
            recipients=manager_emails,
            headline="A customer needs help",
            intro=f"{requester} sent a support request for {tenant_name}.",
            message=message,
            cta_label="View in workspace",
            cta_url=_ticket_workspace_url(ticket),
            accent="#1A56DB",
        )
        if ticket.requester and ticket.requester.email:
            _send_ticket_emails(
                ticket,
                recipients=[ticket.requester.email],
                headline="We’ve got your request",
                intro=f"Thanks for writing in. “{ticket.subject}” is open — we’ll follow up in the app.",
                message=message,
                cta_label="",
                cta_url="",
                accent="#1A56DB",
                footer_note="You’re receiving this because you submitted a support request.",
            )
    except Exception:
        logger.exception("support_ticket_notify_failed ticket_id=%s", ticket_id)


def notify_support_ticket_public_note(ticket: SupportTicket, *, actor: User, body: str) -> None:
    try:
        message = body.strip()
        actor_id = getattr(actor, "id", None)
        is_requester = actor_id == ticket.requester_id
        _notify_workspace_users(
            ticket,
            actor=actor,
            subject=f"Update on “{ticket.subject}”",
            body=message,
            event_type="SupportTicketReply",
            include_requester=True,
            requester_subject=f"New reply on “{ticket.subject}”",
            requester_body=message,
        )
        if is_requester:
            _send_ticket_emails(
                ticket,
                recipients=_platform_admin_emails(),
                headline="Customer replied",
                intro=f"{actor.email or 'A customer'} added a note on “{ticket.subject}”.",
                message=message,
                cta_label="Open ticket inbox",
                cta_url=_frontend_url(f"/admin/tickets?ticket={ticket.id}"),
                accent="#0f766e",
            )
            manager_emails = [
                user.email for user in _ticket_managers(ticket) if user.email and user.id != actor_id
            ]
            _send_ticket_emails(
                ticket,
                recipients=manager_emails,
                headline="New reply from your customer",
                intro=f"{actor.email or 'A customer'} replied on “{ticket.subject}”.",
                message=message,
                cta_label="View conversation",
                cta_url=_ticket_workspace_url(ticket),
                accent="#1A56DB",
            )
        else:
            if ticket.requester and ticket.requester.email:
                _send_ticket_emails(
                    ticket,
                    recipients=[ticket.requester.email],
                    headline="Support replied",
                    intro=f"There’s a new reply on “{ticket.subject}”. Open Help & Support in the app to continue.",
                    message=message,
                    cta_label="",
                    cta_url="",
                    accent="#1A56DB",
                    footer_note="You’re receiving this because you have an open support request.",
                )
            manager_emails = [
                user.email
                for user in _ticket_managers(ticket)
                if user.email and user.id != actor_id and user.id != ticket.requester_id
            ]
            _send_ticket_emails(
                ticket,
                recipients=manager_emails,
                headline="Support ticket updated",
                intro=f"{actor.email or 'Support'} replied on “{ticket.subject}”.",
                message=message,
                cta_label="View conversation",
                cta_url=_ticket_workspace_url(ticket),
                accent="#1A56DB",
            )
    except Exception:
        logger.exception("support_ticket_reply_notify_failed ticket_id=%s", ticket.id)


def _frontend_url(path: str) -> str:
    from django.conf import settings

    base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def _ticket_workspace_url(ticket: SupportTicket) -> str:
    from apps.notifications.services.record_links import record_cta

    return record_cta(audience="admin", kind="ticket", record_id=ticket.id)["cta_url"]


def _platform_admin_emails() -> list[str]:
    from django.conf import settings

    fallback = getattr(settings, "CONTACT_FORM_RECIPIENT_EMAIL", "support@indiansempire.com")
    emails: list[str] = []
    seen: set[str] = set()
    for admin in _platform_admin_users():
        email = (admin.email or "").strip()
        key = email.lower()
        if email and key not in seen:
            seen.add(key)
            emails.append(email)
    if fallback:
        key = fallback.strip().lower()
        if key not in seen:
            emails.append(fallback.strip())
    return emails


def _ticket_managers(ticket: SupportTicket) -> list[User]:
    from apps.common.utils.workspace_access import resolve_business_manager_users

    business = _ticket_business(ticket)
    if business is None:
        return []
    return resolve_business_manager_users(tenant=ticket.tenant, business=business)


def _support_ticket_card_html(ticket: SupportTicket, *, message: str) -> str:
    from apps.notifications.services.providers.email import escape_email

    status = (ticket.status or "open").replace("_", " ")
    status_colors = {"open": "#0f766e", "pending": "#b45309", "resolved": "#1d4ed8"}
    pill = status_colors.get((ticket.status or "").lower(), "#0f1111")
    requester = ticket.requester.email if ticket.requester_id else "Unknown"
    tenant_name = ticket.tenant.display_name if ticket.tenant_id else "—"
    opened = timezone.localtime(ticket.created_at).strftime("%d %b %Y · %I:%M %p")
    quote = escape_email(message.strip() or "No message provided.").replace("\n", "<br />")
    subject = escape_email(ticket.subject)
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="margin:18px 0 0;border:1px solid #d5d9d9;border-radius:12px;overflow:hidden;background:#ffffff;">'
        '<tr><td style="padding:16px 18px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>'
        f'<td style="font-size:13px;font-weight:800;color:#0f1111;">{subject}</td>'
        f'<td align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;'
        f'background:{pill};color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.04em;'
        f'text-transform:uppercase;">{escape_email(status)}</span></td>'
        "</tr></table></td></tr>"
        '<tr><td style="padding:16px 18px;">'
        f'<div style="margin:0 0 14px;padding:12px 14px;border-left:3px solid {pill};background:#f4f8ff;'
        f'border-radius:0 10px 10px 0;font-size:14px;line-height:1.65;color:#0f1111;">{quote}</div>'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#565959;">'
        f'<tr><td style="padding:4px 0;width:92px;font-weight:700;color:#0f1111;">From</td>'
        f"<td style=\"padding:4px 0;\">{escape_email(requester)}</td></tr>"
        f'<tr><td style="padding:4px 0;font-weight:700;color:#0f1111;">Business</td>'
        f"<td style=\"padding:4px 0;\">{escape_email(tenant_name)}</td></tr>"
        f'<tr><td style="padding:4px 0;font-weight:700;color:#0f1111;">Opened</td>'
        f"<td style=\"padding:4px 0;\">{escape_email(opened)}</td></tr>"
        "</table></td></tr></table>"
    )


def _send_ticket_emails(
    ticket: SupportTicket,
    *,
    recipients: list[str],
    headline: str,
    intro: str,
    message: str,
    cta_label: str,
    cta_url: str,
    accent: str,
    footer_note: str = "",
) -> None:
    from apps.notifications.services.providers.email import send_branded_email

    unique: list[str] = []
    seen: set[str] = set()
    for email in recipients:
        key = (email or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(email.strip())
    extra = _support_ticket_card_html(ticket, message=message)
    for recipient in unique:
        try:
            send_branded_email(
                subject=f"{headline} · {ticket.subject}",
                body=intro,
                recipient=recipient,
                business_name="IE Orbit",
                headline=headline,
                extra_html=extra,
                cta_label=cta_label,
                cta_url=cta_url,
                accent_color=accent,
                footer_note=footer_note or "You’re receiving this because of a support ticket on IE Orbit.",
                fail_silently=False,
            )
        except Exception:
            logger.exception("support_ticket_email_failed recipient=%s", recipient)


def _notify_workspace_users(
    ticket: SupportTicket,
    *,
    actor: User | None,
    subject: str,
    body: str,
    event_type: str,
    include_requester: bool,
    requester_subject: str,
    requester_body: str,
) -> None:
    from apps.notifications.constants import AUDIENCE_ADMIN, AUDIENCE_CUSTOMER
    from apps.notifications.services.staff_direct import StaffDirectNotifier

    business = _ticket_business(ticket)
    if business is None:
        return
    notifier = StaffDirectNotifier()
    wanted = {"in_app"}
    actor_id = getattr(actor, "id", None)
    managers = _ticket_managers(ticket)
    notified: set[Any] = set()

    for user in managers:
        if actor_id and user.id == actor_id:
            continue
        result = notifier._notify_user(
            tenant=ticket.tenant,
            business=business,
            user=user,
            subject=subject,
            body=body,
            wanted=wanted,
            meta={"event_type": event_type, "audience": AUDIENCE_ADMIN, "ticket_id": str(ticket.id)},
        )
        if result.get("sent_channels"):
            notified.add(user.id)

    requester = ticket.requester
    if include_requester and requester is not None and requester.id not in notified:
        if actor_id and requester.id == actor_id and event_type == "SupportTicketReply":
            return
        manager_ids = {user.id for user in managers}
        notifier._notify_user(
            tenant=ticket.tenant,
            business=business,
            user=requester,
            subject=requester_subject,
            body=requester_body,
            wanted=wanted,
            meta={
                "event_type": event_type,
                "audience": AUDIENCE_ADMIN if requester.id in manager_ids else AUDIENCE_CUSTOMER,
                "ticket_id": str(ticket.id),
            },
        )
