from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0012_subscription_period_lock_fix"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="loyalty_preferences",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
