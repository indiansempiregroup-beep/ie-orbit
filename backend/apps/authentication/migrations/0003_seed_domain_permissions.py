from __future__ import annotations

from django.db import migrations

from apps.authentication.constants import (
    ALL_PERMISSION_DEFINITIONS,
    DEFAULT_ROLE_DEFINITIONS,
    DEFAULT_ROLE_PERMISSION_CODES,
)


def seed_domain_permissions(apps, schema_editor) -> None:
    role_model = apps.get_model("authentication", "Role")
    permission_model = apps.get_model("authentication", "Permission")
    role_permission_model = apps.get_model("authentication", "RolePermission")

    permissions_by_code = {}
    for definition in ALL_PERMISSION_DEFINITIONS:
        permission, _ = permission_model.objects.get_or_create(
            code=definition["code"],
            defaults={
                "name": definition["name"],
                "resource": definition["resource"],
                "action": definition["action"],
                "is_system": True,
            },
        )
        permissions_by_code[permission.code] = permission

    roles_by_code = {}
    for definition in DEFAULT_ROLE_DEFINITIONS:
        role, _ = role_model.objects.get_or_create(
            code=definition["code"],
            defaults={
                "name": definition["name"],
                "description": f"System role: {definition['name']}",
                "is_system": True,
            },
        )
        roles_by_code[role.code] = role

    for role_code, permission_codes in DEFAULT_ROLE_PERMISSION_CODES.items():
        role = roles_by_code[role_code]
        for permission_code in permission_codes:
            role_permission_model.objects.get_or_create(
                role=role,
                permission=permissions_by_code[permission_code],
            )

    user_role_model = apps.get_model("authentication", "UserRole")
    tenant_model = apps.get_model("tenancy", "Tenant")
    owner_role = roles_by_code["business_owner"]
    for tenant in tenant_model.objects.all():
        if tenant.owner_id:
            user_role_model.objects.get_or_create(
                user_id=tenant.owner_id,
                role=owner_role,
                defaults={"assigned_by": None},
            )


def noop_reverse(apps, schema_editor) -> None:
    return None


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0002_seed_default_roles"),
        ("tenancy", "0002_m5_tenant_organization_platform"),
    ]

    operations = [
        migrations.RunPython(seed_domain_permissions, noop_reverse),
    ]
