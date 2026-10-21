from __future__ import annotations

from apps.platform_admin.models import PlatformFeatureFlag
from apps.tenancy.models import Tenant

GOOGLE_ADS_FLAG = "google_ads"
RAZORPAY_FLAG = "razorpay"
CASHFREE_FLAG = "cashfree"
STRIPE_FLAG = "stripe"
AI_ASSISTANT_FLAG = "ai_assistant"
APPOINTIE_FLAG = "appointie"
SHOPIE_FLAG = "shopie"
BI_FULL_FLAG = "bi_full"
WHITE_LABEL_FLAG = "white_label"
SMART_LOOKUP_FLAG = "shopie_smart_lookup"
INVOICE_SCAN_FLAG = "shopie_invoice_scan"
PRODUCT_BG_REMOVE_FLAG = "shopie_product_bg_remove"
SERVICE_BG_REMOVE_FLAG = "appointie_service_bg_remove"

# Shown on each tenant in Platform Admin. Missing rows stay enabled.
DEFAULT_TENANT_FLAGS = (
    APPOINTIE_FLAG,
    SHOPIE_FLAG,
    BI_FULL_FLAG,
    WHITE_LABEL_FLAG,
    GOOGLE_ADS_FLAG,
    RAZORPAY_FLAG,
    CASHFREE_FLAG,
    STRIPE_FLAG,
    AI_ASSISTANT_FLAG,
    SMART_LOOKUP_FLAG,
    INVOICE_SCAN_FLAG,
    PRODUCT_BG_REMOVE_FLAG,
    SERVICE_BG_REMOVE_FLAG,
)


def tenant_feature_enabled(*, tenant: Tenant, key: str, default: bool = True) -> bool:
    """Resolve a platform-admin tenant switch without requiring a seeded row."""
    enabled = (
        PlatformFeatureFlag.objects.filter(tenant=tenant, key=key)
        .values_list("enabled", flat=True)
        .first()
    )
    return default if enabled is None else bool(enabled)
