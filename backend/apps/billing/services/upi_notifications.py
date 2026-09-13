from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.utils import timezone

from apps.billing.models import BillingCheckoutSession
from apps.businesses.constants import PRODUCT_DISPLAY_NAMES
from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.services.subscription_direct import (
    SubscriptionEmailStyle,
    notify_subscription_users,
)

logger = logging.getLogger("ie_orbit.billing.upi_notifications")


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def _product_labels(session: BillingCheckoutSession) -> str:
    meta = session.metadata or {}
    codes: list[str] = []
    for item in meta.get("line_items") or []:
        code = str(item.get("product_code") or "").strip()
        if code and code not in codes:
            codes.append(code)
    if session.product_code and session.product_code not in codes:
        codes.insert(0, session.product_code)
    names = [PRODUCT_DISPLAY_NAMES.get(code, code) for code in codes]
    if not names:
        return "IE Orbit"
    if len(names) == 1:
        return names[0]
    return " and ".join(names)


def _amount_label(session: BillingCheckoutSession) -> str:
    paise = int(session.amount_paise or 0)
    return f"₹{paise // 100}"


def _operator_users(session: BillingCheckoutSession) -> list[Any]:
    from apps.common.utils.workspace_access import resolve_business_manager_users

    users = resolve_business_manager_users(tenant=session.tenant, business=session.business)
    recipients = [
        user
        for user in users
        if user.user_roles.filter(
            role__is_active=True,
            role__code__in={"business_owner", "manager"},
        ).exists()
        or getattr(session.tenant, "owner_id", None) == user.id
    ]
    return recipients or users


def _session_meta(session: BillingCheckoutSession, *, screen: str) -> dict[str, Any]:
    return {
        "session_id": str(session.id),
        "product_code": session.product_code,
        "plan_code": session.plan_code,
        "business_id": str(session.business_id) if session.business_id else "",
        "screen": screen,
    }


def _ie_orbit_email(*, headline: str, cta_label: str, cta_url: str) -> SubscriptionEmailStyle:
    return SubscriptionEmailStyle(
        business_name="IE Orbit",
        headline=headline,
        cta_label=cta_label,
        cta_url=cta_url,
        accent_color="#1A56DB",
        footer_note="You’re receiving this because of an IE Orbit subscription payment.",
        fail_silently=False,
    )


def _email_fallback_admins(
    *,
    users: list[Any],
    subject: str,
    body: str,
    style: SubscriptionEmailStyle,
) -> None:
    from apps.notifications.services.providers.email import send_branded_email
    from apps.platform_admin.services import _platform_admin_emails

    covered = {(getattr(user, "email", "") or "").strip().lower() for user in users}
    for email in _platform_admin_emails():
        key = email.strip().lower()
        if not key or key in covered:
            continue
        try:
            send_branded_email(
                subject=subject,
                body=body,
                recipient=email,
                business_name=style.business_name,
                logo_url=style.logo_url,
                accent_color=style.accent_color,
                headline=style.headline,
                extra_html=style.extra_html,
                cta_label=style.cta_label,
                cta_url=style.cta_url,
                footer_note=style.footer_note,
                fail_silently=style.fail_silently,
            )
        except Exception:
            logger.exception("upi_claim_admin_email_failed recipient=%s", email)


