from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0041_avg_cost_sale_profit_fact"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopsaleprofitfact",
            name="tax_collected",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0.00"), max_digits=12
            ),
        ),
        migrations.AddField(
            model_name="shopsaleprofitfact",
            name="amount_paid",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0.00"), max_digits=12
            ),
        ),
    ]
