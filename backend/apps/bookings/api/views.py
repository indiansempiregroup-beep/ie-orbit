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
    StaffLeaveSerializer,
    StaffSpecialAvailabilitySerializer,
    StaffWeeklyScheduleBulkSerializer,
    StaffWeeklyScheduleSerializer,
)
from apps.bookings.models import (
    Booking,
    BookingStatus,
    StaffLeave,
    StaffSpecialAvailability,
    StaffWeeklySchedule,
)
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
            OpenApiParameter(
                "service_id",
                str,
                description="Optional service UUID. When staff is not selected, only staff assigned to this service are considered.",
            ),
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
        slots = self.service.available_slots(
            tenant=request.current_tenant,
            business=business,
            staff_id=serializer.validated_data.get("staff_id"),
            service_id=serializer.validated_data.get("service_id"),
            target_date=serializer.validated_data["date"],
            duration_minutes=serializer.validated_data["duration_minutes"],
            interval_minutes=serializer.validated_data["interval_minutes"],
            buffer_minutes=serializer.validated_data.get("buffer_minutes"),
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


class StaffWeeklyScheduleListCreateView(APIView):
    permission_classes = [BookingAccessPermission]

    @extend_schema(
        tags=["Bookings"],
        parameters=[
            OpenApiParameter("staff_id", str, required=True, description="Staff UUID."),
            OpenApiParameter("business", str, description="Business UUID."),
        ],
        responses={200: StaffWeeklyScheduleSerializer(many=True)},
        description="List weekly availability schedules for a staff member.",
    )
    def get(self, request: Request) -> Response:
        staff_id = request.query_params.get("staff_id")
        if not staff_id:
            raise ValidationError({"staff_id": "This query parameter is required."})
        business = AvailabilityView()._business(request, request.query_params.get("business"))
        rows = (
            StaffWeeklySchedule.objects.for_tenant(request.current_tenant)
            .filter(business=business, staff_id=staff_id)
            .order_by("weekday")
        )
        return success_response(
            StaffWeeklyScheduleSerializer(rows, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Bookings"],
        request=StaffWeeklyScheduleSerializer,
        responses={201: StaffWeeklyScheduleSerializer},
        description="Create or update a weekly availability row for a staff member.",
    )
    def post(self, request: Request) -> Response:
        serializer = StaffWeeklyScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = AvailabilityView()._business(request, serializer.validated_data.get("business"))
        defaults = {
            key: serializer.validated_data[key]
            for key in (
                "is_available",
                "shift_start",
                "shift_end",
                "break_periods",
                "capacity",
                "overtime_allowed",
            )
            if key in serializer.validated_data
        }
        row, _ = StaffWeeklySchedule.objects.update_or_create(
            tenant=request.current_tenant,
            business=business,
            staff_id=serializer.validated_data["staff_id"],
            weekday=serializer.validated_data["weekday"],
            defaults=defaults,
        )
        return success_response(
            StaffWeeklyScheduleSerializer(row).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class StaffWeeklyScheduleBulkView(APIView):
    permission_classes = [BookingAccessPermission]

    @extend_schema(
        tags=["Bookings"],
        request=StaffWeeklyScheduleBulkSerializer,
        responses={200: StaffWeeklyScheduleSerializer(many=True)},
        description="Bulk upsert weekly availability schedules for a staff member.",
    )
    def put(self, request: Request) -> Response:
        serializer = StaffWeeklyScheduleBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = AvailabilityView()._business(request, serializer.validated_data.get("business"))
        staff_id = serializer.validated_data["staff_id"]
        saved: list[StaffWeeklySchedule] = []
        for entry in serializer.validated_data["schedules"]:
            row, _ = StaffWeeklySchedule.objects.update_or_create(
                tenant=request.current_tenant,
                business=business,
                staff_id=staff_id,
                weekday=entry["weekday"],
                defaults={
                    "is_available": entry.get("is_available", True),
                    "shift_start": entry["shift_start"],
                    "shift_end": entry["shift_end"],
                    "capacity": entry.get("capacity", 1),
                    "break_periods": entry.get("break_periods", []),
                    "overtime_allowed": entry.get("overtime_allowed", False),
                },
            )
            saved.append(row)
        saved.sort(key=lambda row: row.weekday)
        return success_response(
            StaffWeeklyScheduleSerializer(saved, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class StaffLeaveListCreateView(APIView):
    permission_classes = [BookingAccessPermission]

    @extend_schema(
        tags=["Staff Leave"],
        parameters=[
            OpenApiParameter("staff_id", str, required=True, description="Staff UUID."),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("date_from", str, description="Filter leaves ending on/after this date."),
            OpenApiParameter("date_to", str, description="Filter leaves starting on/before this date."),
        ],
        responses={200: StaffLeaveSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        staff_id = request.query_params.get("staff_id")
        if not staff_id:
            raise ValidationError({"staff_id": "This query parameter is required."})
        business = AvailabilityView()._business(request, request.query_params.get("business"))
        rows = StaffLeave.objects.for_tenant(request.current_tenant).filter(
            business=business, staff_id=staff_id
        )
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            rows = rows.filter(ends_at__date__gte=date_from)
        if date_to:
            rows = rows.filter(starts_at__date__lte=date_to)
        return success_response(
            StaffLeaveSerializer(rows.order_by("-starts_at"), many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Leave"],
        request=StaffLeaveSerializer,
        responses={201: StaffLeaveSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = StaffLeaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = AvailabilityView()._business(request, serializer.validated_data.get("business"))
        row = StaffLeave.objects.create(
            tenant=request.current_tenant,
            business=business,
            staff_id=serializer.validated_data["staff_id"],
            starts_at=serializer.validated_data["starts_at"],
            ends_at=serializer.validated_data["ends_at"],
            leave_type=serializer.validated_data.get("leave_type", "leave"),
            reason=serializer.validated_data.get("reason", ""),
            approved=serializer.validated_data.get("approved", True),
        )
        return success_response(
            StaffLeaveSerializer(row).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class StaffLeaveDetailView(APIView):
    permission_classes = [BookingAccessPermission]

    def _get(self, request: Request, leave_id: str) -> StaffLeave:
        return get_object_or_404(
            StaffLeave.objects.for_tenant(request.current_tenant), id=leave_id
        )

    @extend_schema(tags=["Staff Leave"], responses={200: StaffLeaveSerializer})
    def get(self, request: Request, leave_id: str) -> Response:
        row = self._get(request, leave_id)
        return success_response(
            StaffLeaveSerializer(row).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Leave"], request=StaffLeaveSerializer, responses={200: StaffLeaveSerializer}
    )
    def patch(self, request: Request, leave_id: str) -> Response:
        row = self._get(request, leave_id)
        serializer = StaffLeaveSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            if field == "business":
                continue
            setattr(row, field, value)
        row.save()
        return success_response(
            StaffLeaveSerializer(row).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Staff Leave"], responses={204: OpenApiResponse(description="Deleted")})
    def delete(self, request: Request, leave_id: str) -> Response:
        row = self._get(request, leave_id)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffSpecialAvailabilityListCreateView(APIView):
    permission_classes = [BookingAccessPermission]

    @extend_schema(
        tags=["Staff Special Availability"],
        parameters=[
            OpenApiParameter("staff_id", str, required=True, description="Staff UUID."),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("date_from", str, description="Filter windows ending on/after date."),
            OpenApiParameter("date_to", str, description="Filter windows starting on/before date."),
        ],
        responses={200: StaffSpecialAvailabilitySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        staff_id = request.query_params.get("staff_id")
        if not staff_id:
            raise ValidationError({"staff_id": "This query parameter is required."})
        business = AvailabilityView()._business(request, request.query_params.get("business"))
        rows = StaffSpecialAvailability.objects.for_tenant(request.current_tenant).filter(
            business=business, staff_id=staff_id
        )
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            rows = rows.filter(ends_at__date__gte=date_from)
        if date_to:
            rows = rows.filter(starts_at__date__lte=date_to)
        return success_response(
            StaffSpecialAvailabilitySerializer(rows.order_by("-starts_at"), many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Special Availability"],
        request=StaffSpecialAvailabilitySerializer,
        responses={201: StaffSpecialAvailabilitySerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = StaffSpecialAvailabilitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = AvailabilityView()._business(request, serializer.validated_data.get("business"))
        row = StaffSpecialAvailability.objects.create(
            tenant=request.current_tenant,
            business=business,
            staff_id=serializer.validated_data["staff_id"],
            starts_at=serializer.validated_data["starts_at"],
            ends_at=serializer.validated_data["ends_at"],
            capacity=serializer.validated_data.get("capacity", 1),
            reason=serializer.validated_data.get("reason", ""),
        )
        return success_response(
            StaffSpecialAvailabilitySerializer(row).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class StaffSpecialAvailabilityDetailView(APIView):
    permission_classes = [BookingAccessPermission]

    def _get(self, request: Request, special_id: str) -> StaffSpecialAvailability:
        return get_object_or_404(
            StaffSpecialAvailability.objects.for_tenant(request.current_tenant), id=special_id
        )

    @extend_schema(
        tags=["Staff Special Availability"], responses={200: StaffSpecialAvailabilitySerializer}
    )
    def get(self, request: Request, special_id: str) -> Response:
        row = self._get(request, special_id)
        return success_response(
            StaffSpecialAvailabilitySerializer(row).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Special Availability"],
        request=StaffSpecialAvailabilitySerializer,
        responses={200: StaffSpecialAvailabilitySerializer},
    )
    def patch(self, request: Request, special_id: str) -> Response:
        row = self._get(request, special_id)
        serializer = StaffSpecialAvailabilitySerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            if field == "business":
                continue
            setattr(row, field, value)
        row.save()
        return success_response(
            StaffSpecialAvailabilitySerializer(row).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Special Availability"],
        responses={204: OpenApiResponse(description="Deleted")},
    )
    def delete(self, request: Request, special_id: str) -> Response:
        row = self._get(request, special_id)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
