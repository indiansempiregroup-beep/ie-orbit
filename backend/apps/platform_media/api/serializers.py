from __future__ import annotations

from rest_framework import serializers

from apps.platform_media.models import (
    Media,
    MediaFolder,
    MediaFolderType,
    MediaVisibility,
    StorageProvider,
    normalize_folder_type,
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
        default=MediaFolderType.BRANDING,
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
    # When true, crop (optional) then letterbox onto a 1200×1200 transparent PNG.
    prepare_product_canvas = serializers.BooleanField(required=False, default=False)
    # Package-gated rembg cutout (u2netp). Requires shopie_product_bg_remove or
    # appointie_service_bg_remove depending on folder_type.
    remove_background = serializers.BooleanField(required=False, default=False)
    crop_left = serializers.FloatField(required=False, min_value=0, max_value=1)
    crop_top = serializers.FloatField(required=False, min_value=0, max_value=1)
    crop_width = serializers.FloatField(required=False, min_value=0.01, max_value=1)
    crop_height = serializers.FloatField(required=False, min_value=0.01, max_value=1)

    def validate_folder_type(self, value: str) -> str:
        return normalize_folder_type(value)

    def validate(self, attrs: dict) -> dict:
        remove_bg = bool(attrs.get("remove_background"))
        crop_keys = ("crop_left", "crop_top", "crop_width", "crop_height")
        has_crop = any(key in attrs and attrs[key] is not None for key in crop_keys)
        if has_crop and not all(key in attrs and attrs[key] is not None for key in crop_keys):
            raise serializers.ValidationError(
                {"crop_left": "Provide crop_left, crop_top, crop_width, and crop_height together."}
            )
        if has_crop:
            left = float(attrs["crop_left"])
            top = float(attrs["crop_top"])
            width = float(attrs["crop_width"])
            height = float(attrs["crop_height"])
            if left + width > 1.0001 or top + height > 1.0001:
                raise serializers.ValidationError({"crop_width": "Crop box must stay within the image."})
        folder_type = normalize_folder_type(attrs.get("folder_type") or MediaFolderType.BRANDING)
        if remove_bg and folder_type not in {MediaFolderType.PRODUCTS, MediaFolderType.SERVICES}:
            raise serializers.ValidationError(
                {"remove_background": "Only supported for products or services folder types."}
            )
        return attrs


class MediaUploadMultipleSerializer(serializers.Serializer):
    files = serializers.ListField(child=serializers.FileField(), allow_empty=False)
    business = serializers.UUIDField(required=False)
    folder = serializers.UUIDField(required=False)
    folder_type = serializers.ChoiceField(
        choices=MediaFolderType.choices,
        required=False,
        default=MediaFolderType.BRANDING,
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

    def validate_folder_type(self, value: str) -> str:
        return normalize_folder_type(value)
