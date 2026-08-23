import django.db.models.deletion
from django.db import migrations, models

import apps.core.db.uuid
import apps.shopie.models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0016_remove_crmie_invoiceie"),
        ("shopie", "0017_coupon_optional_per_customer_limit"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopbusinesssettings",
            name="instant_delivery_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="shopbusinesssettings",
            name="delivery_integration",
            field=models.JSONField(
                blank=True,
                default=apps.shopie.models._default_delivery_integration,
            ),
        ),
        migrations.AlterField(
            model_name="shoporder",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("confirmed", "Confirmed"),
                    ("ready", "Ready"),
                    ("out_for_delivery", "Out for Delivery"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="pending",
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name="ShopDeliveryWebhookEvent",
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
                ("provider", models.CharField(db_index=True, max_length=32)),
                ("external_event_id", models.CharField(max_length=160)),
                ("event_type", models.CharField(blank=True, db_index=True, max_length=120)),
                ("payload", models.JSONField(default=dict)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("received", "Received"),
                            ("processed", "Processed"),
                            ("failed", "Failed"),
                            ("ignored", "Ignored"),
                        ],
                        db_index=True,
                        default="received",
                        max_length=32,
                    ),
                ),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("error_message", models.TextField(blank=True)),
                (
                    "business",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="shop_delivery_webhook_events",
                        to="businesses.business",
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="delivery_webhook_events",
                        to="shopie.shoporder",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="shop_delivery_webhook_events",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "shop_delivery_webhook_events",
                "abstract": False,
                "indexes": [
                    models.Index(
                        fields=["is_active", "deleted_at"],
                        name="shop_delive_is_acti_3ba8cf_idx",
                    ),
                    models.Index(fields=["created_at"], name="shop_delive_created_03da71_idx"),
                    models.Index(fields=["updated_at"], name="shop_delive_updated_576b8d_idx"),
                    models.Index(
                        fields=["provider", "event_type", "status"],
                        name="shop_delive_provide_75c880_idx",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("provider", "external_event_id"),
                        name="uq_shop_delivery_webhook_provider_event",
                    )
                ],
            },
        ),
    ]
