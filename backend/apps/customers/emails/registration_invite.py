from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.customers.models import Customer


@dataclass(frozen=True)
class CustomerRegistrationInviteContent:
    subject: str
    plain_text: str
    html: str


def build_customer_registration_invite(*, customer: Customer, business_name: str) -> CustomerRegistrationInviteContent:
    frontend_base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    register_url = f"{frontend_base}/auth/register?email={customer.email}"
    greeting = customer.display_name or customer.first_name or "there"
    product_name = business_name or "Orbit Appoint"
    subject = f"You're invited to book with {product_name}"

    plain_text = (
        f"Hi {greeting},\n\n"
        f"{product_name} added you as a customer. Create your account to book appointments, "
        "view your visit history, and manage notifications.\n\n"
        f"Create your account: {register_url}\n\n"
        "If you were not expecting this email, you can ignore it.\n\n"
        f"— {product_name}"
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
  <body style="font-family:Inter,Arial,sans-serif;color:#111827;line-height:1.6;">
    <p>Hi {greeting},</p>
    <p><strong>{product_name}</strong> added you as a customer. Create your account to book appointments and manage your visits.</p>
    <p><a href="{register_url}" style="display:inline-block;padding:12px 18px;background:#1a56db;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Create your account</a></p>
    <p style="color:#6b7280;font-size:13px;">Or copy this link: {register_url}</p>
  </body>
</html>"""

    return CustomerRegistrationInviteContent(subject=subject, plain_text=plain_text, html=html)
