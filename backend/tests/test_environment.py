import importlib
from pathlib import Path

import pytest

from config.env import EnvironmentConfigurationError, load_environment


def test_load_environment_accepts_sqlite_database_url(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/ie-platform-test.sqlite3")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.development")

    environment = load_environment(tmp_path)

    assert environment.database_url == "sqlite:////tmp/ie-platform-test.sqlite3"


def test_load_environment_rejects_invalid_database_scheme(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATABASE_URL", "mysql://localhost/test")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.development")

    with pytest.raises(EnvironmentConfigurationError):
        load_environment(tmp_path)


def test_sqlite_database_settings_skip_postgres_timeout(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/ie-platform-test.sqlite3")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.development")

    import config.settings.base as base_settings

    importlib.reload(base_settings)

    assert base_settings.DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3"
    assert "connect_timeout" not in base_settings.DATABASES["default"].get("OPTIONS", {})


def test_production_rejects_sqlite_database_url(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/ie-platform-prod.sqlite3")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.production")

    with pytest.raises(EnvironmentConfigurationError, match="PostgreSQL"):
        load_environment(tmp_path)


def test_staging_rejects_sqlite_database_url(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/ie-platform-staging.sqlite3")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("DJANGO_SECRET_KEY", "test-secret")
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "config.settings.staging")

    with pytest.raises(EnvironmentConfigurationError, match="PostgreSQL"):
        load_environment(tmp_path)
