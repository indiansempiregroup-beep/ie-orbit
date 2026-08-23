from __future__ import annotations

import uuid
from datetime import timedelta

from django.utils import timezone

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.mobile_helpers import (
    ensure_customer_for_user,
    get_customer_booking,
    resolve_customers_for_user,
    serialize_mobile_customer_profile,
)
from apps.api.mobile_permissions import IsEmailVerified
from apps.api.mobile_serializers import (
    MobileAvailabilityQuerySerializer,
    MobileBookingCancelSerializer,
    MobileBookingListQuerySerializer,
    MobileBookingRequestSerializer,
    MobileBookingRescheduleSerializer,
    MobileBootstrapQuerySerializer,
    MobileCustomerProfileSerializer,
    MobileCustomerProfileUpdateSerializer,
    MobileCustomerRegisterSerializer,
    MobileDeviceRegisterSerializer,
    MobileDeviceUnregisterSerializer,
    MobileDiscoverQuerySerializer,
    MobileLoyaltyQuoteSerializer,
    MobileNotificationSerializer,
    MobileReviewCreateSerializer,
    MobileScopedQuerySerializer,
    MobileStaffQuerySerializer,
)
from apps.authentication.api.serializers import UserProfileSerializer
from apps.authentication.api.utils import client_ip, user_agent
from apps.authentication.constants import DEFAULT_ROLE_DEFINITIONS
from apps.authentication.services.authentication import AuthenticationService
from apps.bookings.models import Booking, BookingChannel, BookingReview, BookingSource, BookingStatus
from apps.bookings.services.availability import AvailabilityService
from apps.bookings.services.bookings import BookingService
from apps.businesses.models import Branch, BranchStatus, Business, WhiteLabelProfile
from apps.businesses.services.white_label import ensure_white_label_profile, serialize_white_label_profile
from apps.common.api.responses import success_response
from apps.customers.models import Customer
from apps.customers.services import CustomerService
from apps.customers.services.loyalty import LoyaltyService
from apps.notifications.models import (
    MobileDevice,
    Notification,
    NotificationChannel,
    NotificationStatus,
)
from apps.notifications.constants import AUDIENCE_CUSTOMER
from apps.notifications.repositories.notifications import audience_filter
from apps.notifications.services.notifications import NotificationService
from apps.platform_media.models import MediaFolderType, MediaVisibility
from apps.platform_media.services import MediaService
from apps.services.models import Service, ServiceCategory, ServiceImage, ServicePricing, ServiceStatus, ServiceVisibility
from apps.staff.models import EmploymentStatus, Staff, StaffServiceAssignment
from apps.tenancy.models import Tenant

MOBILE_CUSTOMER_PERMISSIONS = [IsAuthenticated, IsEmailVerified]


def _resolve_tenant_business(*, tenant_slug: str, business_code: str) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if tenant is None:
        raise ValueError("Tenant not found.")
    business = Business.objects.require_tenant(tenant).filter(business_code=business_code).first()
    if business is None:
        raise ValueError("Business not found.")
    return tenant, business


def _resolve_white_label_profile(
    *,
    flavor_key: str | None = None,
    app_slug: str | None = None,
    tenant_slug: str | None = None,
    business_code: str | None = None,
) -> WhiteLabelProfile:
    if flavor_key:
        profile = (
            WhiteLabelProfile.objects.select_related("business", "tenant")
            .filter(flavor_key=flavor_key, white_label_enabled=True, deleted_at__isnull=True, is_active=True)
            .first()
        )
        if profile is None:
            raise ValueError("White-label profile not found.")
        return profile
    if app_slug:
        profile = (
            WhiteLabelProfile.objects.select_related("business", "tenant")
            .filter(app_slug=app_slug, white_label_enabled=True, deleted_at__isnull=True, is_active=True)
            .first()
        )
        if profile is None:
            raise ValueError("White-label profile not found.")
        return profile
    if tenant_slug and business_code:
        tenant, business = _resolve_tenant_business(tenant_slug=tenant_slug, business_code=business_code)
        return ensure_white_label_profile(business=business)
    raise ValueError("Provide flavor_key, app_slug, or tenant_slug with business_code.")


UPCOMING_BOOKING_STATUSES = {
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CHECKED_IN,
    BookingStatus.IN_PROGRESS,
    BookingStatus.RESCHEDULED,
}


