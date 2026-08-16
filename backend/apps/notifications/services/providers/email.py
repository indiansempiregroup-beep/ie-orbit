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
    accent_color: str = "#1A56DB",
    extra_html: str = "",
    cta_label: str = "",
    cta_url: str = "",
) -> str:
    safe_subject = _escape(subject)
    safe_body = _escape(body).replace("\n", "<br />")
    safe_business = _escape(business_name or "Your shop")
    accent = _escape(accent_color or "#1A56DB")
    logo_block = (
        f'<img src="{_escape(logo_url)}" alt="{safe_business}" width="72" height="72" '
        'style="border-radius:18px;display:block;object-fit:cover;margin:0 auto 14px;'
        'border:3px solid #ffffff;box-shadow:0 8px 24px rgba(15,23,42,0.12);" />'
        if logo_url
        else ""
    )
    cta_block = ""
    if cta_label and cta_url:
        cta_block = (
            f'<p style="margin:22px 0 0;text-align:center;">'
            f'<a href="{_escape(cta_url)}" style="display:inline-block;background:{accent};color:#ffffff;'
            f'text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:12px;">'
            f"{_escape(cta_label)}</a></p>"
        )
    extra = extra_html or ""
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="height:6px;background:{accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;text-align:center;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 70%);">
                {logo_block}
                <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:700;">{safe_business}</div>
                <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3;color:#0f172a;">{safe_subject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 8px;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">{safe_body}</p>
                {extra}
                {cta_block}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
                You’re receiving this because you shop with {safe_business}.
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
        html = build_branded_email_html(
            subject=subject,
            body=body,
            business_name=str(context.get("business_name") or ""),
            logo_url=str(context.get("business_logo") or ""),
            accent_color=str(context.get("accent_color") or "#1A56DB"),
            extra_html=str(context.get("extra_html") or ""),
            cta_label=str(context.get("cta_label") or ""),
            cta_url=str(context.get("cta_url") or ""),
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
