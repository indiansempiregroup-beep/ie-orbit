# Remove CRMIE and InvoiceIE from live data.
# InvoiceIE subscriptions become ShopIE (billing successor). CRMIE is dropped.

from __future__ import annotations

from django.db import migrations
from django.utils import timezone

REMOVED_PRODUCTS = ("crmie", "invoiceie")
INVOICEIE_PLAN_CODES = {"invoiceie-starter", "invoiceie-pro"}
LEGACY_PLAN_CODES = (
    "invoiceie-starter",
    "invoiceie-pro",
    "crmie-starter",
    "crmie-pro",
)


def _plan_for(SubscriptionPlan, code: str, name: str):
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code=code,
        defaults={"name": name, "is_public": True},
    )
    return plan


def forwards(apps, schema_editor):
    Business = apps.get_model("businesses", "Business")
    BusinessProductSubscription = apps.get_model("businesses", "BusinessProductSubscription")
    SubscriptionPlan = apps.get_model("tenancy", "SubscriptionPlan")
    Subscription = apps.get_model("tenancy", "Subscription")
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    PlatformFeatureFlag = apps.get_model("platform_admin", "PlatformFeatureFlag")
    BillingCheckoutSession = apps.get_model("billing", "BillingCheckoutSession")

    shopie_starter = _plan_for(SubscriptionPlan, "shopie-starter", "ShopIE Starter")
    shopie_pro = _plan_for(SubscriptionPlan, "shopie-pro", "ShopIE Pro")
    shopie_plans = {
        "shopie-starter": shopie_starter,
        "shopie-pro": shopie_pro,
        "invoiceie-starter": shopie_starter,
        "invoiceie-pro": shopie_pro,
    }

    def mapped_shopie_plan(plan_id):
        if not plan_id:
            return shopie_starter
        source = SubscriptionPlan.objects.filter(pk=plan_id).first()
        if source is None:
            return shopie_starter
        mapped = shopie_plans.get(source.code)
        return mapped or shopie_starter

    for subscription in BusinessProductSubscription.objects.filter(product_code="invoiceie"):
        existing_shopie = (
            BusinessProductSubscription.objects.filter(
                business_id=subscription.business_id,
                product_code="shopie",
            )
            .exclude(pk=subscription.pk)
            .first()
        )
        if existing_shopie is not None:
            subscription.delete()
            continue
        subscription.product_code = "shopie"
        subscription.plan_id = mapped_shopie_plan(subscription.plan_id).id
        if subscription.pending_plan_id:
            pending = SubscriptionPlan.objects.filter(pk=subscription.pending_plan_id).first()
            if pending is not None and pending.code in INVOICEIE_PLAN_CODES:
                subscription.pending_plan_id = shopie_plans[pending.code].id
        subscription.save()

    Business.objects.filter(selected_product="invoiceie").update(selected_product="shopie")

    for business in Business.objects.filter(selected_product="crmie"):
        remaining = list(
            BusinessProductSubscription.objects.filter(business_id=business.id)
            .exclude(product_code="crmie")
            .values_list("product_code", flat=True)
            .distinct()
        )
        if "appointie" in remaining:
            fallback = "appointie"
        elif "shopie" in remaining:
            fallback = "shopie"
        elif remaining:
            fallback = remaining[0]
        else:
            fallback = ""
        business.selected_product = fallback
        business.save(update_fields=["selected_product"])

    BusinessProductSubscription.objects.filter(product_code__in=REMOVED_PRODUCTS).delete()

    now = timezone.now()
    BillingCheckoutSession.objects.filter(
        product_code__in=REMOVED_PRODUCTS,
        status="created",
    ).update(status="expired", expires_at=now)

    PlatformPlanPackage.objects.filter(product_code__in=REMOVED_PRODUCTS).delete()
    PlatformFeatureFlag.objects.filter(key__in=REMOVED_PRODUCTS).delete()

    legacy_plans = list(SubscriptionPlan.objects.filter(code__in=LEGACY_PLAN_CODES))
    legacy_ids = [plan.id for plan in legacy_plans]
    if legacy_ids:
        Subscription.objects.filter(plan_id__in=legacy_ids).update(plan_id=None)
        BusinessProductSubscription.objects.filter(plan_id__in=legacy_ids).update(plan_id=None)
        BusinessProductSubscription.objects.filter(pending_plan_id__in=legacy_ids).update(pending_plan_id=None)
        SubscriptionPlan.objects.filter(id__in=legacy_ids).delete()


def backwards(apps, schema_editor):
    # Product catalogs no longer offer CRMIE/InvoiceIE; data is not restored.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0015_business_upi_payment_qr"),
        ("platform_admin", "0004_ops_mobile_function_features"),
        ("billing", "0003_webhook_dead_letter_status"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
