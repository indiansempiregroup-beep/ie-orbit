from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0003_shopproduct_category"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopproduct",
            name="image_url",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
