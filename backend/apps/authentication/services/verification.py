from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import exceptions

from apps.authentication.models import EmailVerificationToken, User
from apps.authentication.security.tokens import generate_plain_token, hash_token
from apps.authentication.services.audit import SecurityAuditService


@dataclass(frozen=True)
class VerificationRequest:
    token: str
    user: User


class EmailVerificationService:
    def __init__(self, audit_service: SecurityAuditService | None = None) -> None:
        self.audit_service = audit_service or SecurityAuditService()

    def send_verification(self, *, user: User) -> VerificationRequest:
        token = generate_plain_token()
        EmailVerificationToken.objects.create(
            user=user,
            token_hash=hash_token(token),
            expires_at=timezone.now()
            + timedelta(minutes=settings.IAM_SETTINGS["EMAIL_VERIFICATION_TOKEN_MINUTES"]),
        )
        send_mail(
            subject="Verify your IE Platform email",
            message=f"Use this token to verify your email: {token}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return VerificationRequest(token=token, user=user)

    def verify(self, *, token: str) -> User:
        verification_token = EmailVerificationToken.objects.filter(
            token_hash=hash_token(token)
        ).first()
        if not verification_token:
            raise exceptions.ValidationError({"token": "Email verification token is invalid."})
        if not verification_token.is_usable:
            raise exceptions.ValidationError(
                {"token": "Email verification token is invalid or expired."}
            )
        user = verification_token.user
        user.mark_email_verified()
        verification_token.used_at = timezone.now()
        verification_token.save(update_fields=["used_at", "updated_at"])
        self.audit_service.record(event_type="email_verified", user=user)
        return user
