from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.mobile_helpers import ensure_customer_for_user
from apps.api.mobile_serializers import MobileDiscoverQuerySerializer
from apps.businesses.constants import FEATURE_SHOPIE_CUSTOMER_REFERRAL, FEATURE_SHOPIE_GROW_ADS, PRODUCT_SHOPIE
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.common.api.responses import success_response
from apps.common.upi import build_upi_pay_url
from apps.platform_media.models import MediaFolderType, MediaVisibility
from apps.platform_media.services import MediaService
from apps.shopie.api.serializers import (
    CustomerReferralSerializer,
    MobileShopOrderSerializer,
    MobileShopPetWriteSerializer,
    ShopDashboardAdSerializer,
    ShopPetSerializer,
    ShopProductReviewSerializer,
    ShopProductSerializer,
    ShopReturnSerializer,
)
from apps.shopie.models import (
    FulfillmentMode,
    ProductStatus,
    ShopOrder,
    ShopPet,
    ShopProduct,
    ShopReturn,
)
from apps.shopie.services import CatalogService, OrderService
from apps.shopie.services.ads import DashboardAdService
from apps.shopie.services.coupons import CouponService
from apps.shopie.services.pets import PetsService
from apps.shopie.services.product_reviews import ProductReviewService
from apps.shopie.services.referrals import CustomerReferralService
from apps.shopie.services.returns import ReturnService
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Tenant


def _django_validation(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    return ValidationError({"detail": str(exc)})


def _resolve_tenant_business(*, tenant_slug: str, business_code: str) -> tuple[Tenant, Business]:
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if not tenant:
        raise ValueError("Tenant not found.")
    business = Business.objects.filter(tenant=tenant, business_code=business_code).first()
    if not business:
        raise ValueError("Business not found.")
    return tenant, business


def _scope_from_request(request: Request) -> tuple[Tenant, Business]:
    serializer = MobileDiscoverQuerySerializer(
        data={
            "tenant_slug": request.query_params.get("tenant_slug") or request.data.get("tenant_slug"),
            "business_code": request.query_params.get("business_code") or request.data.get("business_code"),
        }
    )
    serializer.is_valid(raise_exception=True)
    return _resolve_tenant_business(
        tenant_slug=serializer.validated_data["tenant_slug"],
        business_code=serializer.validated_data["business_code"],
    )


class MobileShopAdListView(APIView):
    permission_classes = [AllowAny]
    ads = DashboardAdService()
    entitlements = EntitlementService()

    @extend_schema(tags=["Mobile Shop"])
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
        if not self.entitlements.has_feature(
            business=business,
            feature=FEATURE_SHOPIE_GROW_ADS,
            product_code=PRODUCT_SHOPIE,
        ):
            return success_response([])
        qs = self.ads.list_ads(tenant=tenant, business=business, active_only=True)[:5]
        return success_response(ShopDashboardAdSerializer(qs, many=True).data)


class MobileShopProductListView(APIView):
    permission_classes = [AllowAny]
    catalog = CatalogService()

    @extend_schema(tags=["Mobile Shop"])
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
        category = request.query_params.get("category") or None
        products = self.catalog.list_products(
            tenant=tenant,
            business=business,
            search=request.query_params.get("search"),
            status=ProductStatus.ACTIVE,
            category=category,
        )
        return success_response(ShopProductSerializer(products[:100], many=True).data)


class MobileShopProductDetailView(APIView):
    permission_classes = [AllowAny]
    catalog = CatalogService()
    reviews = ProductReviewService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, product_id) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            product = self.catalog.get_product(tenant=tenant, business=business, product_id=product_id)
        except (ValueError, ShopProduct.DoesNotExist) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        payload = ShopProductSerializer(product).data
        review_qs = self.reviews.list_reviews(tenant=tenant, business=business, product=product)[:20]
        payload["reviews"] = ShopProductReviewSerializer(review_qs, many=True).data
        payload["rating_breakdown"] = self.reviews.rating_breakdown(
            tenant=tenant, business=business, product=product
        )
        payload["can_review"] = False
        payload["has_purchased"] = False
        payload["my_review"] = None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            customer = ensure_customer_for_user(tenant=tenant, business=business, user=user)
            mine = self.reviews.get_customer_review(tenant=tenant, product=product, customer=customer)
            payload["my_review"] = ShopProductReviewSerializer(mine).data if mine else None
            payload["can_review"] = mine is None
            payload["has_purchased"] = self.reviews.has_purchased(
                tenant=tenant, business=business, customer=customer, product=product
            )
        return success_response(payload)