def notify_upi_claim_submitted(session: BillingCheckoutSession) -> None:
    products = _product_labels(session)
    amount = _amount_label(session)
    tenant_name = session.tenant.display_name if session.tenant_id else "a workspace"
    business_name = session.business.display_name if session.business_id else "a business"
    utr = str((session.metadata or {}).get("upi_utr") or "").strip() or "not provided"
    claimed = str((session.metadata or {}).get("claimed_at") or timezone.now().isoformat())
    admin_subject = f"UPI claim waiting · {tenant_name} · {products}"
    admin_body = (
        f"{business_name} at {tenant_name} submitted a UPI payment of {amount} for {products}.\n"
        f"UTR: {utr}\n"
        f"Submitted: {claimed}\n"
        "Confirm the claim to activate the subscription."
    )
    owner_subject = f"We received your {products} payment"
    owner_body = (
        f"Thanks — your UPI payment of {amount} for {products} is with our team.\n"
        "Access stays as-is until we confirm (usually the same day). "
        "You can keep this screen open; the status will change to Payment under review."
    )
    try:
        from apps.platform_admin.services import _platform_admin_users

        admins = _platform_admin_users()
        admin_email = _ie_orbit_email(
            headline="UPI payment to confirm",
            cta_label="Open claims inbox",
            cta_url=_frontend_url(f"/admin/claims?claim={session.id}"),
        )
        notify_subscription_users(
            tenant=session.tenant,
            business=session.business,
            users=admins,
            subject=admin_subject,
            body=admin_body,
            event_type="billing.upi_claim_submitted",
            metadata=_session_meta(session, screen="PlatformAdminTenantDetail"),
            audience=AUDIENCE_ADMIN,
            email_style=admin_email,
        )
        _email_fallback_admins(
            users=admins,
            subject=admin_subject,
            body=admin_body,
            style=admin_email,
        )
    except Exception:
        logger.exception("upi_claim_admin_notify_failed session_id=%s", session.id)

    notify_subscription_users(
        tenant=session.tenant,
        business=session.business,
        users=_operator_users(session),
        subject=owner_subject,
        body=owner_body,
        event_type="billing.upi_claim_submitted",
        metadata=_session_meta(session, screen="ProductSettings"),
        audience=AUDIENCE_ADMIN,
        email_style=_ie_orbit_email(
            headline="Payment received",
            cta_label="View subscriptions",
            cta_url=_frontend_url("/settings/products"),
        ),
    )


def notify_upi_claim_resolved(
    session: BillingCheckoutSession,
    *,
    action: str,
    note: str = "",
) -> None:
    products = _product_labels(session)
    amount = _amount_label(session)
    tenant_name = session.tenant.display_name if session.tenant_id else "a workspace"
    business_name = session.business.display_name if session.business_id else "a business"
    confirmed = str(action or "").strip().lower() == "confirm"
    if confirmed:
        owner_subject = f"{products} is active"
        owner_body = (
            f"Your UPI payment of {amount} for {products} is confirmed. "
            "The product is unlocked for this billing period. We do not charge automatically — "
            "pay again before the next due date to stay unlocked."
        )
        owner_headline = "Subscription renewed"
        admin_subject = f"UPI claim confirmed · {tenant_name} · {products}"
        admin_body = (
            f"{business_name} at {tenant_name} is now active for {products} "
            f"after a confirmed UPI payment of {amount}."
        )
        admin_headline = "Claim confirmed"
    else:
        reason = str(note or "").strip() or "The payment could not be matched."
        owner_subject = f"{products} payment was not confirmed"
        owner_body = (
            f"We could not confirm your UPI payment of {amount} for {products}. {reason} "
            "Open Products & billing to pay again or upload a clearer screenshot."
        )
        owner_headline = "Payment not confirmed"
        admin_subject = f"UPI claim rejected · {tenant_name} · {products}"
        admin_body = (
            f"{business_name} at {tenant_name} was not activated for {products}. {reason}"
        )
        admin_headline = "Claim rejected"

    try:
        from apps.platform_admin.services import _platform_admin_users

        admins = _platform_admin_users()
        admin_email = _ie_orbit_email(
            headline=admin_headline,
            cta_label="Open claims inbox",
            cta_url=_frontend_url(f"/admin/claims?claim={session.id}"),
        )
        notify_subscription_users(
            tenant=session.tenant,
            business=session.business,
            users=admins,
            subject=admin_subject,
            body=admin_body,
            event_type="billing.upi_claim_resolved",
            metadata=_session_meta(session, screen="PlatformAdminTenantDetail"),
            audience=AUDIENCE_ADMIN,
            email_style=admin_email,
        )
        _email_fallback_admins(
            users=admins,
            subject=admin_subject,
            body=admin_body,
            style=admin_email,
        )
    except Exception:
        logger.exception("upi_claim_resolved_admin_notify_failed session_id=%s", session.id)

    notify_subscription_users(
        tenant=session.tenant,
        business=session.business,
        users=_operator_users(session),
        subject=owner_subject,
        body=owner_body,
        event_type="billing.upi_claim_resolved",
        metadata=_session_meta(session, screen="ProductSettings"),
        audience=AUDIENCE_ADMIN,
        email_style=_ie_orbit_email(
            headline=owner_headline,
            cta_label="View subscriptions",
            cta_url=_frontend_url("/settings/products"),
        ),
    )
