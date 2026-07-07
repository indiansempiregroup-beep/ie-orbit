from __future__ import annotations

import os
import json
from datetime import timedelta
from pathlib import Path

import dj_database_url

from config.env import load_environment

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BASE_DIR.parent
ENV = load_environment(BASE_DIR)

SECRET_KEY = ENV.secret_key
DEBUG = ENV.debug
ALLOWED_HOSTS = ENV.allowed_hosts

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "corsheaders",
    "apps.common",
    "apps.core",
    "apps.authentication",
    "apps.tenancy",
    "apps.businesses",
    "apps.platform_media",
    "apps.customers",
    "apps.services",
    "apps.staff",
    "apps.bookings",
    "apps.notifications",
    "apps.calendar",
    "apps.analytics",
    "apps.billing",
    "apps.audit",
    "apps.api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "apps.common.middleware.request_logging.RequestLoggingMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.tenancy.middleware.TenantResolutionMiddleware",
    "apps.tenancy.middleware.BusinessResolutionMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.parse(
        ENV.database_url,
        conn_max_age=600,
        conn_health_checks=True,
    )
}
if DATABASES["default"].get("ENGINE") == "django.db.backends.postgresql":
    DATABASES["default"]["OPTIONS"] = {
        **DATABASES["default"].get("OPTIONS", {}),
        "connect_timeout": 10,
    }

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "ie-platform-local",
    }
}

if not DEBUG:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": ENV.redis_url,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "SOCKET_CONNECT_TIMEOUT": 5,
                "SOCKET_TIMEOUT": 5,
            },
            "KEY_PREFIX": "ie_platform",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
PLATFORM_MEDIA_STORAGE_PROVIDER = "local"
PLATFORM_MEDIA_LOCAL_ROOT = MEDIA_ROOT / "uploads"
PLATFORM_MEDIA_LOCAL_URL = f"/{MEDIA_URL.rstrip('/')}/uploads/"
MEDIA_MAX_UPLOAD_SIZE = 10 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DEFAULT_FROM_EMAIL = ENV.default_from_email
AUTH_USER_MODEL = "authentication.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.cursor.StandardCursorPagination",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "auth_login": "10/minute",
        "password_reset": "5/minute",
    },
    "PAGE_SIZE": 50,
    "EXCEPTION_HANDLER": "apps.common.api.exceptions.global_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "IE Platform API",
    "DESCRIPTION": "IE Platform API.",
    "VERSION": "0.4.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
}

CORS_ALLOWED_ORIGINS = ENV.cors_allowed_origins
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = ENV.csrf_trusted_origins

IAM_SETTINGS = {
    "FAILED_LOGIN_LIMIT": 5,
    "ACCOUNT_LOCKOUT_MINUTES": 15,
    "PASSWORD_RESET_TOKEN_MINUTES": 30,
    "EMAIL_VERIFICATION_TOKEN_MINUTES": 60 * 24,
    "OTP_EXPIRY_MINUTES": 10,
    "OTP_MAX_ATTEMPTS": 5,
}

REDIS_URL = ENV.redis_url
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60
CELERY_TASK_ALWAYS_EAGER = ENV.celery_task_always_eager
CELERY_BEAT_SCHEDULER = "celery.beat:PersistentScheduler"

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
BILLING_CURRENCY_DEFAULT = os.getenv("BILLING_CURRENCY_DEFAULT", "INR")
BILLING_WEBHOOK_ALERT_RECIPIENTS = os.getenv("BILLING_WEBHOOK_ALERT_RECIPIENTS", "")
BILLING_ENFORCE_LIVE_CHECKOUT = os.getenv("BILLING_ENFORCE_LIVE_CHECKOUT", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
BILLING_RECONCILIATION_LOOKBACK_HOURS = int(os.getenv("BILLING_RECONCILIATION_LOOKBACK_HOURS", "72"))
try:
    BILLING_PLAN_PRICE_OVERRIDES = json.loads(os.getenv("BILLING_PLAN_PRICE_OVERRIDES", "{}"))
except json.JSONDecodeError:
    BILLING_PLAN_PRICE_OVERRIDES = {}

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "apps.common.utils.logging.JsonLogFormatter",
        },
        "console": {
            "format": "%(levelname)s %(asctime)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
        "application_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOG_DIR / "application.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "json",
        },
        "error_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": LOG_DIR / "error.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "json",
            "level": "ERROR",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console", "application_file", "error_file"],
            "level": ENV.log_level,
            "propagate": False,
        },
        "ie_platform": {
            "handlers": ["console", "application_file", "error_file"],
            "level": ENV.log_level,
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console", "application_file", "error_file"],
        "level": ENV.log_level,
    },
}
