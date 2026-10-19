from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0045_instant_return_pickup"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopreturn",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("awaiting_customer", "Awaiting customer"),
                    ("approved", "Approved"),
                    ("completed", "Completed"),
                    ("rejected", "Rejected"),
                ],
                db_index=True,
                default="pending",
                max_length=32,
            ),
        ),
    ]
