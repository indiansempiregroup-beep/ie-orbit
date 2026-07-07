# Generated manually for white-label mobile profiles

import django.db.models.deletion
from django.db import migrations, models

import apps.core.db.uuid
import apps.tenancy.models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0006_remove_businessproductsubscription_business_pr_tenant__8f0f0a_idx_and_more"),
        ("tenancy", "0003_rename_tenants_slug_f70d36_idx_tenants_slug_899f50_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhiteLabelProfile",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("flavor_key", models.SlugField(max_length=80, unique=True)),
                ("app_slug", models.SlugField(max_length=120, unique=True)),
                ("app_name", models.CharField(max_length=120)),
                ("bundle_id_ios", models.CharField(blank=True, max_length=160)),
                ("bundle_id_android", models.CharField(blank=True, max_length=160)),
                ("logo", models.URLField(blank=True)),
                ("dark_logo", models.URLField(blank=True)),
                ("splash_image", models.URLField(blank=True)),
                ("favicon", models.URLField(blank=True)),
                (
                    "primary_color",
                    models.CharField(
                        default="#0F6CBD",
                        max_length=16,
                        validators=[apps.tenancy.models.hex_color_validator],
                    ),
                ),
                (
                    "secondary_color",
                    models.CharField(
                        default="#111827",
                        max_length=16,
                        validators=[apps.tenancy.models.hex_color_validator],
                    ),
                ),
                (
                    "accent_color",
                    models.CharField(
                        blank=True,
                        max_length=16,
                        validators=[apps.tenancy.models.hex_color_validator],
                    ),
                ),
                (
                    "theme_mode",
                    models.CharField(
                        choices=[("system", "System"), ("light", "Light"), ("dark", "Dark")],
                        default="system",
                        max_length=16,
                    ),
                ),
                ("white_label_enabled", models.BooleanField(default=True)),
                ("typography_settings", models.JSONField(blank=True, default=dict)),
                ("build_metadata", models.JSONField(blank=True, default=dict)),
                (
                    "business",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="white_label_profile",
                        to="businesses.business",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(class)ss",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "white_label_profiles",
                "ordering": ["app_name"],
            },
        ),
        migrations.AddIndex(
            model_name="whitelabelprofile",
            index=models.Index(fields=["tenant", "flavor_key"], name="white_label_tenant__a1f2c3_idx"),
        ),
        migrations.AddIndex(
            model_name="whitelabelprofile",
            index=models.Index(fields=["tenant", "app_slug"], name="white_label_tenant__b4d5e6_idx"),
        ),
        migrations.AddConstraint(
            model_name="whitelabelprofile",
            constraint=models.UniqueConstraint(fields=("business",), name="uq_white_label_profile_business"),
        ),
    ]
