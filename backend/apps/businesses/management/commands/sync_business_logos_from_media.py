from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.businesses.models import Business
from apps.common.utils.urls import normalize_stored_asset_url
from apps.platform_media.models import Media


class Command(BaseCommand):
    help = "Backfill business.logo from uploaded branding media tagged as logo."

    def handle(self, *args, **options) -> None:
        updated = 0
        for business in Business.objects.all():
            if business.logo:
                continue
            media = (
                Media.objects.filter(business=business, tags__contains=["logo"])
                .order_by("-created_at")
                .first()
            )
            if media is None:
                continue
            logo_url = normalize_stored_asset_url(str(media.metadata.get("public_url", "")))
            if not logo_url:
                continue
            business.logo = logo_url
            business.save(update_fields=["logo", "updated_at"])
            updated += 1
            self.stdout.write(self.style.SUCCESS(f"Updated logo for {business.display_name}"))
        self.stdout.write(self.style.SUCCESS(f"Synced {updated} business logo(s)."))
