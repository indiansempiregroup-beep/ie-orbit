from __future__ import annotations

from io import BytesIO

from django.db import connection
from django.http import FileResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.platform_media.api.permissions import MediaAccessPermission
from apps.platform_media.api.serializers import (
    MediaSerializer,
    MediaUploadMultipleSerializer,
    MediaUploadSerializer,
)
from apps.platform_media.models import Media, MediaFolder, MediaVisibility
from apps.platform_media.repositories import MediaRepository
from apps.platform_media.services import MediaService
from apps.platform_media.storage import get_storage_provider


class MediaListView(APIView):
    permission_classes = [MediaAccessPermission]
    serializer_class = MediaSerializer

    @extend_schema(
        tags=["Media"],
        parameters=[
            OpenApiParameter("business", str, description="Filter by business UUID."),
            OpenApiParameter("folder", str, description="Filter by folder UUID."),
            OpenApiParameter("media_type", str, description="Filter by media type."),
            OpenApiParameter("visibility", str, description="Filter by visibility."),
            OpenApiParameter("tags", str, description="Comma-separated tag filter."),
        ],
        responses={200: MediaSerializer(many=True)},
        description="List media for the current tenant.",
    )
    def get(self, request: Request) -> Response:
        queryset = MediaRepository().list_for_request(
            tenant=request.current_tenant,
            user=request.user,
        )
        queryset = self._filter_queryset(queryset, request)
        return success_response(
            MediaSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    def _filter_queryset(self, queryset: object, request: Request) -> object:
        if request.query_params.get("business"):
            queryset = queryset.filter(business_id=request.query_params["business"])
        if request.query_params.get("folder"):
            queryset = queryset.filter(folder_id=request.query_params["folder"])
        if request.query_params.get("media_type"):
            queryset = queryset.filter(media_type=request.query_params["media_type"])
        if request.query_params.get("visibility"):
            queryset = queryset.filter(visibility=request.query_params["visibility"])
        tags = request.query_params.get("tags")
        if tags:
            tag_values = [item.strip().lower() for item in tags.split(",") if item.strip()]
            if connection.features.supports_json_field_contains:
                for tag in tag_values:
                    queryset = queryset.filter(tags__contains=[tag])
            else:
                matching_ids = [
                    media.id for media in queryset if all(tag in media.tags for tag in tag_values)
                ]
                queryset = Media.objects.filter(id__in=matching_ids)
        return queryset


class MediaUploadView(APIView):
    permission_classes = [MediaAccessPermission]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = MediaUploadSerializer
    service = MediaService()

    @extend_schema(
        tags=["Media"],
        request=MediaUploadSerializer,
        responses={201: MediaSerializer},
        description="Upload a single media file.",
    )
    def post(self, request: Request) -> Response:
        serializer = MediaUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = self._business(request, serializer.validated_data.get("business"))
        folder = self._folder(request, serializer.validated_data.get("folder"))
        result = self.service.upload(
            uploaded_file=serializer.validated_data["file"],
            tenant=request.current_tenant,
            business=business,
            uploaded_by=request.user,
            folder=folder,
            folder_type=serializer.validated_data["folder_type"],
            visibility=serializer.validated_data["visibility"],
            tags=serializer.validated_data["tags"],
            display_name=serializer.validated_data.get("display_name", ""),
            metadata=serializer.validated_data["metadata"],
        )
        return success_response(
            MediaSerializer(result.media).data,
            status_code=status.HTTP_200_OK if result.duplicate else status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
            meta={"duplicate": result.duplicate},
        )

    def _business(self, request: Request, business_id: object | None) -> Business | None:
        if business_id:
            return get_object_or_404(
                Business.objects.require_tenant(request.current_tenant),
                id=business_id,
            )
        return getattr(request, "current_business", None)

    def _folder(self, request: Request, folder_id: object | None) -> MediaFolder | None:
        if not folder_id:
            return None
        return get_object_or_404(
            MediaFolder.objects.require_tenant(request.current_tenant),
            id=folder_id,
        )


class MediaUploadMultipleView(MediaUploadView):
    serializer_class = MediaUploadMultipleSerializer

    @extend_schema(
        tags=["Media"],
        request=MediaUploadMultipleSerializer,
        responses={201: MediaSerializer(many=True)},
        description="Upload multiple media files.",
    )
    def post(self, request: Request) -> Response:
        data = request.data.copy()
        data.setlist("files", request.FILES.getlist("files"))
        serializer = MediaUploadMultipleSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        business = self._business(request, serializer.validated_data.get("business"))
        folder = self._folder(request, serializer.validated_data.get("folder"))
        results = self.service.upload_multiple(
            files=serializer.validated_data["files"],
            tenant=request.current_tenant,
            business=business,
            uploaded_by=request.user,
            folder=folder,
            folder_type=serializer.validated_data["folder_type"],
            visibility=serializer.validated_data["visibility"],
            tags=serializer.validated_data["tags"],
        )
        return success_response(
            MediaSerializer([result.media for result in results], many=True).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
            meta={"duplicates": [result.duplicate for result in results]},
        )


class MediaDetailView(APIView):
    permission_classes = [MediaAccessPermission]
    parser_classes = [JSONParser]
    serializer_class = MediaSerializer
    repository = MediaRepository()
    service = MediaService(repository=repository)

    @extend_schema(
        tags=["Media"],
        responses={200: MediaSerializer},
        description="Retrieve a media record by UUID.",
    )
    def get(self, request: Request, media_id: str) -> Response:
        media = self._get_media(request, media_id)
        return success_response(
            MediaSerializer(media).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Media"],
        request=MediaSerializer,
        responses={200: MediaSerializer},
        description="Partially update mutable media metadata.",
    )
    def patch(self, request: Request, media_id: str) -> Response:
        media = self._get_media(request, media_id)
        serializer = MediaSerializer(media, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        media = self.service.update_media(
            media=media,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            MediaSerializer(media).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Media"],
        responses={204: OpenApiResponse(description="Media deleted.")},
        description="Delete media. Only tenant owners or platform admins may delete.",
    )
    def delete(self, request: Request, media_id: str) -> Response:
        media = self._get_media(request, media_id)
        self.service.delete_media(media=media, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_media(self, request: Request, media_id: str) -> Media:
        try:
            media = self.repository.get_for_request(
                media_id=media_id,
                tenant=request.current_tenant,
                user=request.user,
            )
        except Media.DoesNotExist as exc:
            raise NotFound("Media was not found.") from exc
        self.check_object_permissions(request, media)
        return media


class MediaFileView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Media"],
        parameters=[
            OpenApiParameter(
                "variant",
                str,
                description="Optional image variant: thumb or display.",
            ),
        ],
        responses={
            200: OpenApiResponse(description="Local file bytes."),
            302: OpenApiResponse(description="Redirect to a signed object-storage URL."),
        },
        description="Deliver a media file. Public files are anonymous; private files need auth.",
    )
    def get(self, request: Request, media_id: str) -> Response:
        media = get_object_or_404(Media.objects.all(), id=media_id)
        if media.visibility == MediaVisibility.PRIVATE:
            if not request.user or not request.user.is_authenticated:
                raise NotAuthenticated()
            tenant = getattr(request, "current_tenant", None)
            if tenant is None:
                raise PermissionDenied("Private media requires tenant context.")
            try:
                MediaRepository().get_for_request(
                    media_id=str(media.id),
                    tenant=tenant,
                    user=request.user,
                )
            except Media.DoesNotExist as exc:
                raise PermissionDenied("You do not have access to this media.") from exc

        variant = (request.query_params.get("variant") or "").strip().lower()
        storage_path = media.storage_path
        content_type = media.mime_type
        if variant == "thumb" and media.metadata.get("thumbnail_path"):
            storage_path = str(media.metadata["thumbnail_path"])
            content_type = "image/webp"
        elif variant == "display" and media.metadata.get("display_path"):
            storage_path = str(media.metadata["display_path"])
            content_type = "image/webp"

        provider = get_storage_provider(media.storage_provider)
        if getattr(provider, "code", media.storage_provider) in {"s3", "r2"}:
            if media.visibility == MediaVisibility.PUBLIC:
                return HttpResponseRedirect(provider.public_url(path=storage_path))
            return HttpResponseRedirect(provider.private_url(path=storage_path))

        try:
            payload = BytesIO(provider.read_bytes(path=storage_path))
        except FileNotFoundError as exc:
            raise NotFound("Media file was not found.") from exc
        response = FileResponse(payload, content_type=content_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{media.original_filename}"'
        return response
