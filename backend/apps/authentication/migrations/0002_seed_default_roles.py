from __future__ import annotations

from django.db import migrations

IAM_PERMISSION_DEFINITIONS = (
    {
        "code": "iam:user:read",
        "name": "Read users",
        "resource": "iam.user",
        "action": "read",
    },
    {
        "code": "iam:user:update_self",
        "name": "Update own profile",
        "resource": "iam.user",
        "action": "update_self",
    },
    {
        "code": "iam:role:assign",
        "name": "Assign roles",
        "resource": "iam.role",
        "action": "assign",
    },
    {
        "code": "iam:permission:assign",
        "name": "Assign permissions",
        "resource": "iam.permission",
        "action": "assign",
    },
)

DEFAULT_ROLE_DEFINITIONS = (
    {"code": "super_admin", "name": "Super Admin"},
    {"code": "platform_admin", "name": "Platform Admin"},
    {"code": "business_owner", "name": "Business Owner"},
    {"code": "manager", "name": "Manager"},
    {"code": "staff", "name": "Staff"},
    {"code": "customer", "name": "Customer"},
)

IAM_ROLE_PERMISSION_CODES = {
    "super_admin": tuple(permission["code"] for permission in IAM_PERMISSION_DEFINITIONS),
    "platform_admin": tuple(permission["code"] for permission in IAM_PERMISSION_DEFINITIONS),
    "business_owner": ("iam:user:read", "iam:user:update_self"),
    "manager": ("iam:user:update_self",),
    "staff": ("iam:user:update_self",),
    "customer": ("iam:user:update_self",),
}


def seed_default_roles(apps, schema_editor) -> None:
    role_model = apps.get_model("authentication", "Role")
    permission_model = apps.get_model("authentication", "Permission")
    role_permission_model = apps.get_model("authentication", "RolePermission")

    permissions_by_code = {}
    for definition in IAM_PERMISSION_DEFINITIONS:
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

    for role_code, permission_codes in IAM_ROLE_PERMISSION_CODES.items():
        role = roles_by_code[role_code]
        for permission_code in permission_codes:
            role_permission_model.objects.get_or_create(
                role=role,
                permission=permissions_by_code[permission_code],
            )


def noop_reverse(apps, schema_editor) -> None:
    return None


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_roles, noop_reverse),
    ]
