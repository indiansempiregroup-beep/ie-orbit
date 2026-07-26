from __future__ import annotations

from django.db import migrations

MANAGER_ADDED_PERMISSIONS = (
    "iam:user:read",
    "iam:role:assign",
    "staff:manage",
)

STAFF_REMOVED_PERMISSIONS = ("staff:read",)


def align_manager_staff_permissions(apps, schema_editor) -> None:
    Role = apps.get_model("authentication", "Role")
    Permission = apps.get_model("authentication", "Permission")
    RolePermission = apps.get_model("authentication", "RolePermission")

    manager = Role.objects.filter(code="manager").first()
    if manager:
        for code in MANAGER_ADDED_PERMISSIONS:
            permission = Permission.objects.filter(code=code).first()
            if permission:
                RolePermission.objects.get_or_create(role=manager, permission=permission)

    staff = Role.objects.filter(code="staff").first()
    if staff:
        RolePermission.objects.filter(
            role=staff,
            permission__code__in=STAFF_REMOVED_PERMISSIONS,
        ).delete()


def revert_manager_staff_permissions(apps, schema_editor) -> None:
    Role = apps.get_model("authentication", "Role")
    Permission = apps.get_model("authentication", "Permission")
    RolePermission = apps.get_model("authentication", "RolePermission")

    manager = Role.objects.filter(code="manager").first()
    if manager:
        RolePermission.objects.filter(
            role=manager,
            permission__code__in=MANAGER_ADDED_PERMISSIONS,
        ).delete()

    staff = Role.objects.filter(code="staff").first()
    if staff:
        for code in STAFF_REMOVED_PERMISSIONS:
            permission = Permission.objects.filter(code=code).first()
            if permission:
                RolePermission.objects.get_or_create(role=staff, permission=permission)


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0005_expand_profile_photo_field"),
    ]

    operations = [
        migrations.RunPython(align_manager_staff_permissions, revert_manager_staff_permissions),
    ]