def _serialize_mobile_booking(*, booking: Booking, tenant: Tenant) -> dict:
    service = Service.objects.require_tenant(tenant).filter(id=booking.service_id).first()
    service_name = ""
    if service is not None:
        service_name = service.display_name or service.name
    staff_name = ""
    if booking.staff_id:
        staff = Staff.objects.require_tenant(tenant).filter(id=booking.staff_id).first()
        if staff is not None:
            staff_name = staff.display_name
    metadata = booking.metadata or {}
    review_payload = None
    try:
        review = booking.review
    except BookingReview.DoesNotExist:
        review = None
    if review is not None:
        review_payload = {
            "id": str(review.id),
            "rating": review.rating,
            "comment": review.comment or "",
            "created_at": review.created_at,
        }
    branch = booking.branch
    branch_payload = None
    if branch is not None:
        address_parts = [
            part
            for part in [
                branch.address_line1,
                branch.address_line2,
                branch.city,
                branch.state,
                branch.postal_code,
                branch.country,
            ]
            if part
        ]
        branch_payload = {
            "id": str(branch.id),
            "display_name": branch.display_name or branch.branch_name,
            "address_line1": branch.address_line1 or "",
            "address_line2": branch.address_line2 or "",
            "city": branch.city or "",
            "state": branch.state or "",
            "country": branch.country or "",
            "postal_code": branch.postal_code or "",
            "formatted_address": ", ".join(address_parts),
            "latitude": float(branch.latitude) if branch.latitude is not None else None,
            "longitude": float(branch.longitude) if branch.longitude is not None else None,
        }
    return {
        "id": booking.id,
        "booking_number": booking.booking_number,
        "status": booking.status,
        "service_id": booking.service_id,
        "service_name": service_name,
        "staff_id": booking.staff_id,
        "staff_name": staff_name,
        "branch": branch_payload,
        "appointment_date": booking.appointment_date,
        "start_at": booking.start_at,
        "end_at": booking.end_at,
        "duration_minutes": booking.duration_minutes,
        "notes": booking.notes or "",
        "payment_mode": metadata.get("payment_mode") or "pay_at_venue",
        "created_at": booking.created_at,
        "review": review_payload,
    }


def _serialize_mobile_service(*, tenant: Tenant, business: Business, service: Service, request: Request | None = None) -> dict:
    default_price = (
        ServicePricing.objects.require_tenant(tenant)
        .filter(service=service, is_default=True)
        .order_by("-created_at")
        .first()
    )
    duration = (
        service.durations.filter(is_default=True).values_list("duration_minutes", flat=True).first() or 30
    )
    staff_ids = list(
        StaffServiceAssignment.objects.require_tenant(tenant)
        .filter(service=service, is_active_assignment=True, staff__employment_status=EmploymentStatus.ACTIVE)
        .values_list("staff_id", flat=True)
    )
    staff_rows = [
        {
            "id": str(member.id),
            "display_name": member.display_name,
            "title": member.designation or "",
        }
        for member in Staff.objects.require_tenant(tenant).filter(id__in=staff_ids, business=business)
    ]
    return {
        "id": str(service.id),
        "service_code": service.service_code,
        "name": service.display_name or service.name,
        "description": service.description or service.short_description or "",
        "short_description": service.short_description or "",
        "duration_minutes": duration,
        "currency": default_price.currency if default_price else business.currency,
        "price": float(default_price.base_price) if default_price else 0,
        "loyalty_points_earn": int(service.loyalty_points_earn or 0),
        "category_id": str(service.category_id) if service.category_id else None,
        "category_name": service.category.name if service.category else "General",
        "image_url": _service_image_url(tenant=tenant, service=service, request=request),
        "online_booking_enabled": bool(service.online_booking_enabled),
        "staff": staff_rows,
    }


def _service_image_url(*, tenant: Tenant, service: Service, request: Request | None = None) -> str:
    image = (
        ServiceImage.objects.require_tenant(tenant)
        .filter(service=service)
        .select_related("media")
        .order_by("-is_primary", "display_order", "created_at")
        .first()
    )
    if image is None or image.media is None:
        return ""
    raw_url = str(image.media.metadata.get("public_url") or image.media.metadata.get("thumbnail_url") or "")
    if not raw_url:
        return ""
    if raw_url.startswith("http://") or raw_url.startswith("https://"):
        return raw_url
    if request is not None:
        return request.build_absolute_uri(raw_url)
    return raw_url


