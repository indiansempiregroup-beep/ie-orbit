from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0013_reward_points_loyalty"),
    ]

    operations = [
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pets_pack_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
