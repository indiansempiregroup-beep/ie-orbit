from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.authentication.models import User


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

    html = f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f8fa;font-family:Inter,Arial,sans-serif;color:#0f1623;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(15,22,35,0.08);">
            <tr>
              <td style="padding:28px 28px 12px;background:linear-gradient(135deg,#1a56db,#0f3d99);color:#ffffff;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;opacity:0.9;">IE Orbit</div>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;font-weight:800;">Verify your email</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hi {greeting_name},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4b5563;">
                  Enter this verification code in the app to confirm your email address and finish setting up your account.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="padding:20px;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1;">
                      <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">
                        Verification code
                      </div>
                      <div style="font-size:32px;font-weight:800;letter-spacing:0.35em;color:#111827;">{token}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-radius:10px;background:#1a56db;">
                      <a href="{verify_url}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        Verify email online
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#6b7280;">
                  Or copy this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;color:#1a56db;">
                  <a href="{verify_url}" style="color:#1a56db;text-decoration:underline;">{verify_url}</a>
                </p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  This code expires in {expiry_label}.
                  If you did not create this account, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">© IE Orbit · Orbit Appoint and Orbit Mart for your business</p>
        </td>
      </tr>
    </table>
  </body>
</html>"""

    return VerificationEmailContent(
        subject=subject,
        plain_text=plain_text,
        html=html,
        verify_url=verify_url,
    )
