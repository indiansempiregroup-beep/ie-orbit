from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.customers.models import Customer
from apps.notifications.services.providers.email import build_branded_email_html, email_info_card


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

    body = (
        f"Hi {greeting},\n\n"
        f"{product_name} added you as a customer. Create your account to book appointments, "
        "view your visit history, and manage notifications."
    )
    html = build_branded_email_html(
        subject=subject,
        body=body,
        business_name=product_name,
        headline="You're invited",
        extra_html=email_info_card(
            title="What you can do",
            lines=[
                "Book appointments online",
                "Track orders and visits",
                "Manage notifications in one place",
            ],
        ),
        cta_label="Create your account",
        cta_url=register_url,
        footer_note="If you were not expecting this email, you can ignore it.",
    )

    return CustomerRegistrationInviteContent(subject=subject, plain_text=plain_text, html=html)
