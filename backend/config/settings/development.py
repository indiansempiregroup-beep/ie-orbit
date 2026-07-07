import os

from config.settings.base import *  # noqa: F401,F403

DEBUG = ENV.debug
ALLOWED_HOSTS = ["*"] if DEBUG else ENV.allowed_hosts
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "false").lower() in {"1", "true", "yes", "on"}
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "false").lower() in {"1", "true", "yes", "on"}
