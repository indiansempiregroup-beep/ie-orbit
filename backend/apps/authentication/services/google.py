from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from rest_framework import exceptions, status
from rest_framework.exceptions import APIException


class GoogleSignInNotConfigured(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "google_signin_not_configured"
    default_detail = "Google sign-in is not configured on this server."


class GoogleAccountNotRegistered(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "google_account_not_registered"
    default_detail = (
        "This Google account is not linked to a business yet. "
        "Create your business first, then sign in with Google."
    )


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    email_verified: bool
    given_name: str
    family_name: str
    picture: str


def verify_google_id_token(id_token_value: str) -> GoogleIdentity:
    token = (id_token_value or "").strip()
    if not token:
        raise exceptions.AuthenticationFailed("Google sign-in token is missing.")

    audiences = list(getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", ()) or ())
    if not audiences:
        raise GoogleSignInNotConfigured()

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    request = google_requests.Request()
    payload: dict | None = None
    last_error: Exception | None = None
    for audience in audiences:
        try:
            payload = id_token.verify_oauth2_token(
                token,
                request,
                audience=audience,
                clock_skew_in_seconds=10,
            )
            break
        except ValueError as exc:
            last_error = exc

    if payload is None:
        raise exceptions.AuthenticationFailed(
            "Google sign-in could not be verified."
        ) from last_error

    issuer = str(payload.get("iss") or "")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise exceptions.AuthenticationFailed("Google sign-in issuer is invalid.")

    email = str(payload.get("email") or "").strip().lower()
    email_verified = bool(payload.get("email_verified"))
    subject = str(payload.get("sub") or "").strip()
    if not subject or not email or not email_verified:
        raise exceptions.AuthenticationFailed("Google did not provide a verified email.")

    return GoogleIdentity(
        subject=subject,
        email=email,
        email_verified=True,
        given_name=str(payload.get("given_name") or "").strip(),
        family_name=str(payload.get("family_name") or "").strip(),
        picture=str(payload.get("picture") or "").strip()[:500],
    )
