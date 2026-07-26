from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("tenancy", "0004_expand_asset_url_fields"),
        ("businesses", "0010_plan_entitlements_offices_booking_branch"),
    ]

    operations = [
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_plan",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="pending_business_product_subscriptions",
                to="tenancy.subscriptionplan",
            ),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_billing_interval",
            field=models.CharField(
                blank=True,
                choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
                default="",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_extra_staff",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_extra_offices",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_plan_scheduled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="pending_cancel",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="businessproductsubscription",
            name="renewal_reminder_last_sent_on",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="businessproductsubscription",
            index=models.Index(
                fields=["current_period_ends_at", "status"],
                name="business_pr_current_7d2f1a_idx",
            ),
        ),
    ]
