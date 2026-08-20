import apps.core.db.uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_ledger(apps, schema_editor):
    PlatformReferral = apps.get_model("platform_admin", "PlatformReferral")
    PlatformReferralAccrual = apps.get_model("platform_admin", "PlatformReferralAccrual")
    PlatformPayout = apps.get_model("platform_admin", "PlatformPayout")
    PlatformAffiliateLedgerEntry = apps.get_model("platform_admin", "PlatformAffiliateLedgerEntry")

    for referral in PlatformReferral.objects.all().iterator():
        meta = dict(referral.metadata or {})
        if not meta.get("payment_account_opened"):
            meta["payment_account_opened"] = True
            referral.metadata = meta
            referral.save(update_fields=["metadata"])

    for accrual in PlatformReferralAccrual.objects.select_related("referral").exclude(status="void"):
        PlatformAffiliateLedgerEntry.objects.create(
            affiliate_id=accrual.referral.affiliate_id,
            referral_id=accrual.referral_id,
            kind="earning",
            amount_paise=accrual.amount_paise,
            period_yyyy_mm=accrual.period_yyyy_mm,
            notes=f"Earning for {accrual.period_yyyy_mm}",
            status="recorded",
            metadata={"accrual_id": str(accrual.id), "source": "accrual"},
        )
        if accrual.status == "credited":
            PlatformAffiliateLedgerEntry.objects.create(
                affiliate_id=accrual.referral.affiliate_id,
                referral_id=accrual.referral_id,
                kind="credit",
                amount_paise=accrual.amount_paise,
                period_yyyy_mm=accrual.period_yyyy_mm,
                notes=f"Subscription credit for {accrual.period_yyyy_mm}",
                status="recorded",
                metadata={"accrual_id": str(accrual.id), "source": "accrual"},
            )

    for payout in PlatformPayout.objects.select_related("accrual").filter(status="paid"):
        referral_id = payout.accrual.referral_id if payout.accrual_id else None
        PlatformAffiliateLedgerEntry.objects.create(
            affiliate_id=payout.affiliate_id,
            referral_id=referral_id,
            kind="payment",
            amount_paise=payout.amount_paise,
            payment_ref=payout.payment_ref or "",
            notes=payout.notes or "Recorded payout",
            status="recorded",
            metadata={"payout_id": str(payout.id), "source": "payout"},
        )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0010_backfill_shop_coupons_feature"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="platformaffiliate",
            name="default_commission_paise",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="platformaffiliate",
            name="status",
            field=models.CharField(
                choices=[
                    ("active", "Active"),
                    ("paused", "Paused"),
                    ("disabled", "Disabled"),
                    ("inactive", "Inactive"),
                ],
                db_index=True,
                default="active",
                max_length=16,
            ),
        ),
        migrations.CreateModel(
            name="PlatformAffiliateLedgerEntry",
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
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("earning", "Earning"),
                            ("payment", "Payment"),
                            ("credit", "Subscription credit"),
                        ],
                        db_index=True,
                        max_length=16,
                    ),
                ),
                ("amount_paise", models.PositiveIntegerField()),
                ("period_yyyy_mm", models.CharField(blank=True, default="", max_length=7)),
                ("payment_ref", models.CharField(blank=True, default="", max_length=120)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("recorded", "Recorded"), ("void", "Void")],
                        db_index=True,
                        default="recorded",
                        max_length=16,
                    ),
                ),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "affiliate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ledger_entries",
                        to="platform_admin.platformaffiliate",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="platform_affiliate_ledger_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "referral",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="ledger_entries",
                        to="platform_admin.platformreferral",
                    ),
                ),
            ],
            options={
                "db_table": "platform_affiliate_ledger",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="platformaffiliateledgerentry",
            index=models.Index(fields=["affiliate", "kind", "status"], name="platform_af_affilia_8f1c3a_idx"),
        ),
        migrations.AddIndex(
            model_name="platformaffiliateledgerentry",
            index=models.Index(fields=["referral", "kind", "status"], name="platform_af_referra_4b9e2d_idx"),
        ),
        migrations.RunPython(backfill_ledger, noop_reverse),
    ]
