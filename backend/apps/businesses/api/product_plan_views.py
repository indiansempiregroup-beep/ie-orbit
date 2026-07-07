from __future__ import annotations

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.api.serializers import ProductPlanSerializer
from apps.businesses.services import ProductBillingService
from apps.common.api.responses import success_response


class ProductPlanListView(APIView):
    permission_classes = [BusinessAccessPermission]
    billing_service = ProductBillingService()

    @extend_schema(
        tags=["Businesses"],
        parameters=[
            OpenApiParameter(
                "product_code",
                str,
                description="Filter plans for a single product code.",
            ),
        ],
        responses={200: ProductPlanSerializer(many=True)},
        description="List available billing plans for platform products.",
    )
    def get(self, request: Request) -> Response:
        product_code = request.query_params.get("product_code")
        plans = self.billing_service.list_product_plans(
            product_code=product_code.strip() if isinstance(product_code, str) and product_code else None,
        )
        return success_response(
            ProductPlanSerializer(plans, many=True).data,
            request_id=getattr(request, "request_id", None),
        )
