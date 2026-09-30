from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0029_trial_days_forty_five"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformplanpackage",
            name="yearly_months_charged",
            field=models.PositiveSmallIntegerField(
                default=10,
                help_text="Months charged for yearly billing (e.g. 10 = pay 10 months, get 12).",
            ),
        ),
    ]
