from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0004_shopproduct_image_url_char"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopproduct",
            name="image_url",
            field=models.CharField(blank=True, max_length=1024),
        ),
    ]
