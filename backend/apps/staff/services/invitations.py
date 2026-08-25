from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services.audit import record_audit
from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.businesses.models import Business
from apps.staff.models import INVITABLE_PLATFORM_ROLES, InvitationStatus, Staff, StaffInvitation
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.staff.invitations")

INVITATION_TTL_DAYS = 7


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

        if StaffInvitation.objects.filter(
            tenant=tenant,
            business=business,
            email=normalized_email,
            status=InvitationStatus.PENDING,
        ).exists():
            raise ValidationError({"email": "A pending invitation already exists for this email."})

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

    def accept_invitation(
        self,
        *,
        token: str,
        password: str | None = None,
        first_name: str = "",
        last_name: str = "",
    ) -> dict[str, object]:
        try:
            invitation = StaffInvitation.objects.select_related("business", "tenant").get(
                token=token,
                status=InvitationStatus.PENDING,
            )
        except StaffInvitation.DoesNotExist as exc:
            raise ValidationError({"token": "Invitation is invalid or no longer active."}) from exc

        if invitation.expires_at < timezone.now():
            invitation.status = InvitationStatus.EXPIRED
            invitation.save(update_fields=["status", "updated_at"])
            raise ValidationError({"token": "Invitation has expired."})

        user = User.objects.filter(email__iexact=invitation.email).first()
        created_user = False
        if not user:
            if not password:
                raise ValidationError({"password": "Password is required for new accounts."})
            user = User.objects.create_user(
                email=invitation.email,
                password=password,
                first_name=first_name or invitation.email.split("@")[0],
                last_name=last_name,
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

        local_part = email.split("@")[0]
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
            email=email,
        )

    def _send_invitation_email(self, *, invitation: StaffInvitation) -> None:
        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000")
        accept_url = f"{frontend_base.rstrip('/')}/auth/accept-invitation?token={invitation.token}"
        business_name = invitation.business.display_name
        send_mail(
            subject=f"You are invited to join {business_name} on IE Orbit",
            message=(
                f"You have been invited to join {business_name} as {invitation.platform_role_code}.\n\n"
                f"Accept your invitation: {accept_url}\n\n"
                f"This link expires on {invitation.expires_at:%Y-%m-%d}."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[invitation.email],
            fail_silently=False,
        )
        logger.info(
            "staff.invitation_sent",
            extra={"invitation_id": str(invitation.id), "email": invitation.email},
        )
