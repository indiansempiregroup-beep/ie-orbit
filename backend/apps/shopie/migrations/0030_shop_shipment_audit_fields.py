# Add BaseModel audit/soft-delete columns missing from the initial ShopShipment migration.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0029_shop_shipment"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopshipment",
            name="created_by",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="shopshipment",
            name="updated_by",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="shopshipment",
            name="deleted_by",
            field=models.UUIDField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="shopshipment",
            name="deleted_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="shopshipment",
            name="is_active",
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddIndex(
            model_name="shopshipment",
            index=models.Index(fields=["is_active", "deleted_at"], name="shop_shipments_active_del_idx"),
        ),
        migrations.AddIndex(
            model_name="shopshipment",
            index=models.Index(
                fields=["tenant", "is_active", "deleted_at"],
                name="shop_shipments_tenant_active_idx",
            ),
        ),
    ]
