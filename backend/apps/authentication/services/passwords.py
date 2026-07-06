from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import exceptions

from apps.authentication.models import PasswordHistory, PasswordResetToken, User
from apps.authentication.repositories.users import UserRepository
from apps.authentication.security.tokens import generate_plain_token, hash_token
from apps.authentication.services.audit import SecurityAuditService


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
        token = generate_plain_token()
        PasswordResetToken.objects.create(
            user=user,
            token_hash=hash_token(token),
            expires_at=timezone.now()
            + timedelta(minutes=settings.IAM_SETTINGS["PASSWORD_RESET_TOKEN_MINUTES"]),
            ip_address=ip_address,
        )
        send_mail(
            subject="Reset your IE Platform password",
            message=f"Use this token to reset your password: {token}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
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
