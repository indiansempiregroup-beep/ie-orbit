from __future__ import annotations

from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business
from apps.common.utils.urls import normalize_stored_asset_url
from apps.platform_media.models import Media
from apps.shopie.models import ShopDashboardAd
from apps.tenancy.models import Tenant

MAX_ACTIVE_DASHBOARD_ADS = 5
_TRANSIENT_URL_PREFIXES = ("blob:", "data:", "file:", "content:", "ph:", "assets-library:")


def _stored_image_url(*, image_url: str | None, media_id: UUID | None) -> str:
    raw = (image_url or "").strip()
    if raw.startswith(_TRANSIENT_URL_PREFIXES):
        raw = ""
    if raw:
        return normalize_stored_asset_url(raw)
    if not media_id:
        return ""
    media = Media.objects.filter(id=media_id).only("metadata").first()
    if not media:
        return ""
    meta_url = str(media.metadata.get("public_url") or media.metadata.get("private_url") or "")
    return normalize_stored_asset_url(meta_url) if meta_url else ""


class DashboardAdService:
    def list_ads(
        self,
        *,
        tenant: Tenant,
        business: Business,
        active_only: bool = False,
    ) -> QuerySet[ShopDashboardAd]:
        qs = (
            ShopDashboardAd.objects.filter(tenant=tenant, business=business)
            .select_related("media")
            .order_by("sort_order", "-created_at")
        )
        if active_only:
            now = timezone.now()
            qs = qs.filter(is_active=True)
            qs = qs.exclude(starts_at__gt=now).exclude(ends_at__lt=now)
        return qs

    def get_ad(self, *, tenant: Tenant, ad_id: UUID) -> ShopDashboardAd:
        return ShopDashboardAd.objects.select_related("media").get(tenant=tenant, id=ad_id)

    def _count_active(self, *, tenant: Tenant, business: Business, exclude_id: UUID | None = None) -> int:
        now = timezone.now()
        qs = ShopDashboardAd.objects.filter(tenant=tenant, business=business, is_active=True)
        qs = qs.exclude(starts_at__gt=now).exclude(ends_at__lt=now)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.count()

    def _ensure_active_cap(
        self,
        *,
        tenant: Tenant,
        business: Business,
        will_be_active: bool,
        exclude_id: UUID | None = None,
    ) -> None:
        if not will_be_active:
            return
        if self._count_active(tenant=tenant, business=business, exclude_id=exclude_id) >= MAX_ACTIVE_DASHBOARD_ADS:
            raise ValidationError(
                {
                    "is_active": (
                        f"A business may have at most {MAX_ACTIVE_DASHBOARD_ADS} active dashboard ads."
                    )
                }
            )

    @transaction.atomic
    def create_ad(self, *, tenant: Tenant, business: Business, data: dict[str, Any]) -> ShopDashboardAd:
        is_active = bool(data.get("is_active", True))
        self._ensure_active_cap(tenant=tenant, business=business, will_be_active=is_active)
        media_id = data.get("media_id")
        return ShopDashboardAd.objects.create(
            tenant=tenant,
            business=business,
            title=data["title"],
            body=data.get("body") or "",
            media_id=media_id,
            image_url=_stored_image_url(image_url=data.get("image_url"), media_id=media_id),
            link_url=data.get("link_url") or "",
            sort_order=int(data.get("sort_order") or 0),
            is_active=is_active,
            starts_at=data.get("starts_at"),
            ends_at=data.get("ends_at"),
        )

    @transaction.atomic
    def update_ad(self, *, ad: ShopDashboardAd, data: dict[str, Any]) -> ShopDashboardAd:
        is_active = bool(data["is_active"]) if "is_active" in data else ad.is_active
        starts_at = data["starts_at"] if "starts_at" in data else ad.starts_at
        ends_at = data["ends_at"] if "ends_at" in data else ad.ends_at
        # Temporarily apply schedule fields to evaluate "active now" for cap.
        would_count = is_active
        now = timezone.now()
        if would_count and starts_at and starts_at > now:
            would_count = False
        if would_count and ends_at and ends_at < now:
            would_count = False
        self._ensure_active_cap(
            tenant=ad.tenant,
            business=ad.business,
            will_be_active=would_count,
            exclude_id=ad.id,
        )
        for field in (
            "title",
            "body",
            "link_url",
            "sort_order",
            "is_active",
            "starts_at",
            "ends_at",
        ):
            if field in data:
                setattr(ad, field, data[field])
        if "media_id" in data:
            ad.media_id = data["media_id"]
        if "image_url" in data or "media_id" in data:
            ad.image_url = _stored_image_url(
                image_url=data.get("image_url") if "image_url" in data else ad.image_url,
                media_id=ad.media_id,
            )
        ad.save()
        return ad

    def delete_ad(self, *, ad: ShopDashboardAd) -> None:
        ad.delete()
