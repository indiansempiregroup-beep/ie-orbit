from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.api.responses import success_response
from apps.common.services import places as places_service


class PlacesAutocompleteSerializer(serializers.Serializer):
    input = serializers.CharField(min_length=3, max_length=200)
    session_token = serializers.CharField(min_length=8, max_length=128)
    latitude = serializers.FloatField(required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, min_value=-180, max_value=180)
    country_code = serializers.CharField(required=False, min_length=2, max_length=2, default="IN")
    language_code = serializers.CharField(required=False, min_length=2, max_length=10, default="en")

    def validate(self, attrs):
        has_lat = "latitude" in attrs
        has_lng = "longitude" in attrs
        if has_lat != has_lng:
            raise serializers.ValidationError("Latitude and longitude must be supplied together.")
        return attrs


class PlacesDetailsQuerySerializer(serializers.Serializer):
    place_id = serializers.CharField(min_length=3, max_length=256)
    session_token = serializers.CharField(min_length=8, max_length=128)
    language_code = serializers.CharField(required=False, min_length=2, max_length=10, default="en")


class ReverseGeocodeQuerySerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    language_code = serializers.CharField(required=False, min_length=2, max_length=10, default="en")


class PlacesAutocompleteView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "places"
    serializer_class = PlacesAutocompleteSerializer

    @extend_schema(request=PlacesAutocompleteSerializer)
    def post(self, request: Request) -> Response:
        serializer = PlacesAutocompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        predictions = places_service.autocomplete(
            input_text=serializer.validated_data["input"],
            session_token=serializer.validated_data["session_token"],
            latitude=serializer.validated_data.get("latitude"),
            longitude=serializer.validated_data.get("longitude"),
            country_code=serializer.validated_data["country_code"],
            language_code=serializer.validated_data["language_code"],
        )
        return success_response(
            {"predictions": predictions},
            request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
        )


class PlacesDetailsView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "places"
    serializer_class = PlacesDetailsQuerySerializer

    @extend_schema(parameters=[])
    def get(self, request: Request) -> Response:
        serializer = PlacesDetailsQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        place = places_service.place_details(
            place_id=serializer.validated_data["place_id"],
            session_token=serializer.validated_data["session_token"],
            language_code=serializer.validated_data["language_code"],
        )
        return success_response(
            place,
            request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
        )


class ReverseGeocodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "places"
    serializer_class = ReverseGeocodeQuerySerializer

    @extend_schema(parameters=[])
    def get(self, request: Request) -> Response:
        serializer = ReverseGeocodeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        place = places_service.reverse_geocode(**serializer.validated_data)
        return success_response(
            place,
            request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
        )
