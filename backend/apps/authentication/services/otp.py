from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.authentication.models import OtpChallenge
from apps.authentication.security.tokens import generate_otp_code, hash_token


@dataclass(frozen=True)
class OtpDelivery:
    challenge: OtpChallenge
    code: str


class OtpProvider:
    def send(self, *, identifier: str, code: str, purpose: str) -> None:
        return None


class OtpService:
    def __init__(self, provider: OtpProvider | None = None) -> None:
        self.provider = provider or OtpProvider()

    def create_challenge(self, *, identifier: str, purpose: str) -> OtpDelivery:
        code = generate_otp_code()
        challenge = OtpChallenge.objects.create(
            identifier=identifier.lower(),
            purpose=purpose,
            code_hash=hash_token(code),
            expires_at=timezone.now()
            + timedelta(minutes=settings.IAM_SETTINGS["OTP_EXPIRY_MINUTES"]),
            max_attempts=settings.IAM_SETTINGS["OTP_MAX_ATTEMPTS"],
        )
        self.provider.send(identifier=identifier, code=code, purpose=purpose)
        return OtpDelivery(challenge=challenge, code=code)

    def validate(self, *, identifier: str, purpose: str, code: str) -> bool:
        challenge = (
            OtpChallenge.objects.filter(identifier=identifier.lower(), purpose=purpose)
            .order_by("-created_at")
            .first()
        )
        if not challenge or not challenge.is_usable:
            return False
        challenge.attempts += 1
        if challenge.code_hash != hash_token(code):
            challenge.save(update_fields=["attempts", "updated_at"])
            return False
        challenge.verified_at = timezone.now()
        challenge.save(update_fields=["attempts", "verified_at", "updated_at"])
        return True
