from __future__ import annotations

from dataclasses import dataclass

from apps.notifications.services.providers.email import (
    build_branded_email_html,
    email_code_box,
    email_info_card,
)


@dataclass(frozen=True)
class OtpEmailContent:
    subject: str
    plain_text: str
    html: str


def build_login_otp_email(*, email: str, code: str, expiry_minutes: int) -> OtpEmailContent:
    product_name = "IE Orbit"
    greeting_name = (email.split("@")[0] or "there").strip() or "there"
    subject = f"{code} is your {product_name} sign-in code"
    body = (
        f"Hi {greeting_name},\n\n"
        f"Use this one-time code to sign in to {product_name}. "
        "Enter it on the sign-in screen — we will never ask you for this code by phone or chat."
    )
    plain_text = (
        f"Hi {greeting_name},\n\n"
        f"Your sign-in code is {code}.\n\n"
        f"It expires in {expiry_minutes} minutes. If you did not request this, you can ignore this email.\n\n"
        f"— The {product_name} Team"
    )
    html = build_branded_email_html(
        subject=subject,
        body=body,
        business_name=product_name,
        headline="Your sign-in code",
        preheader=f"Your {product_name} sign-in code is {code}. It expires in {expiry_minutes} minutes.",
        extra_html=(
            email_code_box(label="Sign-in code", code=code)
            + email_info_card(
                title="Keep this code private",
                lines=[
                    f"Expires in {expiry_minutes} minutes",
                    "Do not share this code with anyone",
                ],
            )
        ),
        footer_note=(
            f"This code expires in {expiry_minutes} minutes. "
            "If you did not request it, you can ignore this email."
        ),
    )
    return OtpEmailContent(subject=subject, plain_text=plain_text, html=html)
