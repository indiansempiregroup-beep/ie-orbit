from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import apps.core.db.uuid


class Migration(migrations.Migration):
    dependencies = [
        ("authentication", "0007_fix_django_admin_log_user_fk"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SocialAccount",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("provider", models.CharField(db_index=True, max_length=40)),
                ("subject", models.CharField(max_length=255)),
                ("email", models.EmailField(blank=True, max_length=254)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="social_accounts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "social_accounts",
            },
        ),
        migrations.AddConstraint(
            model_name="socialaccount",
            constraint=models.UniqueConstraint(
                fields=("provider", "subject"),
                name="uq_social_account_provider_subject",
            ),
        ),
        migrations.AddConstraint(
            model_name="socialaccount",
            constraint=models.UniqueConstraint(
                fields=("user", "provider"),
                name="uq_social_account_user_provider",
            ),
        ),
        migrations.AddIndex(
            model_name="socialaccount",
            index=models.Index(fields=["provider", "email"], name="social_acco_provide_895a7a_idx"),
        ),
    ]
