from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import exceptions

from apps.authentication.models import PasswordHistory, PasswordResetToken, User
from apps.authentication.repositories.users import UserRepository
from apps.authentication.security.tokens import generate_plain_token, hash_token
from apps.authentication.services.audit import SecurityAuditService
from apps.notifications.services.providers.email import email_info_card, send_branded_email


@dataclass(frozen=True)
class PasswordResetRequest:
    token: str
    user: User


class PasswordService:
    def __init__(
        self,
        user_repository: UserRepository | None = None,
        audit_service: SecurityAuditService | None = None,
    ) -> None:
        self.user_repository = user_repository or UserRepository()
        self.audit_service = audit_service or SecurityAuditService()

    def request_reset(
        self,
        *,
        email: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PasswordResetRequest | None:
        user = self.user_repository.get_active_by_email(email)
        if not user:
            return None
        return self.issue_reset(user=user, ip_address=ip_address, user_agent=user_agent)

    def issue_reset(
        self,
        *,
        user: User,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> PasswordResetRequest:
        token = generate_plain_token()
        PasswordResetToken.objects.create(
            user=user,
            token_hash=hash_token(token),
            expires_at=timezone.now()
            + timedelta(minutes=settings.IAM_SETTINGS["PASSWORD_RESET_TOKEN_MINUTES"]),
            ip_address=ip_address,
        )
        frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
        reset_url = f"{frontend_base}/auth/reset-password?token={token}"
        minutes = settings.IAM_SETTINGS["PASSWORD_RESET_TOKEN_MINUTES"]
        body = (
            "We received a request to reset your IE Orbit password.\n\n"
            f"This link expires in {minutes} minutes. If you did not ask for a reset, you can ignore this email."
        )
        send_branded_email(
            subject="Reset your IE Orbit password",
            body=body,
            recipient=user.email,
            business_name="IE Orbit",
            headline="Reset your password",
            cta_label="Reset password",
            cta_url=reset_url,
            extra_html=email_info_card(
                title="Can’t open the button?",
                lines=[
                    "Copy and paste this link into your browser:",
                    reset_url,
                    f"Or use this token: {token}",
                ],
            ),
            footer_note="For your security, never share this link with anyone.",
            fail_silently=True,
        )
        self.audit_service.record(
            event_type="password_reset_requested",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return PasswordResetRequest(token=token, user=user)

    def reset_password(self, *, token: str, new_password: str) -> User:
        reset_token = PasswordResetToken.objects.filter(token_hash=hash_token(token)).first()
        if not reset_token:
            raise exceptions.ValidationError({"token": "Password reset token is invalid."})
        if not reset_token.is_usable:
            raise exceptions.ValidationError(
                {"token": "Password reset token is invalid or expired."}
            )
        user = reset_token.user
        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        PasswordHistory.objects.create(user=user, password_hash=user.password)
        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=["used_at", "updated_at"])
        self.audit_service.record(event_type="password_reset_completed", user=user)
        return user

    def change_password(self, *, user: User, current_password: str, new_password: str) -> None:
        if not user.check_password(current_password):
            raise exceptions.ValidationError({"current_password": "Current password is invalid."})
        validate_password(new_password, user=user)
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        PasswordHistory.objects.create(user=user, password_hash=user.password)
        self.audit_service.record(event_type="password_changed", user=user)
