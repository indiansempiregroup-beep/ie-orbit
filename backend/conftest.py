from __future__ import annotations

import pytest
from rest_framework.settings import api_settings


@pytest.fixture(autouse=True)
def _isolate_pytest_from_dev_redis(settings):
    """Keep pytest from sharing Docker Redis throttle counters with the running app."""
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "ie-orbit-pytest",
        }
    }
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_CLASSES": (),
        "DEFAULT_THROTTLE_RATES": {},
    }
    api_settings.reload()
