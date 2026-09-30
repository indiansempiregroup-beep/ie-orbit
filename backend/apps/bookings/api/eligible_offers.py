from __future__ import annotations

from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.api.permissions import BookingAccessPermission
from apps.businesses.constants import PRODUCT_APPOINTIE
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.customers.models import Customer
from apps.workflow.services.events import emit


class BookingEligibleOffersView(APIView):
    """Return automation staff hints for the selected customer (Orbit Appoint)."""

    permission_classes = [BookingAccessPermission]

    def post(self, request: Request) -> Response:
        data = request.data or {}
        business_id = data.get("business_id") or data.get("business")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = Business.objects.filter(
            tenant=request.current_tenant, id=business_id
        ).first()
        if business is None:
            raise NotFound("Business not found.")
        customer = None
        customer_id = data.get("customer_id")
        if customer_id:
            customer = Customer.objects.filter(
                tenant=request.current_tenant, business=business, id=customer_id
            ).first()
            if customer is None:
                raise NotFound("Customer not found.")
        if customer is None:
            return success_response({"staff_hints": [], "offers": []})

        pets = []
        try:
            from apps.shopie.models import ShopPet

            pets = list(
                ShopPet.objects.filter(
                    tenant=request.current_tenant,
                    business=business,
                    customer=customer,
                )
            )
        except Exception:  # noqa: BLE001
            pets = []

        outcome = emit(
            tenant=request.current_tenant,
            business=business,
            event_key="booking.quote",
            context={"customer": customer, "pets": pets, "pet": pets[0] if pets else None},
            product_code=PRODUCT_APPOINTIE,
            subject_type="customer",
            subject_id=str(customer.id),
            dry_run=True,
        )
        return success_response(
            {
                "staff_hints": outcome.get("staff_hints") or [],
                "offers": outcome.get("offers") or [],
                "entitled": outcome.get("entitled", False),
            },
            request_id=getattr(request, "request_id", None),
        )
