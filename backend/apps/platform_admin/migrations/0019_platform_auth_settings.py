# Platform auth settings singleton (BaseModel fields completed in 0020).

from __future__ import annotations

import django.db.models.deletion
from django.db import migrations, models

import apps.core.db.uuid


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0017_businesssettings_whatsapp_integration"),
        ("platform_admin", "0018_notifications_whatsapp_feature"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformAuthSettings",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("key", models.SlugField(default="default", max_length=20, unique=True)),
                (
                    "ops_otp_whatsapp_business",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="businesses.business",
                    ),
                ),
            ],
            options={
                "db_table": "platform_auth_settings",
            },
        ),
    ]