class MobileShopProductReviewListCreateView(APIView):
    reviews = ProductReviewService()
    catalog = CatalogService()

    def get_permissions(self):
        if self.request.method in {"POST", "PATCH"}:
            return [IsAuthenticated()]
        return [AllowAny()]

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, product_id) -> Response:
        serializer = MobileDiscoverQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            product = self.catalog.get_product(tenant=tenant, business=business, product_id=product_id)
        except (ValueError, ShopProduct.DoesNotExist) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        rows = self.reviews.list_reviews(tenant=tenant, business=business, product=product)[:50]
        return success_response(ShopProductReviewSerializer(rows, many=True).data)

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, product_id) -> Response:
        from apps.api.mobile_serializers import MobileReviewCreateSerializer

        serializer = MobileReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            product = self.catalog.get_product(tenant=tenant, business=business, product_id=product_id)
        except (ValueError, ShopProduct.DoesNotExist) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            review = self.reviews.create_review(
                tenant=tenant,
                business=business,
                product=product,
                customer=customer,
                rating=serializer.validated_data["rating"],
                title=serializer.validated_data.get("title") or "",
                comment=serializer.validated_data.get("comment") or "",
            )
        except DjangoValidationError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(ShopProductReviewSerializer(review).data, status_code=status.HTTP_201_CREATED)

    @extend_schema(tags=["Mobile Shop"])
    def patch(self, request: Request, product_id) -> Response:
        from apps.api.mobile_serializers import MobileReviewCreateSerializer

        serializer = MobileReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
            product = self.catalog.get_product(tenant=tenant, business=business, product_id=product_id)
        except (ValueError, ShopProduct.DoesNotExist) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            review = self.reviews.update_review(
                tenant=tenant,
                product=product,
                customer=customer,
                rating=serializer.validated_data["rating"],
                title=serializer.validated_data.get("title") or "",
                comment=serializer.validated_data.get("comment") or "",
            )
        except DjangoValidationError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(ShopProductReviewSerializer(review).data)


class MobileShopOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        qs = self.orders.list_orders(tenant=tenant, business=business, customer_id=customer.id)
        return success_response(MobileShopOrderSerializer(qs[:50], many=True).data)

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        lines = request.data.get("lines") or []
        mode = request.data.get("fulfillment_mode") or FulfillmentMode.PICKUP
        notes = str(request.data.get("notes") or "").strip()
        preferred_date = str(request.data.get("preferred_date") or "").strip()
        preferred_time = str(request.data.get("preferred_time") or "").strip()
        fulfillment_note = str(request.data.get("fulfillment_note") or "").strip()
        slot_bits: list[str] = []
        if preferred_date or preferred_time:
            label = "Pickup" if str(mode).lower() == FulfillmentMode.PICKUP else "Delivery"
            slot_bits.append(
                f"{label} preferred: {' '.join(part for part in (preferred_date, preferred_time) if part)}"
            )
        if fulfillment_note:
            slot_bits.append(fulfillment_note)
        if slot_bits:
            extra = "\n".join(slot_bits)
            notes = f"{notes}\n{extra}".strip() if notes else extra
        metadata_extra = {
            key: value
            for key, value in {
                "preferred_date": preferred_date,
                "preferred_time": preferred_time,
                "fulfillment_note": fulfillment_note,
            }.items()
            if value
        }
        try:
            points_to_redeem = int(request.data.get("points_to_redeem") or 0)
        except (TypeError, ValueError):
            points_to_redeem = 0
        try:
            order = self.orders.create_order(
                tenant=tenant,
                business=business,
                customer=customer,
                lines=lines,
                fulfillment_mode=mode,
                notes=notes,
                delivery_address=str(request.data.get("delivery_address") or ""),
                delivery_city=str(request.data.get("delivery_city") or ""),
                delivery_state=str(request.data.get("delivery_state") or ""),
                delivery_postal_code=str(request.data.get("delivery_postal_code") or ""),
                delivery_latitude=request.data.get("delivery_latitude"),
                delivery_longitude=request.data.get("delivery_longitude"),
                delivery_method=str(request.data.get("delivery_method") or ""),
                delivery_quote_id=str(request.data.get("delivery_quote_id") or ""),
                displayed_delivery_fee=request.data.get("displayed_delivery_fee"),
                payment_method=str(request.data.get("payment_method") or "cash"),
                coupon_code=str(request.data.get("coupon_code") or ""),
                points_to_redeem=points_to_redeem,
                confirm=False,
                metadata_extra=metadata_extra or None,
            )
        except (DjangoValidationError, ShopProduct.DoesNotExist) as exc:
            if isinstance(exc, DjangoValidationError) and hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(
            MobileShopOrderSerializer(order).data, status_code=status.HTTP_201_CREATED
        )


