from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0025_delivery_tracking_history"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="shoporder",
            index=models.Index(
                fields=["tenant", "business", "created_at"],
                name="shop_orders_tenant_business_created_idx",
            ),
        ),
    ]
