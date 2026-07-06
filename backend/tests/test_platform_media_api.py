from __future__ import annotations

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.platform_media.models import Media


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="media-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


def authenticate(api_client: APIClient, user: User) -> str:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


def create_tenant(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("tenant-list-create"),
        {"slug": "media-tenant", "display_name": "Media Tenant"},
        format="json",
    )
    return response.json()["data"]["id"]


def create_business(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "media-business",
            "business_name": "Media Business Pvt Ltd",
            "display_name": "Media Business",
        },
        format="json",
    )
    return response.json()["data"]["id"]


@pytest.mark.django_db
def test_media_upload_duplicate_patch_and_delete(
    api_client: APIClient,
    user: User,
    tmp_path: object,
) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_id = create_business(api_client)
    upload_file = SimpleUploadedFile(
        "Terms Document.txt",
        b"hello media",
        content_type="text/plain",
    )

    with override_settings(PLATFORM_MEDIA_LOCAL_ROOT=tmp_path):
        upload_response = api_client.post(
            reverse("media-upload"),
            {
                "file": upload_file,
                "business": business_id,
                "folder_type": "documents",
                "visibility": "private",
                "tags": ["docs"],
            },
            format="multipart",
        )
        duplicate_response = api_client.post(
            reverse("media-upload"),
            {
                "file": SimpleUploadedFile(
                    "Terms Document.txt",
                    b"hello media",
                    content_type="text/plain",
                ),
                "business": business_id,
                "folder_type": "documents",
            },
            format="multipart",
        )

    assert upload_response.status_code == 201
    assert duplicate_response.status_code == 200
    media_id = upload_response.json()["data"]["id"]
    assert duplicate_response.json()["meta"]["duplicate"] is True
    assert Media.objects.filter(id=media_id, tenant_id=tenant_id).exists()

    list_response = api_client.get(reverse("media-list"), {"business": business_id})
    patch_response = api_client.patch(
        reverse("media-detail", kwargs={"media_id": media_id}),
        {"display_name": "Terms", "visibility": "public"},
        format="json",
    )
    delete_response = api_client.delete(reverse("media-detail", kwargs={"media_id": media_id}))

    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1
    assert patch_response.status_code == 200
    assert patch_response.json()["data"]["display_name"] == "Terms"
    assert delete_response.status_code == 204
    assert not Media.objects.filter(id=media_id).exists()
    assert Media.all_objects.filter(id=media_id, deleted_at__isnull=False).exists()