class MobileShopCouponValidateView(APIView):
    permission_classes = [IsAuthenticated]
    coupons = CouponService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        try:
            preview = self.coupons.preview(
                tenant=tenant,
                business=business,
                code=str(request.data.get("code") or request.data.get("coupon_code") or ""),
                lines=request.data.get("lines") or [],
                fulfillment_mode=str(request.data.get("fulfillment_mode") or FulfillmentMode.PICKUP),
                customer=customer,
            )
        except (DjangoValidationError, ShopProduct.DoesNotExist) as exc:
            if isinstance(exc, DjangoValidationError) and hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(preview)


class MobileShopCouponAvailableView(APIView):
    permission_classes = [AllowAny]
    coupons = CouponService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = None
        if getattr(request.user, "is_authenticated", False):
            try:
                customer = ensure_customer_for_user(
                    tenant=tenant, business=business, user=request.user
                )
            except Exception:
                customer = None
        fulfillment_mode = str(
            request.data.get("fulfillment_mode")
            or request.query_params.get("fulfillment_mode")
            or FulfillmentMode.PICKUP
        )
        lines = request.data.get("lines") or []
        try:
            offers = self.coupons.list_for_cart(
                tenant=tenant,
                business=business,
                lines=lines,
                fulfillment_mode=fulfillment_mode,
                customer=customer,
            )
        except (DjangoValidationError, ShopProduct.DoesNotExist, KeyError, TypeError, ValueError):
            offers = self.coupons.list_for_cart(
                tenant=tenant,
                business=business,
                lines=[],
                fulfillment_mode=fulfillment_mode,
                customer=customer,
            )
        return success_response(offers)

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        return self.post(request)


class MobileShopOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    def _owned_order(self, request: Request, order_id):
        tenant, business = _scope_from_request(request)
        order = self.orders.get_order(tenant=tenant, business=business, order_id=order_id)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        if order.customer_id != customer.id and not getattr(request.user, "is_superuser", False):
            raise LookupError("Not found.")
        return tenant, business, customer, order

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, order_id) -> Response:
        try:
            _, _, _, order = self._owned_order(request, order_id)
        except (ValueError, LookupError, ShopProduct.DoesNotExist, Exception) as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(MobileShopOrderSerializer(order).data)


class MobileShopOrderCancelView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        try:
            order = self.orders.cancel_customer_order(tenant=tenant, business=business, order=order)
        except DjangoValidationError as exc:
            raise _django_validation(exc) from exc
        return success_response(MobileShopOrderSerializer(order).data)


class MobileShopOrderClaimPaymentView(APIView):
    permission_classes = [IsAuthenticated]
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        try:
            order = self.orders.claim_payment(
                tenant=tenant,
                business=business,
                order=order,
                upi_utr=str(request.data.get("upi_utr") or ""),
                payment_proof_url=str(request.data.get("payment_proof_url") or ""),
            )
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response(MobileShopOrderSerializer(order).data)


class MobileShopOrderPaymentProofView(APIView):
    permission_classes = [IsAuthenticated]
    media_service = MediaService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request, order_id) -> Response:
        detail = MobileShopOrderDetailView()
        try:
            tenant, business, _, order = detail._owned_order(request, order_id)
        except Exception as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise ValidationError({"file": "Payment screenshot is required."})
        result = self.media_service.upload(
            uploaded_file=uploaded,
            tenant=tenant,
            business=business,
            uploaded_by=request.user,
            folder_type=MediaFolderType.DOCUMENTS,
            visibility=MediaVisibility.PRIVATE,
            tags=["shop_payment_proof", str(order.id)],
            display_name=f"Payment proof {order.order_number}",
        )
        public_url = str(result.media.metadata.get("public_url") or "")
        return success_response(
            {
                "payment_proof_url": public_url,
                "media_id": str(result.media.id),
                "order_id": str(order.id),
            }
        )


class MobileShopDeliveryZoneMatchView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    zones = DeliveryZoneService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        zone = self.zones.match_zone(
            tenant=tenant,
            business=business,
            city=str(request.query_params.get("city") or ""),
            postal_code=str(request.query_params.get("postal_code") or ""),
        )
        if zone is None:
            return success_response({"matched": False, "zone": None})
        return success_response(
            {
                "matched": True,
                "zone": {
                    "id": str(zone.id),
                    "name": zone.name,
                    "fee": str(zone.fee),
                    "min_order_total": str(zone.min_order_total),
                    "same_day": zone.same_day,
                    "instant_delivery_enabled": zone.instant_delivery_enabled,
                },
            }
        )


