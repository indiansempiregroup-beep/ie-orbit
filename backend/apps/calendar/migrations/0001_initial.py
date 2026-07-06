from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("tenancy", "0001_initial"),
        ("businesses", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CalendarConnection",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("provider", models.CharField(default="google", max_length=80)),
                ("account_email", models.EmailField(blank=True, max_length=254)),
                ("access_token", models.TextField(blank=True)),
                ("refresh_token", models.TextField(blank=True)),
                ("token_expires_at", models.DateTimeField(blank=True, null=True)),
                ("scope", models.CharField(blank=True, max_length=255)),
                ("is_connected", models.BooleanField(default=False)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("business", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="calendar_connections", to="businesses.business")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="calendar_calendarconnection_records", to="tenancy.tenant")),
            ],
            options={"db_table": "calendar_connections"},
        ),
        migrations.CreateModel(
            name="CalendarSelection",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                ("calendar_id", models.CharField(max_length=255)),
                ("calendar_name", models.CharField(blank=True, max_length=160)),
                ("is_default", models.BooleanField(default=False)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("business", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="calendar_selections", to="businesses.business")),
                ("connection", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="selections", to="calendar.calendarconnection")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="calendar_calendarselection_records", to="tenancy.tenant")),
            ],
            options={"db_table": "calendar_selections"},
        ),
    ]
