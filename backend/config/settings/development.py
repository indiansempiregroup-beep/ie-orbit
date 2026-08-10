import os

from config.settings.base import *  # noqa: F401,F403

DEBUG = ENV.debug
ALLOWED_HOSTS = ["*"] if DEBUG else ENV.allowed_hosts
# Expo web (:8082) + LAN phone testing — reflect any Origin in DEBUG.
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
    # Mobile/Expo reloads fire many parallel list calls; keep local throttles loose.
    REST_FRAMEWORK = {
        **REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
            "anon": "2000/hour",
            "user": "20000/hour",
            "auth_login": "60/minute",
            "password_reset": "30/minute",
        },
    }
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
