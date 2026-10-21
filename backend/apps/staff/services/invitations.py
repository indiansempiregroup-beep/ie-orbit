from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services.audit import record_audit
from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.businesses.models import Business
from apps.common.utils.business_identity import assert_no_staff_customer_conflict
from apps.staff.models import INVITABLE_PLATFORM_ROLES, InvitationStatus, Staff, StaffInvitation
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.staff.invitations")

INVITATION_TTL_DAYS = 7
PENDING_INVITE_LOGIN_MESSAGE = (
    "Accept your team invitation first. Open the invite email, tap Accept invitation, "
    "then sign in from the IE Orbit app."
)
ALREADY_USED_INVITE_MESSAGE = "This invitation has already been used. Sign in from the IE Orbit app."
EXPIRED_INVITE_MESSAGE = "This invitation has expired. Ask your owner to send a new invite."
REVOKED_INVITE_MESSAGE = "This invitation was revoked. Ask your owner to send a new invite."
INVALID_INVITE_MESSAGE = "This invitation link is invalid."


def pending_invitation_for_login(*, channel: str, identifier: str) -> StaffInvitation | None:
    pending = StaffInvitation.objects.filter(
        status=InvitationStatus.PENDING,
        expires_at__gte=timezone.now(),
    )
    if channel == "email":
        email = identifier.strip().lower()
        if not email:
            return None
        return pending.filter(email__iexact=email).order_by("-created_at").first()

    from apps.customers.services.contact import format_contact_phone

    phone = format_contact_phone(identifier, e164=True)
    raw = identifier.strip()
    if not phone and not raw:
        return None
    phone_filter = Q()
    if phone:
        phone_filter |= Q(phone_number=phone)
    if raw:
        phone_filter |= Q(phone_number=raw)
    staff_matches = list(Staff.objects.filter(phone_filter).exclude(email=""))
    if not staff_matches:
        return None
    email_q = Q()
    for staff in staff_matches:
        email_q |= Q(email__iexact=staff.email, tenant_id=staff.tenant_id, business_id=staff.business_id)
    return pending.filter(email_q).order_by("-created_at").first()


