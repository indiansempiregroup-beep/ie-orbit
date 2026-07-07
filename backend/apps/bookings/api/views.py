from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.api.permissions import BookingAccessPermission
from apps.bookings.api.serializers import (
    AvailabilityQuerySerializer,
    AvailabilitySlotSerializer,
    BookingActionSerializer,
    BookingCreateSerializer,
    BookingPatchSerializer,
    BookingRescheduleSerializer,
    BookingSerializer,
)
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.repositories import BookingRepository
from apps.bookings.services import AvailabilityService, BookingService
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response


class BookingListCreateView(APIView):
    permission_classes = [BookingAccessPermission]
    repository = BookingRepository()
    service = BookingService(repository=repository)

    @extend_schema(
        tags=["Bookings"],
        parameters=[
            OpenApiParameter("business", str, description="Filter by business UUID."),
            OpenApiParameter("customer", str, description="Filter by customer UUID."),
            OpenApiParameter("staff", str, description="Filter by staff UUID."),
            OpenApiParameter("service", str, description="Filter by service UUID."),
            OpenApiParameter("booking_id", str, description="Search by booking number."),
            OpenApiParameter("status", str, description="Filter by booking status."),
            OpenApiParameter("date", str, description="Filter by appointment date."),
            OpenApiParameter("date_from", str, description="Filter from appointment date."),
            OpenApiParameter("date_to", str, description="Filter to appointment date."),
        ],
        responses={200: BookingSerializer(many=True)},
        description="List bookings for the current tenant.",
    )
    def get(self, request: Request) -> Response:
        bookings = self.repository.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
        )
        return paginated_list_response(
            request,
            bookings,
            BookingSerializer,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Bookings"],
        request=BookingCreateSerializer,
        responses={201: BookingSerializer},
        description="Create a booking transactionally after availability validation.",
    )
    def post(self, request: Request) -> Response:
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = self._business(request, serializer.validated_data.get("business"))
        try:
            booking = self.service.create_booking(
                tenant=request.current_tenant,
                business=business,
                data=dict(serializer.validated_data),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages if hasattr(exc, "messages") else str(exc)) from exc
        return success_response(
            BookingSerializer(booking).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    def _business(self, request: Request, business_id: object | None) -> Business:
        if business_id:
            return get_object_or_404(
                Business.objects.require_tenant(request.current_tenant), id=business_id
            )
        business = (
            Business.objects.require_tenant(request.current_tenant).order_by("created_at").first()
        )
        if not business:
            raise NotFound("No business exists for the current tenant.")
        return business


class BookingDetailView(APIView):
    permission_classes = [BookingAccessPermission]
    repository = BookingRepository()
    service = BookingService(repository=repository)

    @extend_schema(tags=["Bookings"], responses={200: BookingSerializer})
    def get(self, request: Request, booking_id: str) -> Response:
        booking = self._booking(request, booking_id)
        return success_response(
            BookingSerializer(booking).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Bookings"], request=BookingPatchSerializer, responses={200: BookingSerializer}
    )
    def patch(self, request: Request, booking_id: str) -> Response:
        booking = self._booking(request, booking_id)
        serializer = BookingPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking = self.service.update_booking(
                booking=booking,
                data=dict(serializer.validated_data),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages if hasattr(exc, "messages") else str(exc)) from exc
        return success_response(
            BookingSerializer(booking).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Bookings"],
        responses={204: OpenApiResponse(description="Booking soft deleted.")},
    )
    def delete(self, request: Request, booking_id: str) -> Response:
        booking = self._booking(request, booking_id)
        self.service.delete_booking(booking=booking, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _booking(self, request: Request, booking_id: str) -> Booking:
        try:
            booking = self.repository.get_for_request(
                booking_id=booking_id,
                tenant=request.current_tenant,
                user=request.user,
            )
        except Booking.DoesNotExist as exc:
            raise NotFound("Booking was not found.") from exc
        self.check_object_permissions(request, booking)
        return booking


class BookingActionView(BookingDetailView):
    action_status: str = BookingStatus.CONFIRMED
    action_description = "Change booking status."

    @extend_schema(
        tags=["Bookings"],
        request=BookingActionSerializer,
        responses={200: BookingSerializer},
    )
    def post(self, request: Request, booking_id: str) -> Response:
        booking = self._booking(request, booking_id)
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking = self.service.transition(
                booking=booking,
                to_status=self.action_status,
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages if hasattr(exc, "messages") else str(exc)) from exc
        return success_response(
            BookingSerializer(booking).data,
            request_id=getattr(request, "request_id", None),
        )


class BookingConfirmView(BookingActionView):
    action_status = BookingStatus.CONFIRMED


class BookingCancelView(BookingActionView):
    action_status = BookingStatus.CANCELLED


class BookingCheckInView(BookingActionView):
    action_status = BookingStatus.CHECKED_IN


class BookingCompleteView(BookingActionView):
    action_status = BookingStatus.COMPLETED


class BookingRescheduleView(BookingDetailView):
    @extend_schema(
        tags=["Bookings"],
        request=BookingRescheduleSerializer,
        responses={200: BookingSerializer},
    )
    def post(self, request: Request, booking_id: str) -> Response:
        booking = self._booking(request, booking_id)
        serializer = BookingRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            booking = self.service.reschedule(
                booking=booking,
                start_at=serializer.validated_data["start_at"],
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages if hasattr(exc, "messages") else str(exc)) from exc
        return success_response(
            BookingSerializer(booking).data,
            request_id=getattr(request, "request_id", None),
        )


class AvailabilityView(APIView):
    permission_classes = [BookingAccessPermission]
    service = AvailabilityService()

    @extend_schema(
        tags=["Availability"],
        parameters=[
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("staff_id", str, description="Optional staff UUID."),
            OpenApiParameter("date", str, required=True, description="Target date."),
            OpenApiParameter("duration_minutes", int, description="Service duration."),
            OpenApiParameter("interval_minutes", int, description="Slot interval."),
            OpenApiParameter("buffer_minutes", int, description="Buffer around booking."),
        ],
        responses={200: AvailabilitySlotSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        serializer = AvailabilityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        business = self._business(request, serializer.validated_data.get("business"))
        if serializer.validated_data.get("staff_id"):
            slots = self.service.staff_slots(
                tenant=request.current_tenant,
                business=business,
                staff_id=serializer.validated_data["staff_id"],
                target_date=serializer.validated_data["date"],
                duration_minutes=serializer.validated_data["duration_minutes"],
                interval_minutes=serializer.validated_data["interval_minutes"],
                buffer_minutes=serializer.validated_data["buffer_minutes"],
            )
        else:
            slots = self.service.business_slots(
                tenant=request.current_tenant,
                business=business,
                target_date=serializer.validated_data["date"],
                duration_minutes=serializer.validated_data["duration_minutes"],
                interval_minutes=serializer.validated_data["interval_minutes"],
                buffer_minutes=serializer.validated_data["buffer_minutes"],
            )
        return success_response(
            [slot.as_dict() for slot in slots],
            request_id=getattr(request, "request_id", None),
        )

    def _business(self, request: Request, business_id: object | None) -> Business:
        if business_id:
            return get_object_or_404(
                Business.objects.require_tenant(request.current_tenant), id=business_id
            )
        business = (
            Business.objects.require_tenant(request.current_tenant).order_by("created_at").first()
        )
        if not business:
            raise NotFound("No business exists for the current tenant.")
        return business


class StaffAvailabilityView(AvailabilityView):
    pass


class BusinessAvailabilityView(AvailabilityView):
    pass
