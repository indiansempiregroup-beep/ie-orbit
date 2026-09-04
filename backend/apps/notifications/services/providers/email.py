from __future__ import annotations

from typing import Any, Sequence

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from apps.notifications.services.providers.base import NotificationProvider

# Amazon-inspired transactional palette (brand accent still passed per-business).
_BG = "#eaeded"
_CARD = "#ffffff"
_TEXT = "#0f1111"
_MUTED = "#565959"
_BORDER = "#d5d9d9"
_SOFT = "#f0f2f2"
_LINK = "#007185"


def escape_email(value: Any) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# Back-compat alias used by older call sites.
_escape = escape_email


def _headline_from_subject(subject: str) -> str:
    """Prefer the status phrase before '·' (Amazon-style inbox vs body headline)."""
    text = str(subject or "").strip()
    if "·" in text:
        return text.split("·", 1)[0].strip() or text
    if " - " in text:
        return text.split(" - ", 1)[0].strip() or text
    return text


def email_info_card(*, title: str = "", lines: Sequence[str] | None = None, html: str = "") -> str:
    """Soft callout used for ETA, address, appointment summary, refund box."""
    title_html = (
        f'<div style="font-size:13px;font-weight:700;color:{_TEXT};margin:0 0 6px;">{escape_email(title)}</div>'
        if title
        else ""
    )
    if html:
        body = html
    else:
        parts = [
            f'<div style="font-size:14px;line-height:1.55;color:{_MUTED};margin:0 0 4px;">{escape_email(line)}</div>'
            for line in (lines or [])
            if str(line or "").strip()
        ]
        body = "".join(parts)
    return (
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        f'style="margin:16px 0 0;border:1px solid {_BORDER};border-radius:8px;background:{_SOFT};">'
        f'<tr><td style="padding:14px 16px;">{title_html}{body}</td></tr></table>'
    )


def email_section_title(label: str) -> str:
    return (
        f'<div style="margin:22px 0 10px;padding-top:16px;border-top:1px solid {_BORDER};'
        f'font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:{_MUTED};">'
        f"{escape_email(label)}</div>"
    )


def email_item_rows(rows: Sequence[dict[str, Any]]) -> str:
    """
    rows: {name, qty?, amount?, detail?}
    """
    if not rows:
        return ""
    parts: list[str] = [email_section_title("Items")]
    parts.append(
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">'
    )
    for row in rows:
        name = escape_email(row.get("name"))
        qty = row.get("qty")
        amount = row.get("amount")
        detail = escape_email(row.get("detail") or "")
        qty_html = (
            f'<div style="font-size:13px;color:{_MUTED};margin-top:2px;">Qty {escape_email(qty)}</div>'
            if qty is not None and str(qty) != ""
            else ""
        )
        detail_html = (
            f'<div style="font-size:13px;color:{_MUTED};margin-top:2px;">{detail}</div>' if detail else ""
        )
        amount_html = (
            f'<td style="padding:10px 0;vertical-align:top;text-align:right;font-size:14px;'
            f'font-weight:700;color:{_TEXT};white-space:nowrap;padding-left:12px;">'
            f"{escape_email(amount)}</td>"
            if amount is not None and str(amount) != ""
            else ""
        )
        parts.append(
            "<tr>"
            f'<td style="padding:10px 0;border-bottom:1px solid {_BORDER};vertical-align:top;">'
            f'<div style="font-size:14px;color:{_TEXT};font-weight:600;">{name}</div>'
            f"{qty_html}{detail_html}</td>"
            f"{amount_html}"
            "</tr>"
        )
    parts.append("</table>")
    return "".join(parts)


def email_totals_block(rows: Sequence[tuple[str, str]], *, emphasize_last: bool = True) -> str:
    if not rows:
        return ""
    lines: list[str] = [
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">'
    ]
    last = len(rows) - 1
    for idx, (label, value) in enumerate(rows):
        is_last = emphasize_last and idx == last
        label_style = (
            f"font-size:15px;font-weight:700;color:{_TEXT};padding-top:10px;border-top:1px solid {_BORDER};"
            if is_last
            else f"font-size:13px;color:{_MUTED};padding-top:4px;"
        )
        value_style = (
            f"font-size:15px;font-weight:700;color:{_TEXT};text-align:right;padding-top:10px;"
            f"border-top:1px solid {_BORDER};"
            if is_last
            else f"font-size:13px;color:{_TEXT};text-align:right;padding-top:4px;"
        )
        lines.append(
            "<tr>"
            f'<td style="{label_style}">{escape_email(label)}</td>'
            f'<td style="{value_style}">{escape_email(value)}</td>'
            "</tr>"
        )
    lines.append("</table>")
    return "".join(lines)


def email_progress_steps(steps: Sequence[str], *, current_index: int = 0) -> str:
    """Simple vertical progress list for delivery emails."""
    if not steps:
        return ""
    rows: list[str] = []
    for idx, label in enumerate(steps):
        done = idx < current_index
        current = idx == current_index
        marker = "●" if done or current else "○"
        color = _TEXT if done or current else _MUTED
        weight = "700" if current else "500"
        rows.append(
            f'<div style="font-size:14px;line-height:1.7;color:{color};font-weight:{weight};">'
            f"{marker}&nbsp;&nbsp;{escape_email(label)}</div>"
        )
    return email_info_card(html="".join(rows))


