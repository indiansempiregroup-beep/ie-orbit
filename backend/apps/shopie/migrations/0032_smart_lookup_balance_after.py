# Smart lookup usage: wallet balance after each ledger row.

from __future__ import annotations

from django.db import migrations, models
from django.db.models import Sum


def backfill_balance_after(apps, schema_editor):
    SmartLookupUsage = apps.get_model("shopie", "SmartLookupUsage")
    SmartLookupWallet = apps.get_model("shopie", "SmartLookupWallet")

    wallet_by_business = {
        str(row.business_id): int(row.balance_paise or 0)
        for row in SmartLookupWallet.objects.all().only("business_id", "balance_paise")
    }

    business_ids = (
        SmartLookupUsage.objects.order_by()
        .values_list("business_id", flat=True)
        .distinct()
    )
    for business_id in business_ids:
        rows = list(
            SmartLookupUsage.objects.filter(business_id=business_id).order_by("created_at", "id")
        )
        if not rows:
            continue
        charged_sum = int(
            SmartLookupUsage.objects.filter(business_id=business_id).aggregate(
                total=Sum("charged_paise")
            )["total"]
            or 0
        )
        current = int(wallet_by_business.get(str(business_id), 0))
        # charged_paise: debit > 0, credit < 0 → balance = start - sum(charged)
        balance = current + charged_sum
        updates = []
        for row in rows:
            balance -= int(row.charged_paise or 0)
            if row.charged_paise:
                row.balance_after_paise = balance
                updates.append(row)
            elif row.balance_after_paise is not None:
                row.balance_after_paise = None
                updates.append(row)
        if updates:
            SmartLookupUsage.objects.bulk_update(updates, ["balance_after_paise"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0031_gtin_catalog_categories_smart_lookup"),
    ]

    operations = [
        migrations.AddField(
            model_name="smartlookupusage",
            name="balance_after_paise",
            field=models.IntegerField(
                blank=True,
                help_text="Wallet balance after this row (null for free lookups that did not touch the wallet).",
                null=True,
            ),
        ),
        migrations.RunPython(backfill_balance_after, migrations.RunPython.noop),
    ]
