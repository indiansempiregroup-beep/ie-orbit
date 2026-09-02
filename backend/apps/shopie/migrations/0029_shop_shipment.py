# Generated manually for ShopShipment courier tracking.

import django.db.models.deletion
from django.db import migrations, models

import apps.core.db.uuid


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0001_initial"),
        ("shopie", "0028_rename_shop_orders_tenant_business_created_idx_shop_orders_tenant__5c42eb_idx"),
        ("tenancy", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopordertrackingevent",
            name="source",
            field=models.CharField(
                choices=[
                    ("order", "Order"),
                    ("dispatch", "Dispatch"),
                    ("shipment", "Shipment"),
                    ("webhook", "Webhook"),
                    ("poll", "Poll"),
                    ("simulation", "Simulation"),
                    ("migration", "Migration"),
                ],
                db_index=True,
                default="order",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="ShopShipment",
            fields=[
                ("id", models.UUIDField(default=apps.core.db.uuid.uuid7, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("carrier", models.CharField(blank=True, db_index=True, max_length=32)),
                ("carrier_label", models.CharField(blank=True, max_length=120)),
                ("tracking_number", models.CharField(blank=True, db_index=True, max_length=120)),
                ("tracking_url", models.URLField(blank=True, max_length=1000)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("label_created", "Label created"),
                            ("shipped", "Shipped"),
                            ("in_transit", "In transit"),
                            ("out_for_delivery", "Out for delivery"),
                            ("delivered", "Delivered"),
                            ("failed", "Failed"),
                        ],
                        db_index=True,
                        default="shipped",
                        max_length=32,
                    ),
                ),
                ("shipped_at", models.DateTimeField(blank=True, null=True)),
                ("estimated_delivery_at", models.DateField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shop_shipments",
                        to="businesses.business",
                    ),
                ),
                (
                    "order",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shipment",
                        to="shopie.shoporder",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_set",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "shop_shipments",
                "indexes": [
                    models.Index(fields=["tenant", "created_at"], name="shop_shipments_tenant_created_idx"),
                    models.Index(fields=["business", "status", "shipped_at"], name="shop_shipments_biz_status_idx"),
                    models.Index(fields=["carrier", "tracking_number"], name="shop_shipments_carrier_awb_idx"),
                ],
            },
        ),
    ]
