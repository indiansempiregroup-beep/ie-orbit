from django.contrib import admin

from apps.businesses.models import (
    Business,
    BusinessMedia,
    BusinessProfile,
    BusinessSettings,
)


class BusinessProfileInline(admin.StackedInline):
    model = BusinessProfile
    extra = 0
    can_delete = False


class BusinessSettingsInline(admin.StackedInline):
    model = BusinessSettings
    extra = 0
    can_delete = False


class BusinessMediaInline(admin.TabularInline):
    model = BusinessMedia
    extra = 0


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "business_code",
        "tenant",
        "organization",
        "industry_category",
        "city",
        "status",
        "verification_status",
    )
    search_fields = (
        "business_name",
        "display_name",
        "business_code",
        "tenant__slug",
        "organization__name",
        "email",
    )
    list_filter = ("status", "verification_status", "industry_category", "country", "city")
    readonly_fields = ("id", "created_at", "updated_at", "created_by", "updated_by")
    inlines = [BusinessProfileInline, BusinessSettingsInline, BusinessMediaInline]


@admin.register(BusinessProfile)
class BusinessProfileAdmin(admin.ModelAdmin):
    list_display = ("business", "tenant", "emergency_contact", "booking_lead_time")
    search_fields = ("business__display_name", "tenant__slug", "emergency_contact")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(BusinessSettings)
class BusinessSettingsAdmin(admin.ModelAdmin):
    list_display = ("business", "tenant", "time_slot_interval", "buffer_time")
    search_fields = ("business__display_name", "tenant__slug")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(BusinessMedia)
class BusinessMediaAdmin(admin.ModelAdmin):
    list_display = ("business", "tenant", "media_type", "title", "sort_order")
    search_fields = ("business__display_name", "tenant__slug", "title", "file_url")
    list_filter = ("media_type", "storage_backend")
    readonly_fields = ("id", "created_at", "updated_at")
