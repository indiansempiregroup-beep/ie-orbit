from __future__ import annotations

from apps.platform_admin.models import PlatformFeatureFlag
from apps.tenancy.models import Tenant

GOOGLE_ADS_FLAG = "google_ads"
RAZORPAY_FLAG = "razorpay"
CASHFREE_FLAG = "cashfree"


def tenant_feature_enabled(*, tenant: Tenant, key: str, default: bool = True) -> bool:
    """Resolve a platform-admin tenant switch without requiring a seeded row."""
    enabled = (
        PlatformFeatureFlag.objects.filter(tenant=tenant, key=key)
        .values_list("enabled", flat=True)
        .first()
    )
    return default if enabled is None else bool(enabled)
