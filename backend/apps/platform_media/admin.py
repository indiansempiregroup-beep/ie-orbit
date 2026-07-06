from django.contrib import admin

from apps.platform_media.models import Media, MediaFolder, StorageProvider


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "media_type",
        "tenant",
        "business",
        "visibility",
        "mime_type",
        "file_size",
        "storage_provider",
    )
    search_fields = (
        "display_name",
        "original_filename",
        "storage_filename",
        "checksum",
        "tenant__slug",
        "business__display_name",
    )
    list_filter = ("media_type", "visibility", "storage_provider", "mime_type")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "deleted_at",
        "deleted_by",
    )


@admin.register(MediaFolder)
class MediaFolderAdmin(admin.ModelAdmin):
    list_display = ("name", "folder_type", "tenant", "business", "path")
    search_fields = ("name", "path", "tenant__slug", "business__display_name")
    list_filter = ("folder_type",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(StorageProvider)
class StorageProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "provider_type", "is_default", "is_active")
    search_fields = ("name", "code", "provider_type")
    list_filter = ("provider_type", "is_default", "is_active")
    readonly_fields = ("id", "created_at", "updated_at")
