from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("services", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="loyalty_points_earn",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
