# Generated manually for Phase 2 platform evolution

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0004_business_product_subscription_billing"),
        ("tenancy", "0003_rename_tenants_slug_f70d36_idx_tenants_slug_899f50_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="dashboard_preferences",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name="Branch",
            fields=[
                ("id", models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by_id", models.UUIDField(blank=True, null=True)),
                ("updated_by_id", models.UUIDField(blank=True, null=True)),
                ("deleted_by_id", models.UUIDField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("branch_code", models.SlugField(max_length=80)),
                ("branch_name", models.CharField(max_length=255)),
                ("display_name", models.CharField(max_length=255)),
                ("is_primary", models.BooleanField(db_index=True, default=False)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("phone_number", models.CharField(blank=True, max_length=32)),
                ("address_line1", models.CharField(blank=True, max_length=255)),
                ("address_line2", models.CharField(blank=True, max_length=255)),
                ("city", models.CharField(blank=True, db_index=True, max_length=120)),
                ("state", models.CharField(blank=True, max_length=120)),
                ("country", models.CharField(blank=True, db_index=True, max_length=120)),
                ("postal_code", models.CharField(blank=True, max_length=32)),
                ("timezone", models.CharField(blank=True, max_length=64)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("inactive", "Inactive"),
                            ("archived", "Archived"),
                        ],
                        db_index=True,
                        default="active",
                        max_length=32,
                    ),
                ),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="branches",
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
                "db_table": "branches",
                "ordering": ["display_name"],
            },
        ),
        migrations.AddIndex(
            model_name="branch",
            index=models.Index(fields=["tenant", "business", "status"], name="branches_tenant_business_status_idx"),
        ),
        migrations.AddIndex(
            model_name="branch",
            index=models.Index(fields=["tenant", "business", "is_primary"], name="branches_tenant_business_primary_idx"),
        ),
        migrations.AddConstraint(
            model_name="branch",
            constraint=models.UniqueConstraint(fields=("business", "branch_code"), name="uq_branch_business_code"),
        ),
    ]