def _serialize_mobile_notification(notification: Notification) -> dict:
    from apps.notifications.api.serializers import notification_type_from_metadata

    return {
        "id": notification.id,
        "subject": notification.subject,
        "body": notification.body,
        "channel": notification.channel,
        "status": notification.status,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
        "updated_at": notification.updated_at,
        "booking_id": notification.booking_id,
        "pet_id": (notification.metadata or {}).get("pet_id") or None,
        "order_id": (notification.metadata or {}).get("order_id") or None,
        "return_id": (notification.metadata or {}).get("return_id") or None,
        "notification_type": notification_type_from_metadata(notification.metadata),
    }


class MobileBootstrapView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"], request=MobileBootstrapQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileBootstrapQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            profile = _resolve_white_label_profile(
                flavor_key=serializer.validated_data.get("flavor_key"),
                app_slug=serializer.validated_data.get("app_slug"),
                tenant_slug=serializer.validated_data.get("tenant_slug"),
                business_code=serializer.validated_data.get("business_code"),
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(
            serialize_white_label_profile(profile),
            request_id=getattr(request, "request_id", None),
        )


class MobileDiscoverServicesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"], request=MobileDiscoverQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        services = (
            Service.objects.require_tenant(tenant)
            .filter(
                business=business,
                status=ServiceStatus.ACTIVE,
                visibility=ServiceVisibility.PUBLIC,
                online_booking_enabled=True,
            )
            .select_related("category")
            .order_by("display_order", "display_name")
        )
        categories = (
            ServiceCategory.objects.require_tenant(tenant)
            .filter(business=business, status=ServiceStatus.ACTIVE)
            .order_by("display_order", "name")
        )
        service_rows = []
        for service in services:
            default_price = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service=service, is_default=True)
                .order_by("-created_at")
                .first()
            )
            service_rows.append(
                {
                    "id": str(service.id),
                    "service_code": service.service_code,
                    "name": service.display_name or service.name,
                    "description": service.short_description or service.description,
                    "duration_minutes": (
                        service.durations.filter(is_default=True).values_list("duration_minutes", flat=True).first()
                        or 30
                    ),
                    "currency": default_price.currency if default_price else business.currency,
                    "price": float(default_price.base_price) if default_price else 0,
                    "loyalty_points_earn": int(service.loyalty_points_earn or 0),
                    "category_id": str(service.category_id) if service.category_id else None,
                    "category_name": service.category.name if service.category else "General",
                    "image_url": _service_image_url(tenant=tenant, service=service, request=request),
                }
            )
        return success_response(
            {
                "tenant_slug": tenant.slug,
                "business_code": business.business_code,
                "categories": [
                    {"id": str(category.id), "name": category.name, "slug": category.slug}
                    for category in categories
                ],
                "services": service_rows,
            },
            request_id=getattr(request, "request_id", None),
        )


