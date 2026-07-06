from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q, QuerySet

from apps.customers.models import Customer, CustomerTag


class CustomerRepository:
    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Customer]:
        queryset = Customer.objects.require_tenant(tenant).select_related("business")
        if getattr(user, "is_superuser", False):
            return queryset
        return queryset.filter(tenant__owner=user) if not self._has_access(user) else queryset

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        query: str = "",
        business_id: str = "",
        status_value: str = "",
        tags: list[str] | None = None,
    ) -> QuerySet[Customer]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if query:
            queryset = queryset.filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(display_name__icontains=query)
                | Q(email__icontains=query)
                | Q(phone_number__icontains=query)
                | Q(customer_code__icontains=query)
            )
        return self._filter_tags(queryset, tags)

    def list_tags(self, *, tenant: Any, user: Any, business_id: str = "") -> QuerySet[CustomerTag]:
        queryset = CustomerTag.objects.require_tenant(tenant).select_related("business")
        if not getattr(user, "is_superuser", False) and not self._has_access(user):
            queryset = queryset.filter(tenant__owner=user)
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        return queryset

    def _filter_tags(
        self,
        queryset: QuerySet[Customer],
        tags: list[str] | None,
    ) -> QuerySet[Customer]:
        if not tags:
            return queryset
        if connection.features.supports_json_field_contains:
            for tag in tags:
                queryset = queryset.filter(tags__contains=[tag])
            return queryset
        matching_ids = [item.id for item in queryset if all(tag in item.tags for tag in tags)]
        return Customer.objects.filter(id__in=matching_ids)

    def _has_access(self, user: Any) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in={
                "customer:read",
                "customer:write",
                "customer:manage",
                "business:manage",
            },
            role__role_permissions__permission__is_active=True,
        ).exists()
