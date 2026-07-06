from django.contrib import admin

from apps.tenancy.models import (
    Branding,
    Organization,
    OrganizationSettings,
    Subscription,
    SubscriptionPlan,
    Tenant,
    TenantSettings,
)


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("display_name", "slug", "status", "owner", "timezone", "currency")
    search_fields = ("display_name", "legal_name", "slug", "owner__email")
    list_filter = ("status", "country", "currency", "language")
    readonly_fields = ("id", "created_at", "updated_at", "created_by", "updated_by")


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "business_category", "contact_email", "city", "country")
    search_fields = ("name", "legal_name", "tenant__slug", "contact_email")
    list_filter = ("business_category", "country", "state")
    readonly_fields = ("id", "created_at", "updated_at", "created_by", "updated_by")


@admin.register(Branding)
class BrandingAdmin(admin.ModelAdmin):
    list_display = ("tenant", "app_name", "theme_mode", "white_label_enabled", "primary_color")
    search_fields = ("tenant__display_name", "tenant__slug", "app_name")
    list_filter = ("theme_mode", "white_label_enabled")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_public", "is_active")
    search_fields = ("name", "code")
    list_filter = ("is_public", "is_active")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("tenant", "plan", "status", "renewal_date", "external_reference")
    search_fields = ("tenant__display_name", "tenant__slug", "external_reference")
    list_filter = ("status", "plan")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(TenantSettings)
class TenantSettingsAdmin(admin.ModelAdmin):
    list_display = ("tenant", "timezone", "currency", "language")
    search_fields = ("tenant__display_name", "tenant__slug")
    list_filter = ("timezone", "currency", "language")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(OrganizationSettings)
class OrganizationSettingsAdmin(admin.ModelAdmin):
    list_display = ("organization", "tenant", "timezone", "currency", "language")
    search_fields = ("organization__name", "tenant__slug")
    list_filter = ("timezone", "currency", "language")
    readonly_fields = ("id", "created_at", "updated_at")
