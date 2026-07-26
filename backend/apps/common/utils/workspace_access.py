from __future__ import annotations

from typing import Any
from uuid import UUID

from django.db.models import QuerySet

WORKSPACE_MANAGER_ROLE_CODES = frozenset(
    {"business_owner", "manager", "platform_admin", "super_admin"}
)


def is_workspace_manager_or_above(*, user: Any, tenant: Any | None = None) -> bool:
    """Owners, managers, and platform admins can see business-wide ops data."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    if tenant is not None and getattr(tenant, "owner_id", None) == getattr(user, "id", None):
        return True
    return user.user_roles.filter(
        role__is_active=True,
        role__code__in=WORKSPACE_MANAGER_ROLE_CODES,
    ).exists()


def linked_staff_ids_for_user(
    *,
    tenant: Any,
    user: Any,
    business: Any | None = None,
) -> list[UUID]:
    """Staff profile IDs linked to the user within the tenant (optionally one business)."""
    if not user or not getattr(user, "is_authenticated", False):
        return []
    from apps.staff.models import EmploymentStatus, Staff

    queryset = Staff.objects.require_tenant(tenant).filter(
        user_id=user.id,
        employment_status=EmploymentStatus.ACTIVE,
    )
    if business is not None:
        queryset = queryset.filter(business=business)
    return list(queryset.values_list("id", flat=True))


def scope_bookings_queryset_for_user(
    queryset: QuerySet,
    *,
    tenant: Any,
    user: Any,
) -> QuerySet:
    """Managers/owners see all bookings; staff see only bookings assigned to them."""
    if is_workspace_manager_or_above(user=user, tenant=tenant):
        return queryset
    staff_ids = linked_staff_ids_for_user(tenant=tenant, user=user)
    if not staff_ids:
        return queryset.none()
    return queryset.filter(staff_id__in=staff_ids)


def resolve_business_manager_users(*, tenant: Any, business: Any) -> list[Any]:
    """Active users who should receive all business booking admin notifications."""
    from apps.authentication.models import User
    from apps.staff.models import EmploymentStatus, Staff

    users: dict[str, Any] = {}
    owner = getattr(tenant, "owner", None)
    if owner is not None and getattr(owner, "is_active", True):
        users[str(owner.id)] = owner

    manager_ids = (
        Staff.objects.require_tenant(tenant)
        .filter(
            business=business,
            employment_status=EmploymentStatus.ACTIVE,
            user__isnull=False,
            user__is_active=True,
            user__user_roles__role__is_active=True,
            user__user_roles__role__code__in=WORKSPACE_MANAGER_ROLE_CODES,
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    for user in User.objects.filter(id__in=manager_ids, is_active=True):
        users[str(user.id)] = user
    return list(users.values())
