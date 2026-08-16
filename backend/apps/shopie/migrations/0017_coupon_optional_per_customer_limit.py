from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shopie", "0016_shop_coupons"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopcoupon",
            name="max_redemptions_per_customer",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
