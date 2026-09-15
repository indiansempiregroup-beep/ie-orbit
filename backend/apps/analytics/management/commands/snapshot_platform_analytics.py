from __future__ import annotations

from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandParser
from django.utils import timezone

from apps.analytics.services.platform_analytics import PlatformAnalyticsService


class Command(BaseCommand):
    help = "Snapshot platform usage analytics for a date range."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--days", type=int, default=1, help="Number of days ending yesterday (default 1)."
        )
        parser.add_argument("--from", dest="start", help="Inclusive start date YYYY-MM-DD.")
        parser.add_argument(
            "--to", dest="end", help="Inclusive end date YYYY-MM-DD (default yesterday)."
        )

    def handle(self, *args, **options) -> None:
        yesterday = timezone.now().date() - timedelta(days=1)
        start = date.fromisoformat(options["start"]) if options.get("start") else None
        end = date.fromisoformat(options["end"]) if options.get("end") else None
        if start is None and end is None:
            end = yesterday
            start = end - timedelta(days=max(int(options["days"] or 1), 1) - 1)
        elif start is None:
            start = end
        elif end is None:
            end = yesterday
        if start > end:
            start, end = end, start
        result = PlatformAnalyticsService().snapshot_range(start, end)
        self.stdout.write(
            self.style.SUCCESS(
                f"Snapshotted {result['days']} day(s) · "
                f"usage {result['usage_rows']} · catalog {result['catalog_rows']}"
            )
        )
