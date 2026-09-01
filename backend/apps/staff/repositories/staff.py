from __future__ import annotations

from typing import Any

from django.db import connection
from django.db.models import Q, QuerySet

from apps.staff.models import Staff, StaffServiceAssignment, StaffSkill


from apps.common.utils.workspace_access import is_workspace_manager_or_above


class StaffRepository:
    def list_for_request(self, *, tenant: Any, user: Any) -> QuerySet[Staff]:
        queryset = Staff.objects.require_tenant(tenant).select_related("business", "user", "photo")
        if getattr(user, "is_superuser", False) or self._has_directory_access(user, tenant=tenant):
            return queryset
        # Staff without directory access may only see their own linked profile.
        return queryset.filter(user_id=getattr(user, "id", None))

    def list_skills(self, *, tenant: Any, user: Any) -> QuerySet[StaffSkill]:
        queryset = StaffSkill.objects.require_tenant(tenant).select_related("staff", "service")
        if getattr(user, "is_superuser", False) or self._has_directory_access(user, tenant=tenant):
            return queryset
        return queryset.filter(staff__user_id=getattr(user, "id", None))

    def list_assignments(self, *, tenant: Any, user: Any) -> QuerySet[StaffServiceAssignment]:
        queryset = StaffServiceAssignment.objects.require_tenant(tenant).select_related(
            "staff",
            "service",
        )
        if getattr(user, "is_superuser", False) or self._has_directory_access(user, tenant=tenant):
            return queryset
        return queryset.filter(staff__user_id=getattr(user, "id", None))

    def search(
        self,
        *,
        tenant: Any,
        user: Any,
        query: str = "",
        business_id: str = "",
        status_value: str = "",
        department: str = "",
        tags: list[str] | None = None,
    ) -> QuerySet[Staff]:
        queryset = self.list_for_request(tenant=tenant, user=user)
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        if status_value:
            queryset = queryset.filter(employment_status=status_value)
        if department:
            queryset = queryset.filter(department__iexact=department)
        if query:
            queryset = queryset.filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(display_name__icontains=query)
                | Q(email__icontains=query)
                | Q(phone_number__icontains=query)
                | Q(staff_code__icontains=query)
                | Q(designation__icontains=query)
            )
        return self._filter_tags(queryset, tags)

    def _filter_tags(self, queryset: QuerySet[Staff], tags: list[str] | None) -> QuerySet[Staff]:
        if not tags:
            return queryset
        if connection.features.supports_json_field_contains:
            for tag in tags:
                queryset = queryset.filter(tags__contains=[tag])
            return queryset
        matching_ids = [item.id for item in queryset if all(tag in item.tags for tag in tags)]
        return Staff.objects.filter(id__in=matching_ids)

    def _has_directory_access(self, user: Any, *, tenant: Any = None) -> bool:
        if not user or not getattr(user, "is_authenticated", False):
            return False
        if tenant is not None and getattr(tenant, "owner_id", None) == getattr(user, "id", None):
            return True
        if tenant is not None and is_workspace_manager_or_above(user=user, tenant=tenant):
            return True
        return user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in={
                "staff:read",
                "staff:write",
                "staff:manage",
                "business:manage",
            },
            role__role_permissions__permission__is_active=True,
        ).exists()

    def can_access_staff_record(self, *, tenant: Any, user: Any, staff_id: str | None) -> bool:
        if not staff_id:
            return False
        if getattr(user, "is_superuser", False) or self._has_directory_access(user, tenant=tenant):
            return True
        return (
            Staff.objects.require_tenant(tenant)
            .filter(id=staff_id, user_id=getattr(user, "id", None))
            .exists()
        )
