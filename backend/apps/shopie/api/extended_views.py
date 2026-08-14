from __future__ import annotations

from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.constants import (
    FEATURE_SHOPIE_DELIVERY_ZONES,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_RETURNS,
)
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.customers.models import Customer
from apps.shopie.api.access import (
    POS_SCAN_FEATURES,
    require_any_shopie_feature,
    require_business as _business,
)
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    BarcodeBulkLookupSerializer,
    ShopDeliveryMatchSerializer,
    ShopDeliveryZoneSerializer,
    ShopDeliveryZoneWriteSerializer,
    ShopPetNotifySerializer,
    ShopPetSerializer,
    ShopPetWriteSerializer,
    ShopProductSerializer,
    ShopReturnCreateSerializer,
    ShopReturnSerializer,
    ShopSettingsPatchSerializer,
    ShopSettingsSerializer,
)
from apps.shopie.models import ShopDeliveryZone, ShopOrder, ShopPet, VerticalPack
from apps.shopie.services import CatalogService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.returns import ReturnService
from apps.shopie.services.zones import DeliveryZoneService


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": list(exc.messages) if hasattr(exc, "messages") else str(exc)})


class ShopBarcodeBulkLookupView(APIView):
    """Bulk barcode/RFID EPC resolve for multi-scan basket fill."""

    permission_classes = [ShopAccessPermission]
    catalog = CatalogService()

    def post(self, request: Request) -> Response:
        serializer = BarcodeBulkLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = _business(request, serializer.validated_data["business_id"], features=POS_SCAN_FEATURES)
        rows = self.catalog.lookup_many(
            tenant=request.current_tenant,
            business=business,
            codes=serializer.validated_data["codes"],
        )
        payload = []
        for row in rows:
            item = {"code": row["code"], "found": row["found"]}
            if row["found"] and row.get("product") is not None:
                item["product"] = ShopProductSerializer(row["product"]).data
            payload.append(item)
        return success_response({"items": payload, "found_count": sum(1 for r in payload if r["found"])})


class ShopReturnListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    returns = ReturnService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_RETURNS)
        order_id_raw = request.query_params.get("order_id")
        order_id = UUID(order_id_raw) if order_id_raw else None
        qs = self.returns.list_returns(
            tenant=request.current_tenant, business=business, order_id=order_id
        )
        return paginated_list_response(request, qs, ShopReturnSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopReturnCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"], feature=FEATURE_SHOPIE_RETURNS)
        order = get_object_or_404(
            ShopOrder, tenant=request.current_tenant, business=business, id=data["order_id"]
        )
        try:
            shop_return = self.returns.create_return(
                tenant=request.current_tenant,
                business=business,
                order=order,
                lines=data["lines"],
                reason=data.get("reason") or "",
                restock=bool(data.get("restock", True)),
                complete=bool(data.get("complete", True)),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopReturnSerializer(shop_return).data, status_code=status.HTTP_201_CREATED)


class ShopDeliveryZoneListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    zones = DeliveryZoneService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id, feature=FEATURE_SHOPIE_DELIVERY_ZONES)
        qs = self.zones.list_zones(tenant=request.current_tenant, business=business)
        return paginated_list_response(request, qs, ShopDeliveryZoneSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopDeliveryZoneWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data.pop("business_id"), feature=FEATURE_SHOPIE_DELIVERY_ZONES)
        try:
            zone = self.zones.create_zone(
                tenant=request.current_tenant, business=business, data=data
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopDeliveryZoneSerializer(zone).data, status_code=status.HTTP_201_CREATED)


class ShopDeliveryZoneDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    zones = DeliveryZoneService()

    def patch(self, request: Request, zone_id) -> Response:
        zone = get_object_or_404(ShopDeliveryZone, tenant=request.current_tenant, id=zone_id)
        require_any_shopie_feature(zone.business, (FEATURE_SHOPIE_DELIVERY_ZONES,))
        serializer = ShopDeliveryZoneWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        zone = self.zones.update_zone(zone=zone, data=data)
        return success_response(ShopDeliveryZoneSerializer(zone).data)


