from __future__ import annotations

from rest_framework import serializers

from apps.platform_media.models import (
    Media,
    MediaFolder,
    MediaFolderType,
    MediaVisibility,
    StorageProvider,
)


class StorageProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageProvider
        fields = ["id", "code", "name", "provider_type", "is_default", "settings"]
        read_only_fields = ["id"]


class MediaFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaFolder
        fields = ["id", "business", "name", "folder_type", "path", "description"]
        read_only_fields = ["id"]


class MediaSerializer(serializers.ModelSerializer):
    public_url = serializers.SerializerMethodField()
    private_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            "id",
            "tenant",
            "business",
            "uploaded_by",
            "folder",
            "media_type",
            "original_filename",
            "storage_filename",
            "display_name",
            "file_extension",
            "mime_type",
            "file_size",
            "width",
            "height",
            "duration",
            "storage_provider",
            "storage_path",
            "checksum",
            "visibility",
            "tags",
            "metadata",
            "public_url",
            "private_url",
            "thumbnail_url",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "business",
            "uploaded_by",
            "folder",
            "media_type",
            "original_filename",
            "storage_filename",
            "file_extension",
            "mime_type",
            "file_size",
            "width",
            "height",
            "duration",
            "storage_provider",
            "storage_path",
            "checksum",
            "metadata",
            "public_url",
            "private_url",
            "thumbnail_url",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def get_public_url(self, media: Media) -> str:
        return f"/api/v1/media/{media.id}/file"

    def get_private_url(self, media: Media) -> str:
        return f"/api/v1/media/{media.id}/file"

    def get_thumbnail_url(self, media: Media) -> str:
        if media.metadata.get("thumbnail_path"):
            return f"/api/v1/media/{media.id}/file?variant=thumb"
        return f"/api/v1/media/{media.id}/file"


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    business = serializers.UUIDField(required=False)
    folder = serializers.UUIDField(required=False)
    folder_type = serializers.ChoiceField(
        choices=MediaFolderType.choices,
        required=False,
        default=MediaFolderType.BUSINESS,
    )
    visibility = serializers.ChoiceField(
        choices=MediaVisibility.choices,
        required=False,
        default=MediaVisibility.PRIVATE,
    )
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=80),
        required=False,
        default=list,
    )
    metadata = serializers.JSONField(required=False, default=dict)


class MediaUploadMultipleSerializer(serializers.Serializer):
    files = serializers.ListField(child=serializers.FileField(), allow_empty=False)
    business = serializers.UUIDField(required=False)
    folder = serializers.UUIDField(required=False)
    folder_type = serializers.ChoiceField(
        choices=MediaFolderType.choices,
        required=False,
        default=MediaFolderType.BUSINESS,
    )
    visibility = serializers.ChoiceField(
        choices=MediaVisibility.choices,
        required=False,
        default=MediaVisibility.PRIVATE,
    )
    tags = serializers.ListField(
        child=serializers.CharField(max_length=80),
        required=False,
        default=list,
    )
