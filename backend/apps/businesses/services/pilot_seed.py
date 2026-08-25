from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import IntegrityError, transaction

from apps.authentication.models import User, UserStatus
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    WhiteLabelProfile,
)
from apps.businesses.services.businesses import BusinessService
from apps.businesses.services.white_label import ensure_white_label_profile
from apps.services.models import Service, ServicePricing, ServiceDuration, ServiceStatus, ServiceVisibility
from apps.tenancy.models import Organization, Tenant
from apps.tenancy.repositories.tenancy import TenantRepository


@dataclass(frozen=True)
class PilotFlavorSeed:
    tenant_slug: str
    tenant_display_name: str
    business_code: str
    business_display_name: str
    app_name: str
    primary_color: str
    secondary_color: str
    accent_color: str
    bundle_id_ios: str
    bundle_id_android: str
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"
    service_name: str = "Haircut"
    service_price: int = 999


PILOT_FLAVORS: tuple[PilotFlavorSeed, ...] = (
    PilotFlavorSeed(
        tenant_slug="demo",
        tenant_display_name="Demo Salon",
        business_code="MAIN",
        business_display_name="Demo Salon",
        app_name="Demo Salon",
        primary_color="#1A56DB",
        secondary_color="#111827",
        accent_color="#60A5FA",
        bundle_id_ios="com.ieorbit.demo.salon",
        bundle_id_android="com.ieorbit.demo.salon",
    ),
    PilotFlavorSeed(
        tenant_slug="empire-salon",
        tenant_display_name="Empire Salon Group",
        business_code="main",
        business_display_name="Empire Salon",
        app_name="Empire Salon",
        primary_color="#7C3AED",
        secondary_color="#1F2937",
        accent_color="#C4B5FD",
        bundle_id_ios="com.ieorbit.empiresalon",
        bundle_id_android="com.ieorbit.empiresalon",
    ),
)


def _flavor_key(tenant_slug: str, business_code: str) -> str:
    return f"{tenant_slug}-{business_code}".replace("_", "-")


def _get_or_create_owner() -> User:
    email = "pilot-owner@ieorbit.local"
    user = User.objects.filter(email__iexact=email).first()
    if user is not None:
        return user
    try:
        with transaction.atomic():
            return User.objects.create_user(
                email=email,
                password="PilotPass123!",
                status=UserStatus.ACTIVE,
                first_name="Pilot",
                last_name="Owner",
            )
    except IntegrityError:
        return User.objects.get(email__iexact=email)


@transaction.atomic
def _get_or_create_pilot_business(*, config: PilotFlavorSeed, owner: User) -> Business:
    tenant = Tenant.objects.filter(slug=config.tenant_slug).first()
    if tenant is None:
        tenant = Tenant.objects.create(
            slug=config.tenant_slug,
            display_name=config.tenant_display_name,
            owner=owner,
            timezone=config.timezone,
            currency=config.currency,
            primary_color=config.primary_color,
            secondary_color=config.secondary_color,
        )
        TenantRepository().ensure_foundation_records(tenant)
    organization = Organization.objects.filter(tenant=tenant).first()
    if organization is None:
        organization = Organization.objects.create(tenant=tenant, name=config.tenant_display_name)

    business = Business.objects.filter(tenant=tenant, business_code=config.business_code).first()
    business_service = BusinessService()
    if business is None:
        business = Business(
            tenant=tenant,
            organization=organization,
            business_code=config.business_code,
            business_name=config.business_display_name,
            display_name=config.business_display_name,
            timezone=config.timezone,
            currency=config.currency,
        )
        business.mark_created(actor_id=owner.id)
        business.save()
        business_service.ensure_foundation_records(business)
    else:
        business_service.ensure_foundation_records(business)

    if not business.product_subscriptions.filter(
        product_code="appointie",
        status__in={
            BusinessProductSubscriptionStatus.ACTIVE,
            BusinessProductSubscriptionStatus.TRIALING,
        },
    ).exists():
        BusinessProductSubscription.objects.get_or_create(
            tenant=tenant,
            business=business,
            product_code="appointie",
            defaults={"status": BusinessProductSubscriptionStatus.TRIALING},
        )
        business.selected_product = "appointie"
        business.save(update_fields=["selected_product", "updated_at"])

    _ensure_demo_service(tenant=tenant, business=business, config=config)
    return business


def _ensure_demo_service(*, tenant: Tenant, business: Business, config: PilotFlavorSeed) -> None:
    service = Service.objects.filter(
        tenant=tenant,
        business=business,
        service_code="haircut",
    ).first()
    if service is None:
        service = Service.objects.create(
            tenant=tenant,
            business=business,
            service_code="haircut",
            name=config.service_name,
            display_name=config.service_name,
            short_description="Standard haircut service",
            status=ServiceStatus.ACTIVE,
            visibility=ServiceVisibility.PUBLIC,
            online_booking_enabled=True,
        )
        ServiceDuration.objects.create(
            tenant=tenant,
            service=service,
            duration_minutes=30,
            is_default=True,
        )
        ServicePricing.objects.create(
            tenant=tenant,
            service=service,
            currency=business.currency,
            base_price=config.service_price,
            is_default=True,
        )


def _apply_pilot_branding(*, business: Business, config: PilotFlavorSeed) -> WhiteLabelProfile:
    profile = ensure_white_label_profile(business=business)
    flavor_key = _flavor_key(config.tenant_slug, config.business_code)
    profile.flavor_key = flavor_key
    profile.app_slug = flavor_key
    profile.app_name = config.app_name
    profile.primary_color = config.primary_color
    profile.secondary_color = config.secondary_color
    profile.accent_color = config.accent_color
    profile.bundle_id_ios = config.bundle_id_ios
    profile.bundle_id_android = config.bundle_id_android
    profile.white_label_enabled = True
    profile.build_metadata = {
        "pilot": True,
        "seed_version": 1,
        "tenant_slug": config.tenant_slug,
        "business_code": config.business_code,
    }
    profile.save()
    return profile


@transaction.atomic
def seed_pilot_white_label_profiles() -> list[dict[str, Any]]:
    owner = _get_or_create_owner()
    rows: list[dict[str, Any]] = []
    for config in PILOT_FLAVORS:
        business = _get_or_create_pilot_business(config=config, owner=owner)
        profile = _apply_pilot_branding(business=business, config=config)
        rows.append(
            {
                "flavor_key": profile.flavor_key,
                "tenant_slug": config.tenant_slug,
                "business_code": config.business_code,
                "app_name": profile.app_name,
                "business_id": str(business.id),
            }
        )
    return rows


@transaction.atomic
def seed_all_white_label_profiles() -> int:
    count = 0
    for business in Business.active_objects.select_related("tenant"):
        ensure_white_label_profile(business=business)
        count += 1
    return count