class StaffInvitationService:
    def __init__(self, role_service: RoleService | None = None) -> None:
        self.role_service = role_service or RoleService()

    def list_invitations(self, *, tenant: Tenant, business: Business) -> list[StaffInvitation]:
        return list(
            StaffInvitation.objects.filter(
                tenant=tenant,
                business=business,
            ).order_by("-created_at")
        )

    def create_invitation(
        self,
        *,
        tenant: Tenant,
        business: Business,
        email: str,
        platform_role_code: str,
        invited_by: User,
    ) -> StaffInvitation:
        normalized_email = email.strip().lower()
        role_code = platform_role_code.strip().lower()
        if role_code not in INVITABLE_PLATFORM_ROLES:
            raise ValidationError({"platform_role_code": "Only manager or staff roles can be invited."})

        existing_user = User.objects.filter(email__iexact=normalized_email).first() if normalized_email else None
        assert_no_staff_customer_conflict(
            tenant=tenant,
            business=business,
            email=normalized_email,
            phone=getattr(existing_user, "phone_number", "") or "",
            user=existing_user,
            creating="staff",
        )

        existing = StaffInvitation.objects.filter(
            tenant=tenant,
            business=business,
            email=normalized_email,
            status=InvitationStatus.PENDING,
        ).first()
        if existing:
            existing.token = uuid.uuid4()
            existing.platform_role_code = role_code
            existing.invited_by = invited_by
            existing.expires_at = timezone.now() + timedelta(days=INVITATION_TTL_DAYS)
            existing.save(
                update_fields=["token", "platform_role_code", "invited_by", "expires_at", "updated_at"]
            )
            self._send_invitation_email(invitation=existing)
            record_audit(
                tenant=tenant,
                action="staff.invitation.resent",
                resource_type="staff_invitation",
                resource_id=str(existing.id),
                actor_id=str(invited_by.id),
                metadata={"email": normalized_email, "role": role_code},
            )
            return existing

        invitation = StaffInvitation.objects.create(
            tenant=tenant,
            business=business,
            email=normalized_email,
            platform_role_code=role_code,
            token=uuid.uuid4(),
            status=InvitationStatus.PENDING,
            invited_by=invited_by,
            expires_at=timezone.now() + timedelta(days=INVITATION_TTL_DAYS),
        )
        self._send_invitation_email(invitation=invitation)
        record_audit(
            tenant=tenant,
            action="staff.invitation.created",
            resource_type="staff_invitation",
            resource_id=str(invitation.id),
            actor_id=str(invited_by.id),
            metadata={"email": normalized_email, "role": role_code},
        )
        return invitation

    def revoke_invitation(
        self,
        *,
        tenant: Tenant,
        business: Business,
        invitation_id: str,
        actor: User,
    ) -> StaffInvitation:
        invitation = StaffInvitation.objects.get(
            id=invitation_id,
            tenant=tenant,
            business=business,
        )
        if invitation.status != InvitationStatus.PENDING:
            raise ValidationError({"invitation": "Only pending invitations can be revoked."})
        invitation.status = InvitationStatus.REVOKED
        invitation.save(update_fields=["status", "updated_at"])
        record_audit(
            tenant=tenant,
            action="staff.invitation.revoked",
            resource_type="staff_invitation",
            resource_id=str(invitation.id),
            actor_id=str(actor.id),
        )
        return invitation

    def preview_invitation(self, *, token: str) -> dict[str, str | None]:
        try:
            invitation = StaffInvitation.objects.select_related("business").get(token=token)
        except (StaffInvitation.DoesNotExist, ValueError, TypeError):
            return {"status": "invalid", "business_name": None, "role": None, "email": None}

        if invitation.status == InvitationStatus.PENDING and invitation.expires_at < timezone.now():
            invitation.status = InvitationStatus.EXPIRED
            invitation.save(update_fields=["status", "updated_at"])

        return {
            "status": invitation.status,
            "business_name": invitation.business.display_name if invitation.business_id else None,
            "role": invitation.platform_role_code,
            "email": invitation.email,
        }

    def accept_invitation(
        self,
        *,
        token: str,
        password: str | None = None,
        first_name: str = "",
        last_name: str = "",
    ) -> dict[str, object]:
        with transaction.atomic():
            try:
                invitation = (
                    StaffInvitation.objects.select_related("business", "tenant")
                    .select_for_update()
                    .get(token=token)
                )
            except StaffInvitation.DoesNotExist as exc:
                raise ValidationError({"token": INVALID_INVITE_MESSAGE}) from exc

            if invitation.status == InvitationStatus.ACCEPTED:
                raise ValidationError({"token": ALREADY_USED_INVITE_MESSAGE})
            if invitation.status == InvitationStatus.REVOKED:
                raise ValidationError({"token": REVOKED_INVITE_MESSAGE})
            if invitation.status == InvitationStatus.EXPIRED or invitation.expires_at < timezone.now():
                if invitation.status != InvitationStatus.EXPIRED:
                    invitation.status = InvitationStatus.EXPIRED
                    invitation.save(update_fields=["status", "updated_at"])
                raise ValidationError({"token": EXPIRED_INVITE_MESSAGE})
            if invitation.status != InvitationStatus.PENDING:
                raise ValidationError({"token": INVALID_INVITE_MESSAGE})

            resolved_first, resolved_last = self._resolve_invitee_names(
                invitation=invitation,
                first_name=first_name,
                last_name=last_name,
            )
            user = User.objects.filter(email__iexact=invitation.email).first()
            created_user = False
            if not user:
                user = User.objects.create_user(
                    email=invitation.email,
                    password=None,
                    first_name=resolved_first,
                    last_name=resolved_last,
                    status=UserStatus.ACTIVE,
                )
                user.mark_email_verified()
                created_user = True

            self.role_service.assign_role(
                user=user,
                role_code=invitation.platform_role_code,
                assigned_by=str(invitation.invited_by_id) if invitation.invited_by_id else None,
            )

            staff = self._ensure_staff_profile(
                tenant=invitation.tenant,
                business=invitation.business,
                user=user,
                email=invitation.email,
            )

            invitation.status = InvitationStatus.ACCEPTED
            invitation.accepted_at = timezone.now()
            invitation.staff = staff
            invitation.save(update_fields=["status", "accepted_at", "staff", "updated_at"])

            record_audit(
                tenant=invitation.tenant,
                action="staff.invitation.accepted",
                resource_type="staff_invitation",
                resource_id=str(invitation.id),
                actor_id=str(user.id),
                metadata={"created_user": created_user},
            )

            return {
                "invitation_id": str(invitation.id),
                "user_id": str(user.id),
                "staff_id": str(staff.id),
                "email": user.email,
                "created_user": created_user,
            }

    def _directory_staff_for_invitation(self, invitation: StaffInvitation) -> Staff | None:
        normalized_email = (invitation.email or "").strip().lower()
        if not normalized_email:
            return None
        return (
            Staff.objects.filter(
                tenant=invitation.tenant,
                business=invitation.business,
                email__iexact=normalized_email,
            )
            .exclude(email="")
            .first()
        )

    def _resolve_invitee_names(
        self,
        *,
        invitation: StaffInvitation,
        first_name: str = "",
        last_name: str = "",
    ) -> tuple[str, str]:
        staff = self._directory_staff_for_invitation(invitation)
        local_part = invitation.email.split("@")[0] if invitation.email else "staff"
        resolved_first = (
            (staff.first_name.strip() if staff and staff.first_name else "")
            or first_name.strip()
            or local_part
        )
        resolved_last = (staff.last_name.strip() if staff and staff.last_name else "") or last_name.strip()
        return resolved_first, resolved_last

    def _ensure_staff_profile(
        self,
        *,
        tenant: Tenant,
        business: Business,
        user: User,
        email: str,
    ) -> Staff:
        existing = Staff.objects.filter(tenant=tenant, business=business, user=user).first()
        if existing:
            return existing

        normalized_email = email.strip().lower()
        by_email = (
            Staff.objects.filter(tenant=tenant, business=business, email__iexact=normalized_email)
            .exclude(email="")
            .first()
            if normalized_email
            else None
        )
        if by_email:
            if by_email.user_id is None:
                by_email.user = user
                by_email.email = normalized_email
                by_email.save(update_fields=["user", "email", "updated_at"])
            return by_email

        assert_no_staff_customer_conflict(
            tenant=tenant,
            business=business,
            email=normalized_email,
            phone=user.phone_number or "",
            user=user,
            creating="staff",
        )

        local_part = normalized_email.split("@")[0] if normalized_email else "staff"
        staff_code = local_part.replace(".", "-")[:40]
        suffix = 1
        candidate = staff_code
        while Staff.objects.filter(tenant=tenant, business=business, staff_code=candidate).exists():
            candidate = f"{staff_code}-{suffix}"
            suffix += 1

        return Staff.objects.create(
            tenant=tenant,
            business=business,
            user=user,
            staff_code=candidate,
            first_name=user.first_name or local_part,
            last_name=user.last_name,
            display_name=user.full_name or local_part,
            email=normalized_email,
        )

    def _send_invitation_email(self, *, invitation: StaffInvitation) -> None:
        from apps.notifications.services.providers.email import email_info_card, send_branded_email

        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")
        accept_url = f"{frontend_base.rstrip('/')}/auth/accept-invitation?token={invitation.token}"
        business_name = invitation.business.display_name
        body = (
            f"You've been invited to join {business_name} as {invitation.platform_role_code}.\n\n"
            f"Open this link once to accept. After that, download the IE Orbit app and sign in with a "
            f"one-time code. This link expires on {invitation.expires_at:%Y-%m-%d}."
        )
        send_branded_email(
            subject=f"You're invited to join {business_name} on IE Orbit",
            body=body,
            recipient=invitation.email,
            business_name=business_name or "IE Orbit",
            headline="You're invited to join the team",
            cta_label="Accept invitation",
            cta_url=accept_url,
            extra_html=email_info_card(
                title="Invitation details",
                lines=[
                    f"Business: {business_name}",
                    f"Role: {invitation.platform_role_code}",
                    f"Expires: {invitation.expires_at:%Y-%m-%d}",
                ],
            ),
            fail_silently=False,
        )
        logger.info(
            "staff.invitation_sent",
            extra={"invitation_id": str(invitation.id), "email": invitation.email},
        )
