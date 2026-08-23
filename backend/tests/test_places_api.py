from __future__ import annotations

from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="places-user@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )


def authenticate(api_client: APIClient, user: User) -> None:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")


@pytest.mark.django_db
def test_places_autocomplete_validates_public_requests(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("places-autocomplete"),
        {"input": "ab", "session_token": "session-token-1"},
        format="json",
    )
    assert response.status_code == 422


@pytest.mark.django_db
def test_places_autocomplete_requires_server_key(
    api_client: APIClient, user: User, settings
) -> None:
    settings.GOOGLE_PLACES_API_KEY = ""
    authenticate(api_client, user)
    response = api_client.post(
        reverse("places-autocomplete"),
        {"input": "mumbai", "session_token": "session-token-1"},
        format="json",
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PLACES_UNAVAILABLE"


@pytest.mark.django_db
@patch("apps.common.services.places._request_json")
def test_places_autocomplete_and_details_use_session_token(
    mock_request, api_client: APIClient, user: User, settings
) -> None:
    settings.GOOGLE_PLACES_API_KEY = "test-server-key"
    authenticate(api_client, user)

    mock_request.return_value = {
        "suggestions": [
            {
                "placePrediction": {
                    "placeId": "ChIJplace",
                    "text": {"text": "Apollo Pharmacy, Mumbai, Maharashtra, India"},
                    "structuredFormat": {
                        "mainText": {"text": "Apollo Pharmacy"},
                        "secondaryText": {"text": "Mumbai, Maharashtra, India"},
                    },
                    "types": ["pharmacy", "establishment"],
                }
            }
        ],
    }
    autocomplete = api_client.post(
        reverse("places-autocomplete"),
        {
            "input": "apollo pharmacy",
            "session_token": "session-token-1",
            "latitude": 19.076,
            "longitude": 72.8777,
        },
        format="json",
    )
    assert autocomplete.status_code == 200
    prediction = autocomplete.json()["data"]["predictions"][0]
    assert prediction["place_id"] == "ChIJplace"
    assert prediction["main_text"] == "Apollo Pharmacy"
    request_body = mock_request.call_args.kwargs["payload"]
    assert request_body["sessionToken"] == "session-token-1"
    assert request_body["locationBias"]["circle"]["center"]["latitude"] == pytest.approx(19.076)
    assert mock_request.call_args.kwargs["headers"]["X-Goog-Api-Key"] == "test-server-key"

    mock_request.return_value = {
        "displayName": {"text": "Apollo Pharmacy"},
        "formattedAddress": "Mumbai, Maharashtra 400001, India",
        "location": {"latitude": 19.076, "longitude": 72.8777},
        "addressComponents": [
            {"longText": "Mumbai", "shortText": "Mumbai", "types": ["locality"]},
            {
                "longText": "Maharashtra",
                "shortText": "MH",
                "types": ["administrative_area_level_1"],
            },
            {"longText": "India", "shortText": "IN", "types": ["country"]},
            {"longText": "400001", "shortText": "400001", "types": ["postal_code"]},
        ],
    }
    details = api_client.get(
        reverse("places-details"),
        {"place_id": "ChIJplace", "session_token": "session-token-1"},
    )
    assert details.status_code == 200
    payload = details.json()["data"]
    assert payload["city"] == "Mumbai"
    assert payload["postal_code"] == "400001"
    assert payload["display_name"] == "Apollo Pharmacy"
    assert payload["latitude"] == pytest.approx(19.076)
    assert payload["longitude"] == pytest.approx(72.8777)
    assert "sessionToken=session-token-1" in mock_request.call_args.args[0]


@pytest.mark.django_db
@patch("apps.common.services.places._request_json")
def test_reverse_geocode_normalizes_address(
    mock_request, api_client: APIClient, user: User, settings
) -> None:
    settings.GOOGLE_PLACES_API_KEY = "test-server-key"
    authenticate(api_client, user)
    mock_request.return_value = {
        "status": "OK",
        "results": [
            {
                "formatted_address": "12 MG Road, Pune, Maharashtra 411001, India",
                "geometry": {"location": {"lat": 18.5204, "lng": 73.8567}},
                "address_components": [
                    {"long_name": "12", "types": ["street_number"]},
                    {"long_name": "MG Road", "types": ["route"]},
                    {"long_name": "Pune", "types": ["locality"]},
                    {"long_name": "Maharashtra", "types": ["administrative_area_level_1"]},
                    {"long_name": "India", "types": ["country"]},
                    {"long_name": "411001", "types": ["postal_code"]},
                ],
            }
        ],
    }
    response = api_client.get(
        reverse("places-reverse"),
        {"latitude": 18.5204, "longitude": 73.8567},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["line1"] == "12 MG Road"
    assert payload["city"] == "Pune"
    assert payload["postal_code"] == "411001"
