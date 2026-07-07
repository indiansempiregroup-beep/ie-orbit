from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0002_billingwebhookevent_retry_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="billingwebhookevent",
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
    ]
