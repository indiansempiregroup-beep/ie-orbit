from decimal import Decimal

from django.db import migrations, models

import apps.core.db.uuid


class Migration(migrations.Migration):

    dependencies = [
        ("shopie", "0036_shop_document_kind_notes"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformgtincatalog",
            name="currency",
            field=models.CharField(blank=True, default="", max_length=3),
        ),
        migrations.AlterField(
            model_name="platformgtincatalog",
            name="gst_rate",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                default=None,
                max_digits=5,
                null=True,
            ),
        ),
        migrations.AddIndex(
            model_name="platformgtincatalog",
            index=models.Index(fields=["name"], name="platform_gt_name_8f0a1c_idx"),
        ),
        migrations.AddIndex(
            model_name="platformgtincatalog",
            index=models.Index(fields=["brand"], name="platform_gt_brand_1c9e2d_idx"),
        ),
        migrations.AddIndex(
            model_name="platformgtincatalog",
            index=models.Index(fields=["category"], name="platform_gt_categor_4a7b3e_idx"),
        ),
        migrations.AddIndex(
            model_name="platformgtincatalog",
            index=models.Index(fields=["source"], name="platform_gt_source_6d2f5a_idx"),
        ),
        migrations.CreateModel(
            name="PlatformGtinImportRun",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("source", models.CharField(blank=True, db_index=True, max_length=32)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("running", "Running"),
                            ("completed", "Completed"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("limit", models.PositiveIntegerField(default=1000)),
                ("total_source", models.PositiveIntegerField(default=0)),
                ("valid", models.PositiveIntegerField(default=0)),
                ("imported", models.PositiveIntegerField(default=0)),
                ("updated", models.PositiveIntegerField(default=0)),
                ("skipped", models.PositiveIntegerField(default=0)),
                ("duplicates", models.PositiveIntegerField(default=0)),
                ("invalid_barcodes", models.PositiveIntegerField(default=0)),
                ("missing_barcodes", models.PositiveIntegerField(default=0)),
                ("missing_images", models.PositiveIntegerField(default=0)),
                ("missing_prices", models.PositiveIntegerField(default=0)),
                ("missing_gst", models.PositiveIntegerField(default=0)),
                ("error_sample", models.JSONField(blank=True, default=list)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
            ],
            options={
                "db_table": "platform_gtin_import_runs",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="platformgtinimportrun",
            index=models.Index(fields=["is_active", "deleted_at"], name="platform_gt_is_acti_imp1_idx"),
        ),
        migrations.AddIndex(
            model_name="platformgtinimportrun",
            index=models.Index(fields=["created_at"], name="platform_gt_created_imp1_idx"),
        ),
        migrations.AddIndex(
            model_name="platformgtinimportrun",
            index=models.Index(fields=["updated_at"], name="platform_gt_updated_imp1_idx"),
        ),
        # Existing rows used 0.00 as "unknown"; treat them as unknown going forward.
        migrations.RunSQL(
            sql="UPDATE platform_gtin_catalog SET gst_rate = NULL WHERE gst_rate = 0",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
