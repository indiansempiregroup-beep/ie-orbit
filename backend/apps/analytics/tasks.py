from __future__ import annotations

from datetime import date, timedelta

from celery import shared_task
from django.utils import timezone

from apps.analytics.services.platform_analytics import PlatformAnalyticsService


@shared_task(name="analytics.snapshot_platform_usage")
def snapshot_platform_usage_task(days: int = 1) -> dict[str, object]:
    """Persist yesterday's (or last N days') usage facts for later sales reporting."""
    service = PlatformAnalyticsService()
    end = timezone.now().date() - timedelta(days=1)
    start = end - timedelta(days=max(int(days or 1), 1) - 1)
    return service.snapshot_range(start, end)


@shared_task(name="analytics.snapshot_platform_usage_day")
def snapshot_platform_usage_day_task(day: str | None = None) -> dict[str, object]:
    target = date.fromisoformat(day) if day else None
    return PlatformAnalyticsService().snapshot_day(target)
