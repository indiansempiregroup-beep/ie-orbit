from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0004_add_iam_role_assign_to_owner"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="profile_photo",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
