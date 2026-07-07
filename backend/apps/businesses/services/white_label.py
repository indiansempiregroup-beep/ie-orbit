from __future__ import annotations

from typing import Any

from apps.businesses.models import Business, BusinessProductSubscription, BusinessProductSubscriptionStatus, WhiteLabelProfile


PRODUCT_FEATURES: dict[str, list[str]] = {
    "appointie": ["mobile_booking", "mobile_discover", "mobile_availability"],
    "bi": ["bi_overview", "bi_revenue", "bi_reports", "bi_forecast"],
}


def active_product_codes(business: Business) -> list[str]:
    codes = list(
        BusinessProductSubscription.objects.filter(
            business=business,
            status__in={
                BusinessProductSubscriptionStatus.ACTIVE,
                BusinessProductSubscriptionStatus.TRIALING,
            },
        ).values_list("product_code", flat=True)
    )
    if business.selected_product and business.selected_product not in codes:
        codes.append(business.selected_product)
    return sorted(set(codes))


def enabled_features(product_codes: list[str]) -> dict[str, bool]:
    features: dict[str, bool] = {}
    for product_code in product_codes:
        for feature in PRODUCT_FEATURES.get(product_code, []):
            features[feature] = True
    if not features and "appointie" in {code.lower() for code in product_codes}:
        features = {feature: True for feature in PRODUCT_FEATURES["appointie"]}
    if not features:
        features = {feature: True for feature in PRODUCT_FEATURES["appointie"]}
    return features


def serialize_white_label_profile(profile: WhiteLabelProfile) -> dict[str, Any]:
    business = profile.business
    tenant = business.tenant
    product_codes = active_product_codes(business)
    profile_record = getattr(business, "profile", None)
    cancellation_policy = ""
    rescheduling_policy = ""
    if profile_record is not None:
        cancellation_policy = profile_record.cancellation_policy or ""
        rescheduling_policy = profile_record.rescheduling_policy or ""
    address_parts = [
        part
        for part in [
            business.address_line1,
            business.address_line2,
            business.city,
            business.state,
            business.postal_code,
            business.country,
        ]
        if part
    ]
    return {
        "flavor_key": profile.flavor_key,
        "app_slug": profile.app_slug,
        "app_name": profile.app_name,
        "bundle_id_ios": profile.bundle_id_ios,
        "bundle_id_android": profile.bundle_id_android,
        "white_label_enabled": profile.white_label_enabled,
        "tenant_slug": tenant.slug,
        "business_code": business.business_code,
        "business": {
            "id": str(business.id),
            "display_name": business.display_name,
            "logo": profile.logo or business.logo,
            "currency": business.currency,
            "timezone": business.timezone,
            "phone": business.primary_contact,
            "email": business.email,
            "address_line1": business.address_line1,
            "address_line2": business.address_line2,
            "city": business.city,
            "state": business.state,
            "postal_code": business.postal_code,
            "country": business.country,
            "formatted_address": ", ".join(address_parts),
            "cancellation_policy": cancellation_policy,
            "rescheduling_policy": rescheduling_policy,
        },
        "branding": {
            "app_name": profile.app_name,
            "logo": profile.logo or business.logo,
            "dark_logo": profile.dark_logo,
            "splash_image": profile.splash_image,
            "favicon": profile.favicon,
            "primary_color": profile.primary_color,
            "secondary_color": profile.secondary_color,
            "accent_color": profile.accent_color,
            "theme_mode": profile.theme_mode,
            "typography_settings": profile.typography_settings,
        },
        "enabled_products": product_codes,
        "features": enabled_features(product_codes),
        "build_metadata": profile.build_metadata,
    }


def ensure_white_label_profile(*, business: Business) -> WhiteLabelProfile:
    existing = getattr(business, "white_label_profile", None)
    if existing is not None:
        return existing
    flavor_key = f"{business.tenant.slug}-{business.business_code}".replace("_", "-")
    app_slug = flavor_key
    return WhiteLabelProfile.objects.create(
        tenant=business.tenant,
        business=business,
        flavor_key=flavor_key,
        app_slug=app_slug,
        app_name=business.display_name,
        logo=business.logo,
        primary_color=business.tenant.primary_color,
        secondary_color=business.tenant.secondary_color,
    )
