import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0044_shop_return_logistics"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopreturn",
            name="return_method",
            field=models.CharField(
                choices=[
                    ("in_store", "In store"),
                    ("dropoff", "Customer drop-off"),
                    ("reverse_pickup", "Reverse pickup"),
                    ("instant_pickup", "Instant pickup"),
                ],
                db_index=True,
                default="in_store",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="shopdeliveryattempt",
            name="order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="delivery_attempts",
                to="shopie.shoporder",
            ),
        ),
        migrations.AddField(
            model_name="shopdeliveryattempt",
            name="shop_return",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="delivery_attempts",
                to="shopie.shopreturn",
            ),
        ),
        migrations.RemoveConstraint(
            model_name="shopdeliveryattempt",
            name="uq_shop_delivery_attempt_order_number",
        ),
        migrations.AddConstraint(
            model_name="shopdeliveryattempt",
            constraint=models.UniqueConstraint(
                condition=models.Q(("order__isnull", False)),
                fields=("order", "attempt_number"),
                name="uq_shop_delivery_attempt_order_number",
            ),
        ),
        migrations.AddConstraint(
            model_name="shopdeliveryattempt",
            constraint=models.UniqueConstraint(
                condition=models.Q(("shop_return__isnull", False)),
                fields=("shop_return", "attempt_number"),
                name="uq_shop_delivery_attempt_return_number",
            ),
        ),
    ]
