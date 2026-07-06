from __future__ import annotations

from apps.authentication.models import Permission, Role, RolePermission, User, UserRole


class RoleService:
    def assign_role(
        self, *, user: User, role_code: str, assigned_by: str | None = None
    ) -> UserRole:
        role = Role.objects.get(code=role_code)
        user_role, _ = UserRole.objects.get_or_create(
            user=user,
            role=role,
            defaults={"assigned_by": assigned_by},
        )
        return user_role

    def user_permission_codes(self, *, user: User) -> set[str]:
        if user.is_superuser:
            return set(Permission.objects.values_list("code", flat=True))
        return set(
            Permission.objects.filter(role_permissions__role__user_roles__user=user)
            .distinct()
            .values_list("code", flat=True)
        )

    def role_permission_codes(self, *, role: Role) -> set[str]:
        return set(
            RolePermission.objects.filter(role=role).values_list("permission__code", flat=True)
        )
