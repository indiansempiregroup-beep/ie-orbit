from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

from dotenv import load_dotenv

TRUE_VALUES: Final[set[str]] = {"1", "true", "yes", "on"}


class EnvironmentConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Environment:
    django_settings_module: str
    secret_key: str
    debug: bool
    allowed_hosts: list[str]
    database_url: str
    redis_url: str
    default_from_email: str
    cors_allowed_origins: list[str]
    csrf_trusted_origins: list[str]
    log_level: str
    celery_task_always_eager: bool

    @property
    def name(self) -> str:
        return self.django_settings_module.rsplit(".", maxsplit=1)[-1]


def load_environment(base_dir: Path) -> Environment:
    load_dotenv(base_dir.parent / ".env")
    load_dotenv(base_dir / ".env")

    settings_module = os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.development")
    production_like = settings_module.endswith((".production", ".staging"))

    database_url = _required("DATABASE_URL", True)
    redis_url = _required("REDIS_URL", True)
    _validate_database_url("DATABASE_URL", database_url, production_like=production_like)
    _validate_url("REDIS_URL", redis_url, {"redis", "rediss"})

    return Environment(
        django_settings_module=settings_module,
        secret_key=_required("DJANGO_SECRET_KEY", production_like),
        debug=_bool("DJANGO_DEBUG", default=not production_like),
        allowed_hosts=_csv("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1"),
        database_url=database_url,
        redis_url=redis_url,
        default_from_email=os.getenv(
            "DEFAULT_FROM_EMAIL",
            "no-reply@indians-empire.example",
        ),
        cors_allowed_origins=_csv("CORS_ALLOWED_ORIGINS", default=""),
        csrf_trusted_origins=_csv("CSRF_TRUSTED_ORIGINS", default=""),
        log_level=os.getenv("DJANGO_LOG_LEVEL", "INFO").upper(),
        celery_task_always_eager=_bool("CELERY_TASK_ALWAYS_EAGER", default=False),
    )


def _required(name: str, strict: bool) -> str:
    value = os.getenv(name)
    if value:
        return value
    if not strict and name == "DJANGO_SECRET_KEY":
        return "unsafe-dev-only-secret-key"
    raise EnvironmentConfigurationError(f"Missing required environment variable: {name}")


def _bool(name: str, *, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in TRUE_VALUES


def _csv(name: str, *, default: str) -> list[str]:
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _validate_database_url(name: str, value: str, *, production_like: bool = False) -> None:
    parsed = urlparse(value)
    allowed_schemes = {"postgres", "postgresql", "sqlite"}
    if parsed.scheme not in allowed_schemes:
        schemes = ", ".join(sorted(allowed_schemes))
        raise EnvironmentConfigurationError(f"{name} must be a valid URL using: {schemes}")

    if parsed.scheme == "sqlite":
        if production_like:
            raise EnvironmentConfigurationError(
                f"{name} must use PostgreSQL in production and staging; SQLite is not allowed"
            )
        return

    if not parsed.netloc:
        raise EnvironmentConfigurationError(f"{name} must include a database host")


def _validate_url(name: str, value: str, allowed_schemes: set[str]) -> None:
    parsed = urlparse(value)
    if parsed.scheme not in allowed_schemes or not parsed.netloc:
        schemes = ", ".join(sorted(allowed_schemes))
        raise EnvironmentConfigurationError(f"{name} must be a valid URL using: {schemes}")
