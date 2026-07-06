from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.platform_media.models import Media


class MediaRepository:
    manager_permissions = {"media:read", "media:write", "media:manage"}

    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Media]:
        queryset = Media.objects.require_tenant(tenant).select_related("business", "folder")
        if getattr(user, "is_superuser", False):
            return queryset
        if self._has_media_permission(user):
            return queryset
        return queryset.filter(tenant__owner=user)

    def get_for_request(self, *, media_id: str, tenant: Any, user: Any) -> Media:
        return self.list_for_request(tenant=tenant, user=user).get(id=media_id)

    def find_duplicate(self, *, tenant: Any, checksum: str, provider: str) -> Media | None:
        return (
            Media.objects.for_tenant(tenant)
            .filter(
                checksum=checksum,
                storage_provider=provider,
            )
            .first()
        )

    def _has_media_permission(self, user: Any) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=self.manager_permissions,
            role__role_permissions__permission__is_active=True,
        ).exists()
