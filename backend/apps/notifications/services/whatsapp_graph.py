from __future__ import annotations

from typing import Any

import requests
from django.conf import settings

GRAPH_TIMEOUT = 20


class WhatsAppGraphError(Exception):
    def __init__(self, message: str, *, status_code: int = 0, payload: dict[str, Any] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def graph_version() -> str:
    return str(getattr(settings, "WHATSAPP_GRAPH_API_VERSION", "v21.0") or "v21.0")


def graph_base() -> str:
    return f"https://graph.facebook.com/{graph_version()}"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _raise_for_response(response: requests.Response) -> dict[str, Any]:
    try:
        payload = response.json() if response.content else {}
    except ValueError:
        payload = {"raw": response.text[:500]}
    if response.status_code >= 400:
        error = payload.get("error") if isinstance(payload, dict) else None
        message = ""
        if isinstance(error, dict):
            message = str(error.get("message") or error.get("error_user_msg") or "")
        raise WhatsAppGraphError(
            message or f"WhatsApp API error ({response.status_code})",
            status_code=response.status_code,
            payload=payload if isinstance(payload, dict) else {},
        )
    return payload if isinstance(payload, dict) else {}


def get_phone_number(*, phone_number_id: str, token: str) -> dict[str, Any]:
    response = requests.get(
        f"{graph_base()}/{phone_number_id}",
        headers=_headers(token),
        params={"fields": "display_phone_number,verified_name,quality_rating"},
        timeout=GRAPH_TIMEOUT,
    )
    return _raise_for_response(response)


def list_message_templates(*, waba_id: str, token: str) -> list[dict[str, Any]]:
    templates: list[dict[str, Any]] = []
    url = f"{graph_base()}/{waba_id}/message_templates"
    params: dict[str, Any] = {"limit": 100}
    while url:
        response = requests.get(url, headers=_headers(token), params=params, timeout=GRAPH_TIMEOUT)
        payload = _raise_for_response(response)
        templates.extend(list(payload.get("data") or []))
        paging = payload.get("paging") if isinstance(payload.get("paging"), dict) else {}
        url = str(paging.get("next") or "")
        params = {}
    return templates


def create_message_template(
    *,
    waba_id: str,
    token: str,
    name: str,
    language: str,
    body: str,
    sample_values: list[str],
) -> dict[str, Any]:
    payload = {
        "name": name,
        "language": language,
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": body,
                "example": {"body_text": [sample_values]},
            }
        ],
    }
    response = requests.post(
        f"{graph_base()}/{waba_id}/message_templates",
        headers=_headers(token),
        json=payload,
        timeout=GRAPH_TIMEOUT,
    )
    return _raise_for_response(response)


def send_template_message(
    *,
    phone_number_id: str,
    token: str,
    to: str,
    template_name: str,
    language: str,
    body_values: list[str],
) -> dict[str, Any]:
    components = []
    if body_values:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": value} for value in body_values],
            }
        )
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": components,
        },
    }
    response = requests.post(
        f"{graph_base()}/{phone_number_id}/messages",
        headers=_headers(token),
        json=payload,
        timeout=GRAPH_TIMEOUT,
    )
    return _raise_for_response(response)