class ShopDeliveryMatchView(APIView):
    permission_classes = [ShopAccessPermission]
    zones = DeliveryZoneService()

    def post(self, request: Request) -> Response:
        serializer = ShopDeliveryMatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = _business(
            request,
            serializer.validated_data["business_id"],
            features=(FEATURE_SHOPIE_DELIVERY_ZONES, FEATURE_SHOPIE_ORDERS),
        )
        zone = self.zones.match_zone(
            tenant=request.current_tenant,
            business=business,
            city=serializer.validated_data.get("city") or "",
            postal_code=serializer.validated_data.get("postal_code") or "",
        )
        if zone is None:
            return success_response({"matched": False, "zone": None})
        return success_response({"matched": True, "zone": ShopDeliveryZoneSerializer(zone).data})


class ShopSettingsView(APIView):
    permission_classes = [ShopAccessPermission]
    pets = PetsService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        settings = self.pets.ensure_settings(tenant=request.current_tenant, business=business)
        return success_response(ShopSettingsSerializer(settings).data)

    def patch(self, request: Request) -> Response:
        serializer = ShopSettingsPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        settings = self.pets.ensure_settings(tenant=request.current_tenant, business=business)
        if "enable_pets" in data:
            want_enabled = bool(data["enable_pets"])
            if want_enabled and not self.pets.has_pets_entitlement(business=business):
                raise ValidationError(
                    {
                        "enable_pets": (
                            "Pets pack requires a ₹500/month ShopIE add-on. "
                            "Subscribe from Product settings."
                        )
                    }
                )
            settings = self.pets.set_pack_enabled(
                tenant=request.current_tenant,
                business=business,
                pack=VerticalPack.PETS,
                enabled=want_enabled,
            )
        if "enabled_packs" in data and data["enabled_packs"] is not None:
            settings.enabled_packs = data["enabled_packs"]
        if "default_fulfillment_mode" in data and data["default_fulfillment_mode"]:
            settings.default_fulfillment_mode = data["default_fulfillment_mode"]
        if "same_day_delivery_enabled" in data and data["same_day_delivery_enabled"] is not None:
            settings.same_day_delivery_enabled = data["same_day_delivery_enabled"]
        if "metadata" in data and data["metadata"] is not None:
            settings.metadata = data["metadata"]
        settings.save()
        return success_response(ShopSettingsSerializer(settings).data)


class ShopPetListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    pets = PetsService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        try:
            customer_id_raw = request.query_params.get("customer_id")
            qs = self.pets.list_pets(
                tenant=request.current_tenant,
                business=business,
                customer_id=UUID(customer_id_raw) if customer_id_raw else None,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return paginated_list_response(request, qs, ShopPetSerializer)

    def post(self, request: Request) -> Response:
        serializer = ShopPetWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        customer = get_object_or_404(
            Customer, tenant=request.current_tenant, business=business, id=data["customer_id"]
        )
        try:
            pet = self.pets.create_pet(
                tenant=request.current_tenant,
                business=business,
                customer=customer,
                data=data,
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopPetSerializer(pet).data, status_code=status.HTTP_201_CREATED)


class ShopPetDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    pets = PetsService()

    def get(self, request: Request, pet_id) -> Response:
        pet = get_object_or_404(
            ShopPet.objects.select_related("customer"),
            tenant=request.current_tenant,
            id=pet_id,
        )
        try:
            self.pets.require_pets_pack(tenant=request.current_tenant, business=pet.business)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopPetSerializer(pet).data)

    def patch(self, request: Request, pet_id) -> Response:
        pet = get_object_or_404(ShopPet, tenant=request.current_tenant, id=pet_id)
        serializer = ShopPetWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        data.pop("business_id", None)
        try:
            pet = self.pets.update_pet(pet=pet, data=data)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(ShopPetSerializer(pet).data)

    def delete(self, request: Request, pet_id) -> Response:
        pet = get_object_or_404(ShopPet, tenant=request.current_tenant, id=pet_id)
        pet.delete()
        return success_response({"deleted": True})


class ShopPetNotifyView(APIView):
    permission_classes = [ShopAccessPermission]
    pets = PetsService()

    def post(self, request: Request, pet_id) -> Response:
        pet = get_object_or_404(
            ShopPet.objects.select_related("customer", "business"),
            tenant=request.current_tenant,
            id=pet_id,
        )
        serializer = ShopPetNotifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = self.pets.notify_owner(
                pet=pet,
                subject=data["subject"],
                body=data["body"],
                channels=list(data.get("channels") or ["in_app", "email"]),
                event_type="PetOwnerMessage",
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        if not result.get("sent_channels"):
            raise ValidationError(
                {
                    "detail": (
                        "Unable to notify owner. Ensure the customer has an email "
                        "for email alerts, or a matching app account for in-app alerts."
                    )
                }
            )
        return success_response(result)