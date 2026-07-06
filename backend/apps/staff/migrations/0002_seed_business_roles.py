from __future__ import annotations

from django.db import migrations

BUSINESS_ROLES = [
    ("business-owner", "Owner", "owner"),
    ("business-manager", "Manager", "manager"),
    ("business-receptionist", "Receptionist", "receptionist"),
    ("business-stylist", "Stylist", "stylist"),
    ("business-therapist", "Therapist", "therapist"),
    ("business-technician", "Technician", "technician"),
    ("business-consultant", "Consultant", "consultant"),
    ("business-assistant", "Assistant", "assistant"),
    ("business-read-only", "Read Only", "read_only"),
]


def seed_business_roles(apps, schema_editor) -> None:
    BusinessRole = apps.get_model("staff", "BusinessRole")
    for code, name, role_type in BUSINESS_ROLES:
        BusinessRole.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "role_type": role_type,
                "description": f"Standard business operations role: {name}.",
                "permissions": [],
                "is_system": True,
            },
        )


def remove_business_roles(apps, schema_editor) -> None:
    BusinessRole = apps.get_model("staff", "BusinessRole")
    BusinessRole.objects.filter(code__in=[role[0] for role in BUSINESS_ROLES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("staff", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_business_roles, remove_business_roles),
    ]
