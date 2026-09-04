from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.authentication.models import User
from apps.notifications.services.providers.email import (
    build_branded_email_html,
    email_code_box,
)


@dataclass(frozen=True)
class VerificationEmailContent:
    subject: str
    plain_text: str
    html: str
    verify_url: str


def _format_expiry_label() -> str:
    minutes = settings.IAM_SETTINGS["EMAIL_VERIFICATION_TOKEN_MINUTES"]
    if minutes % 60 == 0 and minutes >= 60:
        hours = minutes // 60
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{minutes} minutes"


def build_verification_email(*, user: User, token: str) -> VerificationEmailContent:
    frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    verify_url = f"{frontend_base}/auth/verify-email?token={token}"
    product_name = "IE Orbit"
    greeting_name = user.first_name.strip() or user.email.split("@")[0]
    expiry_label = _format_expiry_label()

    subject = f"Your {product_name} verification code"
    body = (
        f"Hi {greeting_name},\n\n"
        f"Enter this verification code in the app to confirm your email address "
        f"and finish setting up your {product_name} account."
    )
    plain_text = (
        f"Hi {greeting_name},\n\n"
        f"Thanks for creating your {product_name} account. "
        "Use the verification code below to confirm your email address.\n\n"
        f"Verification code: {token}\n\n"
        f"You can also verify online: {verify_url}\n\n"
        f"This code expires in {expiry_label}.\n\n"
        "If you did not create this account, you can safely ignore this email.\n\n"
        f"— The {product_name} Team"
    )
    html = build_branded_email_html(
        subject=subject,
        body=body,
        business_name=product_name,
        headline="Verify your email",
        extra_html=email_code_box(label="Verification code", code=token),
        cta_label="Verify email online",
        cta_url=verify_url,
        footer_note=f"This code expires in {expiry_label}. If you did not create this account, you can ignore this email.",
    )

    return VerificationEmailContent(
        subject=subject,
        plain_text=plain_text,
        html=html,
        verify_url=verify_url,
    )
