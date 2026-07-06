from __future__ import annotations

from rest_framework.request import Request


def client_ip(request: Request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def user_agent(request: Request) -> str:
    return request.META.get("HTTP_USER_AGENT", "")
