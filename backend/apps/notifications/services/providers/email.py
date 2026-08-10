from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from apps.notifications.services.providers.base import NotificationProvider


def _escape(value: Any) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_branded_email_html(
    *,
    subject: str,
    body: str,
    business_name: str = "",
    logo_url: str = "",
) -> str:
    safe_subject = _escape(subject)
    safe_body = _escape(body).replace("\n", "<br />")
    safe_business = _escape(business_name or "Your business")
    logo_block = (
        f'<img src="{_escape(logo_url)}" alt="{safe_business}" width="64" height="64" '
        'style="border-radius:16px;display:block;object-fit:cover;margin:0 auto 16px;" />'
        if logo_url
        else ""
    )
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:28px 28px 12px;text-align:center;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);">
                {logo_block}
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:600;">{safe_business}</div>
                <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#0f172a;">{safe_subject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">{safe_body}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
                Sent by {safe_business} via IE Platform
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


class EmailProvider(NotificationProvider):
    def send(self, *, template: Any, recipient: Any, context: dict[str, Any]) -> dict[str, Any]:
        subject = str(context.get("subject", template.subject))
        body = str(context.get("body", template.body))
        business_name = str(context.get("business_name") or "")
        logo_url = str(context.get("business_logo") or "")
        html = build_branded_email_html(
            subject=subject,
            body=body,
            business_name=business_name,
            logo_url=logo_url,
        )
        message = EmailMultiAlternatives(
            subject=subject,
            body=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=[str(recipient)],
        )
        message.attach_alternative(html, "text/html")
        message.send(fail_silently=False)
        return {"provider": "email", "status": "sent", "html": True}
