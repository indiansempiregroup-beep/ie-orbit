from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError

AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
DETAILS_URL = "https://places.googleapis.com/v1/places"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_DETAILS_FIELDS = "id,displayName,formattedAddress,location,addressComponents"


class PlacesUnavailable(APIException):
    status_code = 503
    default_code = "places_unavailable"
    default_detail = "Address search is not configured."


def _api_key() -> str:
    return str(getattr(settings, "GOOGLE_PLACES_API_KEY", "") or "").strip()


def _require_key() -> str:
    key = _api_key()
    if not key:
        raise PlacesUnavailable("Address search is not configured on the server.")
    return key


def _request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "ie-platform-places/1.0",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        raise PlacesUnavailable("Unable to reach Google Places right now.") from exc
    if not isinstance(payload, dict):
        raise PlacesUnavailable("Google Places returned an unexpected response.")
    return payload


def _legacy_google_error(payload: dict[str, Any]) -> str | None:
    status = str(payload.get("status") or "")
    if status in {"", "OK", "ZERO_RESULTS"}:
        return None
    message = str(payload.get("error_message") or "").strip()
    return message or f"Places lookup failed ({status})."


def _places_headers(*, field_mask: str | None = None) -> dict[str, str]:
    headers = {"X-Goog-Api-Key": _require_key()}
    if field_mask:
        headers["X-Goog-FieldMask"] = field_mask
    return headers


def autocomplete(
    *,
    input_text: str,
    session_token: str,
    latitude: float | None = None,
    longitude: float | None = None,
    country_code: str = "IN",
    language_code: str = "en",
) -> list[dict[str, Any]]:
    term = input_text.strip()
    if len(term) < 3:
        raise ValidationError({"input": "Type at least 3 characters to search."})
    token = session_token.strip()
    if not token:
        raise ValidationError({"session_token": "A session token is required."})

    body: dict[str, Any] = {
        "input": term,
        "sessionToken": token,
        "includeQueryPredictions": False,
        "regionCode": (country_code or "IN").upper(),
        "languageCode": language_code or "en",
    }
    if latitude is not None and longitude is not None:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": latitude, "longitude": longitude},
                "radius": 50000.0,
            }
        }
    payload = _request_json(
        AUTOCOMPLETE_URL,
        method="POST",
        payload=body,
        headers=_places_headers(),
    )

    predictions: list[dict[str, Any]] = []
    for item in payload.get("suggestions") or []:
        prediction = item.get("placePrediction") if isinstance(item, dict) else None
        if not isinstance(prediction, dict):
            continue
        text = prediction.get("text") if isinstance(prediction.get("text"), dict) else {}
        structured = (
            prediction.get("structuredFormat")
            if isinstance(prediction.get("structuredFormat"), dict)
            else {}
        )
        main = (
            structured.get("mainText")
            if isinstance(structured.get("mainText"), dict)
            else {}
        )
        secondary = (
            structured.get("secondaryText")
            if isinstance(structured.get("secondaryText"), dict)
            else {}
        )
        place_id = str(prediction.get("placeId") or "").strip()
        description = str(text.get("text") or "").strip()
        if place_id and description:
            predictions.append(
                {
                    "place_id": place_id,
                    "description": description,
                    "main_text": str(main.get("text") or description).strip(),
                    "secondary_text": str(secondary.get("text") or "").strip(),
                    "types": prediction.get("types") or [],
                }
            )
    return predictions


def _component(components: list[dict[str, Any]] | None, type_name: str) -> str:
    for item in components or []:
        types = item.get("types") or []
        if type_name in types:
            return str(item.get("longText") or item.get("long_name") or "")
    return ""


def _first_component(components: list[dict[str, Any]], *type_names: str) -> str:
    return next(
        (value for type_name in type_names if (value := _component(components, type_name))),
        "",
    )


def _normalized_place(
    *,
    formatted: str,
    components: list[dict[str, Any]],
    latitude: Any,
    longitude: Any,
    display_name: str = "",
) -> dict[str, Any]:
    street_number = _component(components, "street_number")
    route = _component(components, "route")
    street = " ".join(part for part in (street_number, route) if part)
    premise = _first_component(components, "premise", "subpremise")
    # A lone house number is not useful to a driver; keep Google's full address
    # unless we have an actual street/premise label.
    line1 = street if route else premise or formatted
    city = _first_component(
        components,
        "locality",
        "postal_town",
        "administrative_area_level_3",
        "administrative_area_level_2",
        "sublocality",
    )
    return {
        "formatted_address": formatted,
        "line1": line1,
        "display_name": display_name or None,
        "city": city or None,
        "state": _component(components, "administrative_area_level_1") or None,
        "country": _component(components, "country") or None,
        "postal_code": _component(components, "postal_code") or None,
        "latitude": latitude,
        "longitude": longitude,
    }


def place_details(
    *,
    place_id: str,
    session_token: str,
    language_code: str = "en",
) -> dict[str, Any]:
    pid = place_id.strip()
    if not pid:
        raise ValidationError({"place_id": "Place id is required."})
    token = session_token.strip()
    if not token:
        raise ValidationError({"session_token": "A session token is required."})

    query = urllib.parse.urlencode(
        {"sessionToken": token, "languageCode": language_code or "en"}
    )
    result = _request_json(
        f"{DETAILS_URL}/{urllib.parse.quote(pid, safe='')}?{query}",
        headers=_places_headers(field_mask=_DETAILS_FIELDS),
    )
    components = result.get("addressComponents")
    if not isinstance(components, list):
        components = []
    location = result.get("location") if isinstance(result.get("location"), dict) else {}
    display = (
        result.get("displayName") if isinstance(result.get("displayName"), dict) else {}
    )
    return _normalized_place(
        formatted=str(result.get("formattedAddress") or "").strip(),
        components=components,
        latitude=location.get("latitude"),
        longitude=location.get("longitude"),
        display_name=str(display.get("text") or "").strip(),
    )


def reverse_geocode(
    *,
    latitude: float,
    longitude: float,
    language_code: str = "en",
) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "latlng": f"{latitude},{longitude}",
            "language": language_code or "en",
            "key": _require_key(),
        }
    )
    payload = _request_json(f"{GEOCODE_URL}?{query}")
    error = _legacy_google_error(payload)
    if error:
        raise PlacesUnavailable(error)
    results = payload.get("results")
    result = results[0] if isinstance(results, list) and results else {}
    if not isinstance(result, dict):
        raise PlacesUnavailable("No address was found for this map location.")
    components = result.get("address_components")
    if not isinstance(components, list):
        components = []
    geometry = result.get("geometry") if isinstance(result.get("geometry"), dict) else {}
    location = geometry.get("location") if isinstance(geometry.get("location"), dict) else {}
    return _normalized_place(
        formatted=str(result.get("formatted_address") or "").strip(),
        components=components,
        latitude=location.get("lat", latitude),
        longitude=location.get("lng", longitude),
    )
