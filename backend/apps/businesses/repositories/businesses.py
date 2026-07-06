from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q, QuerySet

from apps.businesses.models import Business


class BusinessRepository:
    manager_permissions = {"business:write", "business:update", "business:manage", "business:read"}

    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Business]:
        queryset = Business.objects.require_tenant(tenant).select_related("organization")
        if getattr(user, "is_superuser", False):
            return queryset
        if self._has_business_permission(user):
            return queryset
        return queryset.filter(tenant__owner=user)

    def get_for_request(self, *, business_id: str, tenant: Any, user: Any) -> Business:
        return self.list_for_request(tenant=tenant, user=user).get(id=business_id)

    def default_for_request(self, *, tenant: Any, user: Any) -> Business | None:
        return self.list_for_request(tenant=tenant, user=user).order_by("created_at").first()

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        query: str = "",
        category: str = "",
        city: str = "",
        country: str = "",
        status: str = "",
        tags: list[str] | None = None,
    ) -> QuerySet[Business]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if query:
            queryset = queryset.filter(
                Q(business_name__icontains=query)
                | Q(display_name__icontains=query)
                | Q(description__icontains=query)
            )
        if category:
            queryset = queryset.filter(industry_category__iexact=category)
        if city:
            queryset = queryset.filter(city__iexact=city)
        if country:
            queryset = queryset.filter(country__iexact=country)
        if status:
            queryset = queryset.filter(status=status)
        if tags:
            if connection.features.supports_json_field_contains:
                for tag in tags:
                    queryset = queryset.filter(tags__contains=[tag])
            else:
                matching_ids = [
                    business.id
                    for business in queryset
                    if all(tag in business.tags for tag in tags)
                ]
                queryset = Business.objects.filter(id__in=matching_ids)
        return queryset

    def _has_business_permission(self, user: Any) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=self.manager_permissions,
            role__role_permissions__permission__is_active=True,
        ).exists()
