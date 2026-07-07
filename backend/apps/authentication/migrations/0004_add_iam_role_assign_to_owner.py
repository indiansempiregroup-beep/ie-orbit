from __future__ import annotations

from django.db import migrations


def add_role_assign_to_business_owner(apps, schema_editor) -> None:
    Role = apps.get_model("authentication", "Role")
    Permission = apps.get_model("authentication", "Permission")
    RolePermission = apps.get_model("authentication", "RolePermission")

    role = Role.objects.filter(code="business_owner").first()
    permission = Permission.objects.filter(code="iam:role:assign").first()
    if not role or not permission:
        return

    RolePermission.objects.get_or_create(role=role, permission=permission)


def noop_reverse(apps, schema_editor) -> None:
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0003_seed_domain_permissions"),
    ]

    operations = [
        migrations.RunPython(add_role_assign_to_business_owner, noop_reverse),
    ]
