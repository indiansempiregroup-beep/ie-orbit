from __future__ import annotations

import logging

from django.conf import settings

from apps.notifications.services.providers.email import email_info_card, send_branded_email

logger = logging.getLogger(__name__)


class ContactFormService:
    def submit(
        self,
        *,
        name: str,
        email: str,
        message: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> None:
        recipient = getattr(settings, "CONTACT_FORM_RECIPIENT_EMAIL", "support@indiansempire.com")
        subject = f"IE Orbit contact form: {name}"
        body_lines = [
            f"Name: {name}",
            f"Email: {email}",
            "",
            message,
        ]
        if ip_address or user_agent:
            body_lines.extend(["", "---", f"IP: {ip_address or 'unknown'}", f"User-Agent: {user_agent or 'unknown'}"])
        try:
            send_branded_email(
                subject=subject,
                body=f"{name} sent a message via the IE Orbit contact form.",
                recipient=recipient,
                business_name="IE Orbit",
                headline="New contact form message",
                extra_html=email_info_card(
                    title="Message",
                    lines=body_lines,
                ),
                reply_to=[email],
                fail_silently=False,
            )
        except Exception:
            logger.exception("contact_form_send_failed recipient=%s sender=%s", recipient, email)
            raise
