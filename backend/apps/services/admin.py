from __future__ import annotations

from django.contrib import admin

from apps.services.models import (
    Service,
    ServiceCategory,
    ServiceDuration,
    ServiceImage,
    ServicePricing,
    ServiceTag,
    ServiceVariant,
    TaxConfiguration,
)


class ServiceVariantInline(admin.TabularInline):
    model = ServiceVariant
    extra = 0


class ServiceDurationInline(admin.TabularInline):
    model = ServiceDuration
    extra = 0


class ServicePricingInline(admin.TabularInline):
    model = ServicePricing
    extra = 0


class TaxConfigurationInline(admin.TabularInline):
    model = TaxConfiguration
    extra = 0


class ServiceImageInline(admin.TabularInline):
    model = ServiceImage
    extra = 0


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "slug", "status", "display_order")
    list_filter = ("status", "business")
    search_fields = ("name", "slug", "description")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "business",
        "category",
        "status",
        "visibility",
        "online_booking_enabled",
    )
    list_filter = ("status", "visibility", "online_booking_enabled", "business", "category")
    search_fields = ("display_name", "name", "service_code", "description")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "created_by",
        "updated_by",
        "deleted_by",
    )
    inlines = [
        ServiceVariantInline,
        ServiceDurationInline,
        ServicePricingInline,
        TaxConfigurationInline,
        ServiceImageInline,
    ]


@admin.register(ServiceTag)
class ServiceTagAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "color", "created_at")
    list_filter = ("business",)
    search_fields = ("name", "description")
