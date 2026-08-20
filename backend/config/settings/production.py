import os

from config.settings.base import *  # noqa: F401,F403

DEBUG = False

# Trust the edge proxy (Caddy) so HTTPS redirects and secure cookies work.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# IP-only trials can set DJANGO_SECURE_SSL_REDIRECT=false until a domain + TLS exist.
_secure_ssl = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SECURE_SSL_REDIRECT = _secure_ssl
SESSION_COOKIE_SECURE = _secure_ssl
CSRF_COOKIE_SECURE = _secure_ssl
SECURE_HSTS_SECONDS = 31_536_000 if _secure_ssl else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = _secure_ssl
SECURE_HSTS_PRELOAD = _secure_ssl
