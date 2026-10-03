from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api.responses import success_response
from apps.shopie.api.access import CATALOG_FEATURES, require_business
from apps.shopie.api.permissions import ShopAccessPermission
from apps.shopie.api.serializers import (
    ShopMasterEnsureSerializer,
    ShopMasterWriteSerializer,
)
from apps.shopie.models import ShopMasterKind, ShopMasterRecord
from apps.shopie.services.masters import MasterService


def _kind_or_400(kind: str) -> str:
    allowed = {choice.value for choice in ShopMasterKind}
    if kind not in allowed:
        raise ValidationError({"kind": f"Must be one of: {', '.join(sorted(allowed))}."})
    return kind


class ShopMasterListCreateView(APIView):
    permission_classes = [ShopAccessPermission]
    masters = MasterService()

    def get(self, request: Request, kind: str) -> Response:
        kind = _kind_or_400(kind)
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = require_business(request, business_id, features=CATALOG_FEATURES)
        include_inactive = str(request.query_params.get("include_inactive") or "").lower() in {
            "1",
            "true",
            "yes",
        }
        items = self.masters.list_records(
            tenant=request.current_tenant,
            business=business,
            kind=kind,
            include_inactive=include_inactive,
        )
        return success_response({"items": items, "kind": kind})

    @extend_schema(request=ShopMasterEnsureSerializer)
    def post(self, request: Request, kind: str) -> Response:
        kind = _kind_or_400(kind)
        serializer = ShopMasterEnsureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = require_business(request, data["business_id"], features=CATALOG_FEATURES)
        try:
            row = self.masters.create(
                tenant=request.current_tenant,
                business=business,
                kind=kind,
                label=data["label"],
                slug=data.get("slug") or "",
                value=data.get("value") or "",
            )
        except ValueError as exc:
            raise ValidationError({"label": str(exc)}) from exc
        return success_response(self.masters.serialize(row), status_code=status.HTTP_201_CREATED)


class ShopMasterDetailView(APIView):
    permission_classes = [ShopAccessPermission]
    masters = MasterService()

    def _get_record(self, request: Request, kind: str, record_id) -> ShopMasterRecord:
        kind = _kind_or_400(kind)
        record = get_object_or_404(
            ShopMasterRecord.all_objects.filter(deleted_at__isnull=True),
            tenant=request.current_tenant,
            kind=kind,
            id=record_id,
        )
        return record

    def patch(self, request: Request, kind: str, record_id) -> Response:
        record = self._get_record(request, kind, record_id)
        business = require_business(request, record.business_id, features=CATALOG_FEATURES)
        serializer = ShopMasterWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            row = self.masters.update(
                tenant=request.current_tenant,
                business=business,
                record=record,
                data=serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        except DjangoValidationError as exc:
            if hasattr(exc, "message_dict"):
                raise ValidationError(exc.message_dict) from exc
            raise ValidationError({"detail": "; ".join(exc.messages)}) from exc
        return success_response(self.masters.serialize(row))

    def delete(self, request: Request, kind: str, record_id) -> Response:
        record = self._get_record(request, kind, record_id)
        business = require_business(request, record.business_id, features=CATALOG_FEATURES)
        try:
            self.masters.delete(
                tenant=request.current_tenant,
                business=business,
                record=record,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return success_response({"deleted": True})
