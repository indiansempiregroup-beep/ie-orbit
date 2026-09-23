from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="platform_admin.refresh_smart_lookup_fx")
def refresh_smart_lookup_fx_task() -> dict:
    """Daily USD→INR refresh for Orbit Mart Smart lookup wallet debit."""
    from apps.platform_admin.fx import refresh_platform_usd_inr

    try:
        return refresh_platform_usd_inr()
    except Exception as exc:
        logger.exception("smart_lookup_fx_refresh_failed")
        return {"ok": False, "error": str(exc)}
