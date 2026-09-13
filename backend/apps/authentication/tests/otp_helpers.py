from __future__ import annotations

import re

from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User


def otp_code_from_mail() -> str:
    assert mail.outbox, "Expected a sign-in email"
    body = mail.outbox[-1].body
    match = re.search(r"sign-in code is (\d{6})", body, re.IGNORECASE)
    if match is None:
        match = re.search(r"\b(\d{6})\b", body)
    assert match is not None, body
    return match.group(1)


def otp_login_customer(
    api_client: APIClient,
    user: User,
    *,
    tenant_slug: str,
    business_code: str,
) -> dict:
    mail.outbox.clear()
    send_response = api_client.post(
        reverse("auth-otp-send"),
        {
            "client": "customer",
            "channel": "email",
            "identifier": user.email,
            "tenant_slug": tenant_slug,
            "business_code": business_code,
        },
        format="json",
    )
    assert send_response.status_code == 200
    code = send_response.json()["data"].get("debug_code") or otp_code_from_mail()
    verify_response = api_client.post(
        reverse("auth-otp-verify"),
        {
            "client": "customer",
            "channel": "email",
            "identifier": user.email,
            "code": code,
            "remember_me": True,
            "tenant_slug": tenant_slug,
            "business_code": business_code,
        },
        format="json",
    )
    assert verify_response.status_code == 200
    return verify_response.json()["data"]


def ensure_ops_otp_login_eligible(user: User) -> None:
    from apps.authentication.services.authentication import AuthenticationService

    if user.is_superuser:
        return
    if AuthenticationService()._user_has_ops_workspace(user):
        return
    user.is_superuser = True
    user.save(update_fields=["is_superuser", "updated_at"])


def authenticate_api_client(api_client: APIClient, user: User) -> str:
    ensure_ops_otp_login_eligible(user)
    payload = otp_login_ops(api_client, user)
    access = payload["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


def otp_login_ops(api_client: APIClient, user: User) -> dict:
    mail.outbox.clear()
    send_response = api_client.post(
        reverse("auth-otp-send"),
        {"client": "ops", "channel": "email", "identifier": user.email},
        format="json",
    )
    assert send_response.status_code == 200
    code = send_response.json()["data"].get("debug_code") or otp_code_from_mail()
    verify_response = api_client.post(
        reverse("auth-otp-verify"),
        {
            "client": "ops",
            "channel": "email",
            "identifier": user.email,
            "code": code,
            "remember_me": True,
        },
        format="json",
    )
    assert verify_response.status_code == 200
    return verify_response.json()["data"]