class MobileAvailabilityView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    service = AvailabilityService()

    @extend_schema(tags=["Mobile"], request=MobileAvailabilityQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileAvailabilityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        slots = self.service.available_slots(
            tenant=tenant,
            business=business,
            staff_id=serializer.validated_data.get("staff_id"),
            service_id=serializer.validated_data.get("service_id"),
            target_date=serializer.validated_data["date"],
            duration_minutes=serializer.validated_data["duration_minutes"],
            interval_minutes=serializer.validated_data["interval_minutes"],
            buffer_minutes=serializer.validated_data.get("buffer_minutes"),
        )
        return success_response(
            {
                "slots": [slot.as_dict() for slot in slots],
                "message": None
                if slots
                else "No timeslot available for this date. Try another day or stylist.",
            },
            request_id=getattr(request, "request_id", None),
        )


class MobileBookingRequestView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    booking_service = BookingService()

    @extend_schema(tags=["Mobile"], request=MobileBookingRequestSerializer)
    def post(self, request: Request) -> Response:
        serializer = MobileBookingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        service = Service.objects.require_tenant(tenant).filter(
            id=serializer.validated_data["service_id"], business=business
        ).first()
        if service is None:
            return Response({"error": {"message": "Service not found."}}, status=status.HTTP_404_NOT_FOUND)

        staff_id = serializer.validated_data.get("staff_id")
        if staff_id:
            staff = Staff.objects.require_tenant(tenant).filter(
                id=staff_id,
                business=business,
                employment_status=EmploymentStatus.ACTIVE,
            ).first()
            if staff is None:
                return Response({"error": {"message": "Stylist not found."}}, status=status.HTTP_404_NOT_FOUND)
            if not StaffServiceAssignment.objects.require_tenant(tenant).filter(
                staff=staff,
                service=service,
                is_active_assignment=True,
            ).exists():
                return Response(
                    {"error": {"message": "Selected stylist does not offer this service."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif not StaffServiceAssignment.objects.require_tenant(tenant).filter(
            service=service,
            is_active_assignment=True,
            staff__business=business,
            staff__employment_status=EmploymentStatus.ACTIVE,
        ).exists():
            return Response(
                {
                    "error": {
                        "message": "No timeslot available. No stylist is assigned to this service.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        customer_name = serializer.validated_data.get("customer_name", "").strip()
        phone_number = serializer.validated_data.get("phone_number", "").strip()
        email = serializer.validated_data.get("email", "").strip()
        if not customer_name:
            customer_name = user.full_name or f"{user.first_name} {user.last_name}".strip()
        if not email:
            email = user.email or ""
        if not phone_number:
            phone_number = user.phone_number or ""

        if not customer_name:
            return Response({"error": {"message": "Customer name is required."}}, status=status.HTTP_400_BAD_REQUEST)

        customer = self._find_or_create_customer(
            tenant=tenant,
            business=business,
            user=user,
            customer_name=customer_name,
            phone_number=phone_number,
            email=email,
        )
        start_at = serializer.validated_data["start_at"]
        duration = serializer.validated_data["duration_minutes"]
        try:
            booking = self.booking_service.create_booking(
                tenant=tenant,
                business=business,
                data={
                    "customer_id": customer.id,
                    "service_id": service.id,
                    "staff_id": staff_id,
                    "branch_id": serializer.validated_data.get("branch_id"),
                    "start_at": start_at,
                    "duration_minutes": duration,
                    "status": BookingStatus.PENDING,
                    "source": BookingSource.CUSTOMER_APP,
                    "channel": BookingChannel.MOBILE,
                    "notes": serializer.validated_data.get("notes", ""),
                    "metadata": {
                        "payment_mode": serializer.validated_data.get("payment_mode") or "pay_at_venue",
                    },
                    "points_to_redeem": serializer.validated_data.get("points_to_redeem"),
                },
                actor=user,
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
            return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)
        return success_response(
            {
                "booking_id": str(booking.id),
                "booking_number": booking.booking_number,
                "status": booking.status,
            },
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    def _find_or_create_customer(
        self,
        *,
        tenant: Tenant,
        business: Business,
        user: object | None,
        customer_name: str,
        phone_number: str,
        email: str,
    ) -> Customer:
        if user is not None and getattr(user, "is_authenticated", False):
            existing = resolve_customers_for_user(tenant=tenant, business=business, user=user).first()
            if existing is not None:
                return existing
        existing = None
        if email:
            existing = Customer.objects.require_tenant(tenant).filter(business=business, email=email).first()
        if existing is None and phone_number:
            existing = Customer.objects.require_tenant(tenant).filter(
                business=business, phone_number=phone_number
            ).first()
        if existing:
            return existing
        first_name, _, last_name = customer_name.strip().partition(" ")
        return Customer.objects.create(
            tenant=tenant,
            business=business,
            customer_code=f"mob-{uuid.uuid4().hex[:8]}",
            first_name=first_name or "Customer",
            last_name=last_name,
            display_name=customer_name.strip() or "Customer",
            phone_number=phone_number,
            email=email,
        )


CUSTOMER_ROLE_CODE = next(role["code"] for role in DEFAULT_ROLE_DEFINITIONS if role["code"] == "customer")


class MobileCustomerRegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"], request=MobileCustomerRegisterSerializer)
    def post(self, request: Request) -> Response:
        serializer = MobileCustomerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = AuthenticationService().register(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
            first_name=serializer.validated_data.get("first_name", ""),
            last_name=serializer.validated_data.get("last_name", ""),
            role_code=CUSTOMER_ROLE_CODE,
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        phone_number = serializer.validated_data.get("phone_number", "")
        if phone_number:
            user.phone_number = phone_number
            user.save(update_fields=["phone_number", "updated_at"])
        return success_response(
            UserProfileSerializer(user).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class MobileCustomerProfileView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    customer_service = CustomerService()

    @extend_schema(tags=["Mobile"], responses={200: MobileCustomerProfileSerializer})
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        return success_response(
            serialize_mobile_customer_profile(customer, user=request.user),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Mobile"], request=MobileCustomerProfileUpdateSerializer, responses={200: MobileCustomerProfileSerializer})
    def patch(self, request: Request) -> Response:
        scope = MobileScopedQuerySerializer(data=request.query_params)
        scope.is_valid(raise_exception=True)
        serializer = MobileCustomerProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=scope.validated_data["tenant_slug"],
                business_code=scope.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        address_payload = {
            key: serializer.validated_data[key]
            for key in (
                "full_address",
                "line1",
                "city",
                "state",
                "country",
                "postal_code",
                "latitude",
                "longitude",
            )
            if key in serializer.validated_data
        }
        if address_payload:
            try:
                self.customer_service.upsert_default_address(customer=customer, data=address_payload)
            except DjangoValidationError as exc:
                message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
                return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)
        customer.refresh_from_db()
        return success_response(
            serialize_mobile_customer_profile(customer, user=request.user),
            request_id=getattr(request, "request_id", None),
        )


class MobileBookingListView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"], request=MobileBookingListQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileBookingListQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        customers = resolve_customers_for_user(tenant=tenant, business=business, user=request.user)
        if not customers.exists():
            return success_response([], request_id=getattr(request, "request_id", None))

        bookings = (
            Booking.objects.require_tenant(tenant)
            .filter(business=business, customer_id__in=customers.values_list("id", flat=True))
            .order_by("-start_at")
        )
        status_filter = serializer.validated_data.get("status", "").strip()
        if status_filter:
            bookings = bookings.filter(status=status_filter)

        upcoming = serializer.validated_data.get("upcoming")
        if upcoming is True:
            bookings = bookings.filter(
                start_at__gte=timezone.now(),
                status__in=UPCOMING_BOOKING_STATUSES,
            ).order_by("start_at")
        elif upcoming is False:
            bookings = bookings.filter(start_at__lt=timezone.now()).order_by("-start_at")

        rows = [_serialize_mobile_booking(booking=booking, tenant=tenant) for booking in bookings]
        return success_response(rows, request_id=getattr(request, "request_id", None))


class MobileNotificationListView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    service = NotificationService()

    @extend_schema(tags=["Mobile"], request=MobileScopedQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        queryset = (
            Notification.objects.require_tenant(tenant)
            .filter(
                business=business,
                user=request.user,
                channel=NotificationChannel.IN_APP,
            )
            .filter(audience_filter(audience=AUDIENCE_CUSTOMER))
            .order_by("-created_at")
        )
        rows = [_serialize_mobile_notification(notification) for notification in queryset]
        return success_response(rows, request_id=getattr(request, "request_id", None))


class MobileNotificationMarkReadView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    service = NotificationService()

    @extend_schema(tags=["Mobile"], responses={200: MobileNotificationSerializer})
    def patch(self, request: Request, notification_id: uuid.UUID) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        notification = (
            Notification.objects.require_tenant(tenant)
            .filter(id=notification_id, business=business, user=request.user)
            .filter(audience_filter(audience=AUDIENCE_CUSTOMER))
            .first()
        )
        if notification is None:
            return Response({"error": {"message": "Notification not found."}}, status=status.HTTP_404_NOT_FOUND)
        notification = self.service.mark_read(notification=notification)
        return success_response(
            _serialize_mobile_notification(notification),
            request_id=getattr(request, "request_id", None),
        )


class MobileNotificationReadAllView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    service = NotificationService()

    @extend_schema(tags=["Mobile"])
    def patch(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        count = (
            Notification.objects.require_tenant(tenant)
            .filter(business=business, user=request.user, is_read=False)
            .filter(audience_filter(audience=AUDIENCE_CUSTOMER))
            .update(is_read=True, status=NotificationStatus.READ)
        )
        return success_response({"updated": count}, request_id=getattr(request, "request_id", None))


class MobileStaffListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"], request=MobileStaffQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileStaffQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        staff_qs = Staff.objects.require_tenant(tenant).filter(
            business=business,
            employment_status=EmploymentStatus.ACTIVE,
            is_bookable=True,
            is_active=True,
        )
        service_id = serializer.validated_data.get("service_id")
        if service_id:
            assigned_ids = StaffServiceAssignment.objects.require_tenant(tenant).filter(
                service_id=service_id,
                is_active_assignment=True,
            ).values_list("staff_id", flat=True)
            staff_qs = staff_qs.filter(id__in=assigned_ids)
        rows = [
            {
                "id": str(member.id),
                "display_name": member.display_name,
                "designation": member.designation or "Stylist",
                "department": member.department or "",
            }
            for member in staff_qs.order_by("display_name")
        ]
        return success_response(rows, request_id=getattr(request, "request_id", None))


class MobileBranchesListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"], request=MobileScopedQuerySerializer)
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        branches = (
            Branch.objects.require_tenant(tenant)
            .filter(business=business, status=BranchStatus.ACTIVE, is_active=True)
            .order_by("-is_primary", "display_name")
        )
        rows = []
        for branch in branches:
            address_parts = [
                part
                for part in [
                    branch.address_line1,
                    branch.address_line2,
                    branch.city,
                    branch.state,
                    branch.postal_code,
                    branch.country,
                ]
                if part
            ]
            rows.append(
                {
                    "id": str(branch.id),
                    "display_name": branch.display_name or branch.branch_name,
                    "is_primary": branch.is_primary,
                    "address_line1": branch.address_line1 or "",
                    "city": branch.city or "",
                    "state": branch.state or "",
                    "country": branch.country or "",
                    "postal_code": branch.postal_code or "",
                    "formatted_address": ", ".join(address_parts),
                    "latitude": float(branch.latitude) if branch.latitude is not None else None,
                    "longitude": float(branch.longitude) if branch.longitude is not None else None,
                }
            )
        return success_response(rows, request_id=getattr(request, "request_id", None))


class MobileBookingDetailView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"], request=MobileScopedQuerySerializer)
    def get(self, request: Request, booking_id: uuid.UUID) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        booking = get_customer_booking(
            tenant=tenant,
            business=business,
            user=request.user,
            booking_id=booking_id,
        )
        if booking is None:
            return Response({"error": {"message": "Booking not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(
            _serialize_mobile_booking(booking=booking, tenant=tenant),
            request_id=getattr(request, "request_id", None),
        )


class MobileBookingCancelView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    booking_service = BookingService()

    @extend_schema(tags=["Mobile"], request=MobileBookingCancelSerializer)
    def post(self, request: Request, booking_id: uuid.UUID) -> Response:
        serializer = MobileBookingCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        booking = get_customer_booking(
            tenant=tenant,
            business=business,
            user=request.user,
            booking_id=booking_id,
        )
        if booking is None:
            return Response({"error": {"message": "Booking not found."}}, status=status.HTTP_404_NOT_FOUND)
        try:
            booking = self.booking_service.transition(
                booking=booking,
                to_status=BookingStatus.CANCELLED,
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
            return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)
        return success_response(
            _serialize_mobile_booking(booking=booking, tenant=tenant),
            request_id=getattr(request, "request_id", None),
        )


class MobileBookingRescheduleView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    booking_service = BookingService()

    @extend_schema(tags=["Mobile"], request=MobileBookingRescheduleSerializer)
    def post(self, request: Request, booking_id: uuid.UUID) -> Response:
        serializer = MobileBookingRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        booking = get_customer_booking(
            tenant=tenant,
            business=business,
            user=request.user,
            booking_id=booking_id,
        )
        if booking is None:
            return Response({"error": {"message": "Booking not found."}}, status=status.HTTP_404_NOT_FOUND)
        try:
            booking = self.booking_service.reschedule(
                booking=booking,
                start_at=serializer.validated_data["start_at"],
                actor=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
            return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)
        return success_response(
            _serialize_mobile_booking(booking=booking, tenant=tenant),
            request_id=getattr(request, "request_id", None),
        )


class MobileDiscoverServiceDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile"])
    def get(self, request: Request, service_id: uuid.UUID) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        service = (
            Service.objects.require_tenant(tenant)
            .filter(
                id=service_id,
                business=business,
                status=ServiceStatus.ACTIVE,
                visibility=ServiceVisibility.PUBLIC,
            )
            .select_related("category")
            .first()
        )
        if service is None:
            return Response({"error": {"message": "Service not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(
            _serialize_mobile_service(tenant=tenant, business=business, service=service, request=request),
            request_id=getattr(request, "request_id", None),
        )


class MobileCustomerProfilePhotoView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    parser_classes = [MultiPartParser, FormParser]
    media_service = MediaService()

    @extend_schema(tags=["Mobile"])
    def post(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response({"error": {"message": "file is required."}}, status=status.HTTP_400_BAD_REQUEST)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)

        ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            result = self.media_service.upload(
                uploaded_file=uploaded,
                tenant=tenant,
                business=business,
                uploaded_by=request.user,
                folder_type=MediaFolderType.CUSTOMERS,
                visibility=MediaVisibility.PUBLIC,
                tags=["profile", "photo", "customer"],
                display_name=f"{request.user.full_name or request.user.email} profile photo",
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
            return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)

        public_url = str(result.media.metadata.get("public_url") or "")
        if public_url:
            request.user.profile_photo = public_url
            request.user.save(update_fields=["profile_photo", "updated_at"])

        return success_response(
            {
                "profile_photo": request.user.profile_photo,
                "media_id": str(result.media.id),
            },
            request_id=getattr(request, "request_id", None),
        )


class MobileMyReviewsView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"])
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customers = resolve_customers_for_user(tenant=tenant, business=business, user=request.user)
        reviews = (
            BookingReview.objects.require_tenant(tenant)
            .filter(business=business, customer_id__in=customers.values_list("id", flat=True))
            .select_related("booking")
            .order_by("-created_at")
        )
        rows = []
        for review in reviews:
            booking = review.booking
            service = Service.objects.require_tenant(tenant).filter(id=booking.service_id).first()
            rows.append(
                {
                    "id": str(review.id),
                    "booking_id": str(booking.id),
                    "booking_number": booking.booking_number,
                    "service_name": (service.display_name or service.name) if service else "",
                    "rating": review.rating,
                    "comment": review.comment,
                    "created_at": review.created_at,
                }
            )
        return success_response(rows, request_id=getattr(request, "request_id", None))


class MobileBookingReviewCreateView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"], request=MobileReviewCreateSerializer)
    def post(self, request: Request, booking_id: uuid.UUID) -> Response:
        serializer = MobileReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        booking = get_customer_booking(
            tenant=tenant,
            business=business,
            user=request.user,
            booking_id=booking_id,
        )
        if booking is None:
            return Response({"error": {"message": "Booking not found."}}, status=status.HTTP_404_NOT_FOUND)
        if booking.status != BookingStatus.COMPLETED:
            return Response(
                {"error": {"message": "Only completed bookings can be reviewed."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if BookingReview.objects.require_tenant(tenant).filter(booking=booking).exists():
            return Response(
                {"error": {"message": "This booking already has a review."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        review = BookingReview.objects.create(
            tenant=tenant,
            business=business,
            booking=booking,
            customer_id=booking.customer_id,
            rating=serializer.validated_data["rating"],
            comment=serializer.validated_data.get("comment", ""),
        )
        from apps.bookings.services.events import BookingEventPublisher

        BookingEventPublisher().publish(
            booking=booking,
            event_type="BookingReviewed",
            payload={
                "review_id": str(review.id),
                "rating": review.rating,
                "comment": review.comment,
            },
        )
        service = Service.objects.require_tenant(tenant).filter(id=booking.service_id).first()
        return success_response(
            {
                "id": str(review.id),
                "booking_id": str(booking.id),
                "booking_number": booking.booking_number,
                "service_name": (service.display_name or service.name) if service else "",
                "rating": review.rating,
                "comment": review.comment,
                "created_at": review.created_at,
            },
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class MobileDeviceRegisterView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"], request=MobileDeviceRegisterSerializer)
    def post(self, request: Request) -> Response:
        serializer = MobileDeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, _business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        device, _created = MobileDevice.objects.update_or_create(
            tenant=tenant,
            user=request.user,
            expo_push_token=serializer.validated_data["expo_push_token"],
            defaults={
                "platform": serializer.validated_data.get("platform", ""),
                "app_flavor": serializer.validated_data.get("app_flavor", ""),
                "last_seen_at": timezone.now(),
                "is_active": True,
                "deleted_at": None,
            },
        )
        return success_response(
            {
                "id": str(device.id),
                "expo_push_token": device.expo_push_token,
                "platform": device.platform,
            },
            request_id=getattr(request, "request_id", None),
        )


class MobileDeviceUnregisterView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS

    @extend_schema(tags=["Mobile"], request=MobileDeviceUnregisterSerializer)
    def post(self, request: Request) -> Response:
        serializer = MobileDeviceUnregisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, _business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        updated = (
            MobileDevice.objects.require_tenant(tenant)
            .filter(user=request.user, expo_push_token=serializer.validated_data["expo_push_token"])
            .update(is_active=False, updated_at=timezone.now())
        )
        return success_response({"unregistered": updated}, request_id=getattr(request, "request_id", None))


class MobileLoyaltyView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    loyalty_service = LoyaltyService()

    @extend_schema(tags=["Mobile"])
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        return success_response(
            self.loyalty_service.get_balance(tenant=tenant, business=business, customer=customer),
            request_id=getattr(request, "request_id", None),
        )


class MobileLoyaltyQuoteView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    loyalty_service = LoyaltyService()

    @extend_schema(tags=["Mobile"], request=MobileLoyaltyQuoteSerializer)
    def post(self, request: Request) -> Response:
        serializer = MobileLoyaltyQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        account = self.loyalty_service.ensure_account(
            tenant=tenant, business=business, customer=customer
        )
        try:
            quote = self.loyalty_service.quote_redemption(
                business=business,
                service_id=serializer.validated_data.get("service_id"),
                amount=serializer.validated_data.get("amount"),
                points_to_redeem=serializer.validated_data["points_to_redeem"],
                points_balance=account.points_balance,
            )
        except DjangoValidationError as exc:
            message = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else (exc.messages if hasattr(exc, "messages") else str(exc))
            )
            return Response({"error": {"message": message}}, status=status.HTTP_400_BAD_REQUEST)
        return success_response(quote, request_id=getattr(request, "request_id", None))


def _serialize_address(address) -> dict:
    return {
        "id": str(address.id),
        "address_type": address.address_type,
        "line1": address.line1,
        "line2": address.line2,
        "city": address.city,
        "state": address.state,
        "country": address.country,
        "postal_code": address.postal_code,
        "latitude": address.latitude,
        "longitude": address.longitude,
        "is_default": address.is_default,
    }


class MobileCustomerAddressListCreateView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    customer_service = CustomerService()

    @extend_schema(tags=["Mobile"])
    def get(self, request: Request) -> Response:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        addresses = self.customer_service.list_addresses(customer=customer)
        return success_response(
            [_serialize_address(item) for item in addresses],
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Mobile"])
    def post(self, request: Request) -> Response:
        scope = MobileScopedQuerySerializer(
            data={
                "tenant_slug": request.query_params.get("tenant_slug") or request.data.get("tenant_slug"),
                "business_code": request.query_params.get("business_code") or request.data.get("business_code"),
            }
        )
        scope.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=scope.validated_data["tenant_slug"],
                business_code=scope.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            address = self.customer_service.create_address(customer=customer, data=request.data)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError as DRFValidationError

            if hasattr(exc, "detail"):
                raise exc
            raise DRFValidationError({"detail": str(exc)}) from exc
        return success_response(
            _serialize_address(address),
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class MobileCustomerAddressDetailView(APIView):
    permission_classes = MOBILE_CUSTOMER_PERMISSIONS
    customer_service = CustomerService()

    @extend_schema(tags=["Mobile"])
    def patch(self, request: Request, address_id) -> Response:
        scope = MobileScopedQuerySerializer(data=request.query_params)
        scope.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=scope.validated_data["tenant_slug"],
                business_code=scope.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            address = self.customer_service.update_address(
                customer=customer, address_id=address_id, data=request.data
            )
        except Exception as exc:
            from rest_framework.exceptions import ValidationError as DRFValidationError

            raise DRFValidationError({"detail": str(exc)}) from exc
        return success_response(
            _serialize_address(address),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Mobile"])
    def delete(self, request: Request, address_id) -> Response:
        scope = MobileScopedQuerySerializer(data=request.query_params)
        scope.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=scope.validated_data["tenant_slug"],
                business_code=scope.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            self.customer_service.delete_address(customer=customer, address_id=address_id)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError as DRFValidationError

            raise DRFValidationError({"detail": str(exc)}) from exc
        return success_response({"deleted": True}, request_id=getattr(request, "request_id", None))
