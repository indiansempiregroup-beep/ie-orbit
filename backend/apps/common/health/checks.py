from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from celery import current_app
from django.conf import settings
from django.db import connections
from django.db.utils import OperationalError
from django_redis import get_redis_connection
from redis.exceptions import RedisError

HealthStatus = Literal["ok", "degraded", "error"]


@dataclass(frozen=True)
class ComponentHealth:
    status: HealthStatus
    detail: str

    def as_dict(self) -> dict[str, str]:
        return {"status": self.status, "detail": self.detail}


def application_health() -> ComponentHealth:
    return ComponentHealth(status="ok", detail="Application process is running.")


def database_health() -> ComponentHealth:
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except OperationalError as exc:
        return ComponentHealth(status="error", detail=str(exc))
    return ComponentHealth(status="ok", detail="Database connection succeeded.")


def redis_health() -> ComponentHealth:
    try:
        connection = get_redis_connection("default")
        connection.ping()
    except (RedisError, NotImplementedError) as exc:
        return ComponentHealth(status="error", detail=str(exc))
    return ComponentHealth(status="ok", detail="Redis connection succeeded.")


def celery_health() -> ComponentHealth:
    broker_url = getattr(settings, "CELERY_BROKER_URL", "")
    if not broker_url:
        return ComponentHealth(status="error", detail="Celery broker is not configured.")

    try:
        with current_app.connection_for_read() as connection:
            connection.ensure_connection(max_retries=1)
    except Exception as exc:  # Celery can raise transport-specific exceptions.
        return ComponentHealth(status="error", detail=str(exc))

    return ComponentHealth(status="ok", detail="Celery broker connection succeeded.")


def platform_health() -> dict[str, dict[str, str]]:
    return {
        "application": application_health().as_dict(),
        "database": database_health().as_dict(),
        "redis": redis_health().as_dict(),
        "celery": celery_health().as_dict(),
        "environment": {
            "status": "ok",
            "detail": settings.ENV.name,
        },
    }
