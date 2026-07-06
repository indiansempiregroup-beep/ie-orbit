from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, TenantModel
from apps.platform_media.validators import validate_tags
from apps.tenancy.managers import TenantAwareManager


class MediaType(models.TextChoices):
    IMAGE = "image", "Image"
    DOCUMENT = "document", "Document"
    PDF = "pdf", "PDF"
    VIDEO = "video", "Video"
    AUDIO = "audio", "Audio"
    OTHER = "other", "Other"


class MediaVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"


class MediaFolderType(models.TextChoices):
    BUSINESS = "business", "Business"
    STAFF = "staff", "Staff"
    CUSTOMERS = "customers", "Customers"
    SERVICES = "services", "Services"
    DOCUMENTS = "documents", "Documents"
    TEMP = "temp", "Temp"
    ARCHIVE = "archive", "Archive"


class StorageProviderType(models.TextChoices):
    LOCAL = "local", "Local Storage"
    S3 = "s3", "Amazon S3"
    GCS = "gcs", "Google Cloud Storage"
    AZURE = "azure", "Azure Blob Storage"
    CLOUDINARY = "cloudinary", "Cloudinary"


class StorageProvider(BaseModel):
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    provider_type = models.CharField(max_length=32, choices=StorageProviderType.choices)
    is_default = models.BooleanField(default=False)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "media_storage_providers"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class MediaFolder(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="media_folders",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    folder_type = models.CharField(
        max_length=32,
        choices=MediaFolderType.choices,
        default=MediaFolderType.BUSINESS,
        db_index=True,
    )
    path = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "media_folders"
        ordering = ["folder_type", "name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "path"], name="uq_media_folder_tenant_path")
        ]

    def __str__(self) -> str:
        return self.name


class Media(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="platform_media",
        null=True,
        blank=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_media",
        null=True,
        blank=True,
    )
    folder = models.ForeignKey(
        MediaFolder,
        on_delete=models.PROTECT,
        related_name="media",
        null=True,
        blank=True,
    )
    media_type = models.CharField(max_length=32, choices=MediaType.choices, db_index=True)
    original_filename = models.CharField(max_length=255)
    storage_filename = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    file_extension = models.CharField(max_length=16, db_index=True)
    mime_type = models.CharField(max_length=120, db_index=True)
    file_size = models.PositiveBigIntegerField()
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    storage_provider = models.CharField(
        max_length=32,
        choices=StorageProviderType.choices,
        default=StorageProviderType.LOCAL,
        db_index=True,
    )
    storage_path = models.CharField(max_length=512)
    checksum = models.CharField(max_length=128, db_index=True)
    visibility = models.CharField(
        max_length=16,
        choices=MediaVisibility.choices,
        default=MediaVisibility.PRIVATE,
        db_index=True,
    )
    tags = models.JSONField(default=list, blank=True, validators=[validate_tags])
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "media"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "media_type"]),
            models.Index(fields=["tenant", "folder", "visibility"]),
            models.Index(fields=["tenant", "checksum"]),
            models.Index(fields=["tenant", "mime_type"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "checksum", "storage_provider"],
                name="uq_media_tenant_checksum_provider",
            )
        ]

    def __str__(self) -> str:
        return self.display_name
