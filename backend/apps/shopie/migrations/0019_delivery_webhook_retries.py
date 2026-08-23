from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shopie", "0018_instant_delivery"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopdeliverywebhookevent",
            name="status",
            field=models.CharField(
                choices=[
                    ("received", "Received"),
                    ("processed", "Processed"),
                    ("failed", "Failed"),
                    ("ignored", "Ignored"),
                    ("dead_letter", "Dead Letter"),
                ],
                db_index=True,
                default="received",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="shopdeliverywebhookevent",
            name="retry_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="shopdeliverywebhookevent",
            name="next_retry_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