class MobileShopPetListView(APIView):
    permission_classes = [IsAuthenticated]
    pets = PetsService()

    def _owned_scope(self, request: Request):
        tenant, business = _scope_from_request(request)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        return tenant, business, customer

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business, customer = self._owned_scope(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        if not self.pets.has_pets_entitlement(business=business):
            return success_response([])
        try:
            qs = self.pets.list_pets(tenant=tenant, business=business, customer_id=customer.id)
        except DjangoValidationError:
            return success_response([])
        return success_response(ShopPetSerializer(qs[:100], many=True).data)

    @extend_schema(tags=["Mobile Shop"], request=MobileShopPetWriteSerializer)
    def post(self, request: Request) -> Response:
        try:
            tenant, business, customer = self._owned_scope(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        serializer = MobileShopPetWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not str(serializer.validated_data.get("name") or "").strip():
            raise ValidationError({"name": "Pet name is required."})
        try:
            pet = self.pets.create_pet(
                tenant=tenant,
                business=business,
                customer=customer,
                data=serializer.validated_data,
            )
        except DjangoValidationError as exc:
            raise _django_validation(exc) from exc
        return success_response(
            ShopPetSerializer(pet).data,
            status_code=status.HTTP_201_CREATED,
        )


class MobileShopPetPhotoView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    media_service = MediaService()
    pets = PetsService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        if not self.pets.has_pets_entitlement(business=business):
            raise ValidationError({"pack": "Pets pack is not available."})
        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise ValidationError({"file": "A photo is required."})
        result = self.media_service.upload(
            uploaded_file=uploaded,
            tenant=tenant,
            business=business,
            uploaded_by=request.user,
            folder_type=MediaFolderType.CUSTOMERS,
            visibility=MediaVisibility.PUBLIC,
            tags=["pet", "photo", "customer"],
            display_name=f"{request.user.full_name or request.user.email} pet photo",
        )
        public_url = str(result.media.metadata.get("public_url") or "")
        return success_response(
            {
                "photo_url": public_url,
                "media_id": str(result.media.id),
            }
        )


class MobileShopPetDetailView(APIView):
    permission_classes = [IsAuthenticated]
    pets = PetsService()

    def _owned_pet(self, request: Request, pet_id):
        tenant, business = _scope_from_request(request)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        pet = (
            ShopPet.objects.filter(
                tenant=tenant,
                business=business,
                id=pet_id,
                customer_id=customer.id,
            )
            .select_related("customer")
            .first()
        )
        if pet is None:
            raise LookupError("Not found.")
        return pet

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, pet_id) -> Response:
        try:
            pet = self._owned_pet(request, pet_id)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        except LookupError:
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopPetSerializer(pet).data)

    @extend_schema(tags=["Mobile Shop"], request=MobileShopPetWriteSerializer)
    def patch(self, request: Request, pet_id) -> Response:
        try:
            pet = self._owned_pet(request, pet_id)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        except LookupError:
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        serializer = MobileShopPetWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            pet = self.pets.update_pet(pet=pet, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise _django_validation(exc) from exc
        return success_response(ShopPetSerializer(pet).data)


class MobileShopReturnListView(APIView):
    permission_classes = [IsAuthenticated]
    returns = ReturnService()
    orders = OrderService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        order_id = request.query_params.get("order_id") or None
        qs = self.returns.list_returns(
            tenant=tenant,
            business=business,
            customer_id=customer.id,
            order_id=order_id,
        )
        return success_response(ShopReturnSerializer(qs[:50], many=True).data)

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        order_id = request.data.get("order_id")
        if not order_id:
            raise ValidationError({"order_id": "Order is required."})
        try:
            order = self.orders.get_order(tenant=tenant, business=business, order_id=order_id)
        except ShopOrder.DoesNotExist:
            return Response({"error": {"message": "Order not found."}}, status=status.HTTP_404_NOT_FOUND)
        if str(order.customer_id or "") != str(customer.id):
            return Response({"error": {"message": "Order not found."}}, status=status.HTTP_404_NOT_FOUND)
        if str(order.fulfillment_mode or "").lower() not in {
            FulfillmentMode.PICKUP,
            FulfillmentMode.DELIVERY,
        }:
            raise ValidationError({"order": "Returns are available for pickup and delivery orders."})
        try:
            shop_return = self.returns.create_return(
                tenant=tenant,
                business=business,
                order=order,
                lines=request.data.get("lines") or [],
                reason=str(request.data.get("reason") or "").strip(),
                restock=True,
                complete=True,
                require_delivered=True,
            )
        except DjangoValidationError as exc:
            raise _django_validation(exc) from exc
        return success_response(ShopReturnSerializer(shop_return).data, status_code=status.HTTP_201_CREATED)


class MobileShopReturnDetailView(APIView):
    permission_classes = [IsAuthenticated]
    returns = ReturnService()

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request, return_id) -> Response:
        try:
            tenant, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        shop_return = (
            ShopReturn.objects.filter(tenant=tenant, business=business, id=return_id, customer_id=customer.id)
            .select_related("order", "customer", "credit_invoice")
            .first()
        )
        if shop_return is None:
            return Response({"error": {"message": "Not found."}}, status=status.HTTP_404_NOT_FOUND)
        return success_response(ShopReturnSerializer(shop_return).data)


