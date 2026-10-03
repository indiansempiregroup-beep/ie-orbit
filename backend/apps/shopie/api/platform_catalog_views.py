from __future__ import annotations

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import IsPlatformAdmin
from apps.common.api.responses import success_response
from apps.shopie.models import PlatformGtinCatalog, PlatformGtinImportRun
from apps.shopie.services.catalog_import.importer import PlatformCatalogImporter
from apps.shopie.services.catalog_import.barcodes import canonical_barcode
from apps.shopie.services.enrichment import ProductEnrichmentService


class PlatformProductCatalogListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        q = (request.query_params.get("q") or "").strip()
        category = (request.query_params.get("category") or "").strip()
        try:
            limit = min(max(int(request.query_params.get("limit") or 50), 1), 200)
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(int(request.query_params.get("offset") or 0), 0)
        except (TypeError, ValueError):
            offset = 0

        qs = PlatformGtinCatalog.objects.filter(deleted_at__isnull=True).order_by("name", "code")
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(brand__icontains=q)
                | Q(code__icontains=q)
                | Q(category__icontains=q)
                | Q(category_label__icontains=q)
            )
        if category:
            qs = qs.filter(Q(category=category) | Q(category_label__icontains=category))

        total = qs.count()
        rows = list(qs[offset : offset + limit])
        importer = PlatformCatalogImporter()
        return success_response(
            {
                "products": [importer.serialize_product(row) for row in rows],
                "total": total,
                "limit": limit,
                "offset": offset,
            },
            request_id=getattr(request, "request_id", None),
        )


class PlatformProductCatalogDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, product_id) -> Response:
        row = PlatformGtinCatalog.objects.filter(id=product_id, deleted_at__isnull=True).first()
        if not row:
            return success_response({"found": False}, request_id=getattr(request, "request_id", None))
        return success_response(
            {"found": True, "product": PlatformCatalogImporter.serialize_product(row)},
            request_id=getattr(request, "request_id", None),
        )


class PlatformProductCatalogBarcodeView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, barcode: str) -> Response:
        code = canonical_barcode(barcode) or "".join(ch for ch in barcode if ch.isdigit())
        if not code:
            return success_response(
                {"found": False, "barcode": barcode, "message": "Invalid barcode."},
                request_id=getattr(request, "request_id", None),
            )

        row = PlatformGtinCatalog.objects.filter(code=code, deleted_at__isnull=True).first()
        if not row:
            # Live hybrid fetch for admin preview (also caches into master).
            enrich = ProductEnrichmentService().enrich(code=code)
            if enrich.get("found"):
                row = PlatformGtinCatalog.objects.filter(code=code, deleted_at__isnull=True).first()
                if row:
                    return success_response(
                        {
                            "found": True,
                            "product": PlatformCatalogImporter.serialize_product(row),
                            "live": True,
                        },
                        request_id=getattr(request, "request_id", None),
                    )
            return success_response(
                {"found": False, "barcode": code, "message": enrich.get("message") or "Not found."},
                request_id=getattr(request, "request_id", None),
            )

        return success_response(
            {"found": True, "product": PlatformCatalogImporter.serialize_product(row), "live": False},
            request_id=getattr(request, "request_id", None),
        )


class PlatformProductCatalogQualityView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        importer = PlatformCatalogImporter()
        last_run = PlatformGtinImportRun.objects.order_by("-created_at").first()
        return success_response(
            {
                "quality": importer.quality_report(),
                "last_import": importer.serialize_import_run(last_run) if last_run else None,
            },
            request_id=getattr(request, "request_id", None),
        )


class PlatformProductCatalogImportView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def post(self, request: Request) -> Response:
        data = request.data if isinstance(request.data, dict) else {}
        source = str(data.get("source") or "both")
        try:
            limit = min(max(int(data.get("limit") or 1000), 1), 5000)
        except (TypeError, ValueError):
            limit = 1000
        require_image = data.get("require_image", True)
        dry_run = bool(data.get("dry_run"))
        dump_dir = str(data.get("dump_dir") or "").strip() or None

        run = PlatformCatalogImporter().run(
            source=source,
            limit=limit,
            dump_dir=dump_dir,
            require_image=bool(require_image),
            dry_run=dry_run,
        )
        return success_response(
            {
                "import": PlatformCatalogImporter.serialize_import_run(run),
                "quality": PlatformCatalogImporter.quality_report(),
            },
            request_id=getattr(request, "request_id", None),
        )


class PlatformProductCatalogImportsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        rows = list(PlatformGtinImportRun.objects.order_by("-created_at")[:30])
        return success_response(
            {"imports": [PlatformCatalogImporter.serialize_import_run(row) for row in rows]},
            request_id=getattr(request, "request_id", None),
        )
