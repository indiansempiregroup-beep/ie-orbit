# Generated manually for staff email/user uniqueness

from django.conf import settings
from django.db import migrations, models
from django.db.models import Count


def dedupe_staff_identity(apps, schema_editor):
    """Clear conflicting email/user values so unique constraints can be added."""
    Staff = apps.get_model("staff", "Staff")

    email_dupes = (
        Staff.objects.exclude(email="")
        .values("tenant_id", "business_id", "email")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
    )
    for group in email_dupes:
        rows = list(
            Staff.objects.filter(
                tenant_id=group["tenant_id"],
                business_id=group["business_id"],
                email=group["email"],
            ).order_by("-user_id", "-created_at", "-id")
        )
        for row in rows[1:]:
            row.email = ""
            row.save(update_fields=["email"])

    user_dupes = (
        Staff.objects.exclude(user_id=None)
        .values("tenant_id", "business_id", "user_id")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
    )
    for group in user_dupes:
        rows = list(
            Staff.objects.filter(
                tenant_id=group["tenant_id"],
                business_id=group["business_id"],
                user_id=group["user_id"],
            ).order_by("-created_at", "-id")
        )
        for row in rows[1:]:
            row.user_id = None
            row.save(update_fields=["user_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0004_plan_entitlements_offices_booking_branch"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(dedupe_staff_identity, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="staff",
            constraint=models.UniqueConstraint(
                condition=models.Q(("email", ""), _negated=True),
                fields=("tenant", "business", "email"),
                name="uq_staff_tenant_business_email",
            ),
        ),
        migrations.AddConstraint(
            model_name="staff",
            constraint=models.UniqueConstraint(
                condition=models.Q(("user__isnull", False)),
                fields=("tenant", "business", "user"),
                name="uq_staff_tenant_business_user",
            ),
        ),
    ]
