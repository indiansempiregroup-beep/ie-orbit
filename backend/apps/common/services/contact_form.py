from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail

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
            send_mail(
                subject=subject,
                message="\n".join(body_lines),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                reply_to=[email],
                fail_silently=False,
            )
        except Exception:
            logger.exception("contact_form_send_failed recipient=%s sender=%s", recipient, email)
            raise
