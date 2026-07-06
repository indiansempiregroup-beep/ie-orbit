from __future__ import annotations

from django.contrib import admin

from apps.customers.models import (
    Customer,
    CustomerAddress,
    CustomerCommunicationPreference,
    CustomerExportJob,
    CustomerImportJob,
    CustomerMergeRecord,
    CustomerNote,
    CustomerPreferences,
    CustomerProfile,
    CustomerTag,
)


class CustomerProfileInline(admin.StackedInline):
    model = CustomerProfile
    extra = 0


class CustomerPreferencesInline(admin.StackedInline):
    model = CustomerPreferences
    extra = 0


class CustomerAddressInline(admin.TabularInline):
    model = CustomerAddress
    extra = 0


class CustomerCommunicationPreferenceInline(admin.TabularInline):
    model = CustomerCommunicationPreference
    extra = 0


class CustomerNoteInline(admin.TabularInline):
    model = CustomerNote
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("display_name", "business", "email", "phone_number", "status", "created_at")
    list_filter = ("status", "business", "gender", "created_at")
    search_fields = (
        "display_name",
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "customer_code",
    )
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
        CustomerProfileInline,
        CustomerPreferencesInline,
        CustomerAddressInline,
        CustomerCommunicationPreferenceInline,
        CustomerNoteInline,
    ]


@admin.register(CustomerTag)
class CustomerTagAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "color", "created_at")
    list_filter = ("business",)
    search_fields = ("name", "description")


@admin.register(CustomerImportJob)
class CustomerImportJobAdmin(admin.ModelAdmin):
    list_display = ("id", "business", "status", "processed_rows", "failed_rows", "created_at")
    list_filter = ("status", "business", "created_at")


@admin.register(CustomerExportJob)
class CustomerExportJobAdmin(admin.ModelAdmin):
    list_display = ("id", "business", "status", "created_at")
    list_filter = ("status", "business", "created_at")


@admin.register(CustomerMergeRecord)
class CustomerMergeRecordAdmin(admin.ModelAdmin):
    list_display = ("source_customer", "target_customer", "business", "merged_by", "created_at")
    list_filter = ("business", "created_at")