def email_code_box(*, label: str, code: str) -> str:
    return (
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;">'
        f'<tr><td align="center" style="padding:18px 16px;background:{_SOFT};border:1px dashed {_BORDER};'
        f'border-radius:8px;">'
        f'<div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;'
        f'color:{_MUTED};margin-bottom:8px;">{escape_email(label)}</div>'
        f'<div style="font-size:30px;font-weight:800;letter-spacing:0.28em;color:{_TEXT};">'
        f"{escape_email(code)}</div>"
        f"</td></tr></table>"
    )


def email_help_links(links: Sequence[tuple[str, str]]) -> str:
    usable = [(label, url) for label, url in links if label and url]
    if not usable:
        return ""
    joined = " &nbsp;·&nbsp; ".join(
        f'<a href="{escape_email(url)}" style="color:{_LINK};text-decoration:none;">{escape_email(label)}</a>'
        for label, url in usable
    )
    return (
        f'{email_section_title("Help")}'
        f'<div style="font-size:13px;line-height:1.6;color:{_MUTED};">{joined}</div>'
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
    headline: str = "",
    preheader: str = "",
    help_html: str = "",
    footer_note: str = "",
) -> str:
    """
    Amazon-inspired transactional layout:
    logo header → clear status headline → body → optional card/extra → one CTA → help → footer.
    """
    safe_subject = escape_email(subject)
    safe_headline = escape_email(headline or _headline_from_subject(subject))
    safe_body = escape_email(body).replace("\n", "<br />")
    safe_business = escape_email(business_name or "IE Orbit")
    accent = escape_email(accent_color or "#1A56DB")
    safe_preheader = escape_email(preheader or body.split("\n")[0] if body else subject)

    if logo_url:
        brand_mark = (
            f'<img src="{escape_email(logo_url)}" alt="{safe_business}" width="40" height="40" '
            f'style="display:block;border:0;border-radius:8px;object-fit:cover;" />'
        )
    else:
        brand_mark = (
            f'<div style="font-size:16px;font-weight:800;color:{_TEXT};letter-spacing:-0.02em;">'
            f"{safe_business}</div>"
        )

    cta_block = ""
    if cta_label and cta_url:
        cta_block = (
            f'<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 8px;">'
            f"<tr><td style=\"border-radius:8px;background:{accent};\">"
            f'<a href="{escape_email(cta_url)}" style="display:inline-block;padding:12px 22px;'
            f'color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">'
            f"{escape_email(cta_label)}</a>"
            f"</td></tr></table>"
        )

    footer_source = footer_note or f"You’re receiving this because you have an account with {business_name or 'IE Orbit'}."
    footer_html = footer_source if "<" in str(footer_note or "") else escape_email(footer_source)
    help_block = help_html or ""

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{safe_subject}</title>
  </head>
  <body style="margin:0;padding:0;background:{_BG};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:{_TEXT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{safe_preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:{_CARD};border:1px solid {_BORDER};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="height:4px;background:{accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:18px 24px 14px;border-bottom:1px solid {_BORDER};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">{brand_mark}</td>
                    <td align="right" style="vertical-align:middle;font-size:12px;color:{_MUTED};">{safe_business}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px 8px;">
                <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:{_TEXT};">{safe_headline}</h1>
                <p style="margin:0;font-size:14px;line-height:1.65;color:{_MUTED};">{safe_body}</p>
                {extra_html or ""}
                {cta_block}
                {help_block}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 22px;border-top:1px solid {_BORDER};font-size:12px;line-height:1.55;color:{_MUTED};">
                {footer_html}
              </td>
            </tr>
          </table>
          <div style="max-width:600px;margin:12px auto 0;font-size:11px;line-height:1.5;color:{_MUTED};text-align:center;">
            © {safe_business}
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def send_branded_email(
    *,
    subject: str,
    body: str,
    recipient: str | Sequence[str],
    business_name: str = "IE Orbit",
    logo_url: str = "",
    accent_color: str = "#1A56DB",
    extra_html: str = "",
    cta_label: str = "",
    cta_url: str = "",
    headline: str = "",
    help_html: str = "",
    footer_note: str = "",
    reply_to: Sequence[str] | None = None,
    fail_silently: bool = False,
) -> None:
    """Send a multipart email using the shared Amazon-style shell."""
    to = [recipient] if isinstance(recipient, str) else list(recipient)
    html = build_branded_email_html(
        subject=subject,
        body=body,
        business_name=business_name,
        logo_url=logo_url,
        accent_color=accent_color,
        extra_html=extra_html,
        cta_label=cta_label,
        cta_url=cta_url,
        headline=headline,
        help_html=help_html,
        footer_note=footer_note,
    )
    message = EmailMultiAlternatives(
        subject=subject,
        body=body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        to=to,
        reply_to=list(reply_to) if reply_to else None,
    )
    message.attach_alternative(html, "text/html")
    message.send(fail_silently=fail_silently)


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
            headline=str(context.get("headline") or ""),
            help_html=str(context.get("help_html") or ""),
            footer_note=str(context.get("footer_note") or ""),
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
