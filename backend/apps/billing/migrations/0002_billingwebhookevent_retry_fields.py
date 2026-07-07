from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="billingwebhookevent",
            name="next_retry_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="billingwebhookevent",
            name="retry_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
