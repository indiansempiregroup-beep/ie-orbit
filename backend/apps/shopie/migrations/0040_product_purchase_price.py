from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0039_shop_business_settings_cod_allowed_for_instant_delivery"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopproduct",
            name="purchase_price",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="shoporderline",
            name="purchase_price_snapshot",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
    ]
