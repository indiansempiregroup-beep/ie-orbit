from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0026_shoporder_created_at_index"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopbusinesssettings",
            name="cod_enabled",
            field=models.BooleanField(
                default=True,
                help_text="Allow online customers to pay with cash on delivery or at pickup.",
            ),
        ),
    ]