class MobileUpiPreviewView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Mobile Shop"])
    def get(self, request: Request) -> Response:
        try:
            _, business = _scope_from_request(request)
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        amount = request.query_params.get("amount") or "0"
        note = str(request.query_params.get("note") or "")
        url = build_upi_pay_url(
            vpa=getattr(business, "upi_vpa", "") or "",
            payee_name=business.display_name,
            amount=amount,
            note=note,
            currency=business.currency or "INR",
        )
        return success_response(
            {
                "upi_vpa": getattr(business, "upi_vpa", "") or "",
                "payment_qr_url": getattr(business, "payment_qr_url", "") or "",
                "upi_pay_url": url,
            }
        )


class MobileShopReferralView(APIView):
    permission_classes = [AllowAny]
    referrals = CustomerReferralService()

    @extend_schema(tags=["Mobile Shop"])
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
        program = self.referrals.public_program(business=business)
        payload: dict = {
            **program,
            "code": None,
            "stats": {"invited": 0, "pending": 0, "rewarded": 0, "points_earned": 0},
            "referrals": [],
            "applied_code": None,
            "applied_status": None,
        }
        user = getattr(request, "user", None)
        if not program["enabled"] or user is None or not getattr(user, "is_authenticated", False):
            return success_response(payload)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=user)
        code_row = self.referrals.get_or_create_code(
            tenant=tenant, business=business, customer=customer
        )
        made = list(
            self.referrals.list_referrals_made(tenant=tenant, business=business, customer=customer)[:40]
        )
        received = self.referrals.get_received_referral(
            tenant=tenant, business=business, customer=customer
        )
        rewarded = [row for row in made if row.status == "rewarded"]
        pending = [row for row in made if row.status in {"pending", "qualified"}]
        points_earned = sum(int((row.metadata or {}).get("points_awarded") or 0) for row in rewarded)
        payload.update(
            {
                "code": code_row.code,
                "stats": {
                    "invited": len(made),
                    "pending": len(pending),
                    "rewarded": len(rewarded),
                    "points_earned": points_earned,
                },
                "referrals": CustomerReferralSerializer(made, many=True).data,
                "applied_code": (received.metadata or {}).get("code") if received else None,
                "applied_status": received.status if received else None,
            }
        )
        return success_response(payload)


class MobileShopReferralApplyView(APIView):
    permission_classes = [IsAuthenticated]
    referrals = CustomerReferralService()

    @extend_schema(tags=["Mobile Shop"])
    def post(self, request: Request) -> Response:
        serializer = MobileDiscoverQuerySerializer(
            data={
                "tenant_slug": request.data.get("tenant_slug"),
                "business_code": request.data.get("business_code"),
            }
        )
        serializer.is_valid(raise_exception=True)
        try:
            tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        customer = ensure_customer_for_user(tenant=tenant, business=business, user=request.user)
        code = str(request.data.get("referral_code") or request.data.get("code") or "").strip()
        try:
            self.referrals.apply_code(
                tenant=tenant,
                business=business,
                referred=customer,
                code=code,
            )
        except DjangoValidationError as exc:
            raise _django_validation(exc) from exc
        request._request.GET = request._request.GET.copy()
        request._request.GET["tenant_slug"] = serializer.validated_data["tenant_slug"]
        request._request.GET["business_code"] = serializer.validated_data["business_code"]
        return MobileShopReferralView().get(request)
