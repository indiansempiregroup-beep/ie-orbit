from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0006_order_discounts"),
    ]

    operations = [
        migrations.AddField(
            model_name="shoppet",
            name="photo_url",
            field=models.CharField(blank=True, max_length=1024),
        ),
    ]
