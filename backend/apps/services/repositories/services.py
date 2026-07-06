from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q, QuerySet

from apps.services.models import Service, ServiceCategory, ServiceTag


class ServiceRepository:
    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Service]:
        queryset = Service.objects.require_tenant(tenant).select_related("business", "category")
        if getattr(user, "is_superuser", False) or self._has_access(user):
            return queryset
        return queryset.filter(tenant__owner=user)

    def list_categories(self, *, tenant: Any, user: Any) -> QuerySet[ServiceCategory]:
        queryset = ServiceCategory.objects.require_tenant(tenant).select_related(
            "business", "parent"
        )
        if getattr(user, "is_superuser", False) or self._has_access(user):
            return queryset
        return queryset.filter(tenant__owner=user)

    def list_tags(self, *, tenant: Any, user: Any, business_id: str = "") -> QuerySet[ServiceTag]:
        queryset = ServiceTag.objects.require_tenant(tenant).select_related("business")
        if not getattr(user, "is_superuser", False) and not self._has_access(user):
            queryset = queryset.filter(tenant__owner=user)
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        return queryset

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        query: str = "",
        business_id: str = "",
        category_id: str = "",
        status_value: str = "",
        visibility: str = "",
        tags: list[str] | None = None,
    ) -> QuerySet[Service]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if visibility:
            queryset = queryset.filter(visibility=visibility)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(display_name__icontains=query)
                | Q(short_description__icontains=query)
                | Q(description__icontains=query)
                | Q(service_code__icontains=query)
                | Q(category__name__icontains=query)
            )
        return self._filter_tags(queryset, tags)

    def _filter_tags(
        self,
        queryset: QuerySet[Service],
        tags: list[str] | None,
    ) -> QuerySet[Service]:
        if not tags:
            return queryset
        if connection.features.supports_json_field_contains:
            for tag in tags:
                queryset = queryset.filter(tags__contains=[tag])
            return queryset
        matching_ids = [item.id for item in queryset if all(tag in item.tags for tag in tags)]
        return Service.objects.filter(id__in=matching_ids)

    def _has_access(self, user: Any) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in={
                "service:read",
                "service:write",
                "service:manage",
                "business:manage",
            },
            role__role_permissions__permission__is_active=True,
        ).exists()
