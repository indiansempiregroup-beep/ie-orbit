"""Upsert open-source products into PlatformGtinCatalog (seed + shared helpers)."""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.shopie.models import (
    PlatformGtinCatalog,
    PlatformGtinImportRun,
    PlatformGtinImportRunStatus,
)
from apps.shopie.services.catalog_import.barcodes import canonical_barcode, is_valid_gtin
from apps.shopie.services.catalog_import.normalize import collect_images, distinct_product_details
from apps.shopie.services.catalog_import.open_food_facts import iter_off_products
from apps.shopie.services.categories import CategoryService
from apps.shopie.services.openmrp import iter_joined_openmrp_products

logger = logging.getLogger(__name__)


class PlatformCatalogImporter:
    """Reusable seed importer: OpenMRP dump + Open Food Facts, upsert by barcode."""

    categories = CategoryService()

    def run(
        self,
        *,
        source: str = "both",
        limit: int = 1000,
        dump_dir: str | Path | None = None,
        require_image: bool = True,
        dry_run: bool = False,
    ) -> PlatformGtinImportRun:
        source_key = (source or "both").strip().lower()
        if source_key not in {"openmrp", "off", "open_food_facts", "both"}:
            source_key = "both"
        if source_key == "off":
            source_key = "open_food_facts"

        run = PlatformGtinImportRun.objects.create(
            source=source_key,
            status=PlatformGtinImportRunStatus.RUNNING,
            limit=max(1, int(limit)),
            started_at=timezone.now(),
        )
        counters = {
            "total_source": 0,
            "valid": 0,
            "imported": 0,
            "updated": 0,
            "skipped": 0,
            "duplicates": 0,
            "invalid_barcodes": 0,
            "missing_barcodes": 0,
            "missing_images": 0,
            "missing_prices": 0,
            "missing_gst": 0,
        }
        errors: list[dict[str, str]] = []
        seen_codes: set[str] = set()
        remaining = run.limit

        try:
            streams: list[Iterable[dict[str, Any]]] = []
            if source_key in {"openmrp", "both"}:
                streams.append(
                    iter_joined_openmrp_products(
                        dump_dir=Path(dump_dir) if dump_dir else None,
                        download=True,
                    )
                )
            if source_key in {"open_food_facts", "both"}:
                streams.append(iter_off_products(limit=run.limit * 2))

            for stream in streams:
                if remaining <= 0:
                    break
                for row in stream:
                    counters["total_source"] += 1
                    try:
                        outcome = self._process_row(
                            row,
                            require_image=require_image,
                            dry_run=dry_run,
                            seen_codes=seen_codes,
                        )
                    except Exception as exc:  # noqa: BLE001 — continue seed
                        counters["skipped"] += 1
                        if len(errors) < 50:
                            errors.append(
                                {
                                    "code": str(row.get("code") or ""),
                                    "reason": f"exception:{exc}",
                                }
                            )
                        continue

                    reason = outcome.get("reason") or ""
                    if reason == "imported":
                        counters["valid"] += 1
                        counters["imported"] += 1
                        # Limit counts newly inserted products so re-runs can grow the catalog.
                        remaining -= 1
                    elif reason == "updated":
                        counters["valid"] += 1
                        counters["updated"] += 1
                        counters["duplicates"] += 1
                    else:
                        counters["skipped"] += 1
                        if reason == "invalid_barcode":
                            counters["invalid_barcodes"] += 1
                        elif reason == "missing_barcode":
                            counters["missing_barcodes"] += 1
                        elif reason == "missing_image":
                            counters["missing_images"] += 1
                        if len(errors) < 50 and reason:
                            errors.append(
                                {
                                    "code": str(row.get("code") or ""),
                                    "reason": reason,
                                }
                            )
                    if outcome.get("missing_price"):
                        counters["missing_prices"] += 1
                    if outcome.get("missing_gst"):
                        counters["missing_gst"] += 1
                    if remaining <= 0:
                        break

            run.status = PlatformGtinImportRunStatus.COMPLETED
        except Exception as exc:  # noqa: BLE001
            logger.exception("Platform catalog import failed")
            run.status = PlatformGtinImportRunStatus.FAILED
            errors.append({"code": "", "reason": f"fatal:{exc}"})

        for key, value in counters.items():
            setattr(run, key, value)
        run.error_sample = errors
        run.finished_at = timezone.now()
        run.metadata = {"dry_run": dry_run, "require_image": require_image}
        run.save()
        return run

    def _process_row(
        self,
        row: dict[str, Any],
        *,
        require_image: bool,
        dry_run: bool,
        seen_codes: set[str],
    ) -> dict[str, Any]:
        if not row.get("found"):
            skip = str(row.get("skip_reason") or "invalid")
            if skip == "missing_barcode":
                return {"reason": "missing_barcode"}
            return {"reason": skip}

        code = canonical_barcode(str(row.get("code") or ""))
        if not code:
            return {"reason": "missing_barcode"}
        if not is_valid_gtin(code):
            return {"reason": "invalid_barcode"}
        if code in seen_codes:
            return {"reason": "duplicate_batch", "missing_price": False, "missing_gst": True}
        seen_codes.add(code)

        images_meta = row.get("images") if isinstance(row.get("images"), dict) else {}
        gallery = collect_images(
            row.get("image_url"),
            row.get("front_image_url"),
            row.get("back_image_url"),
            images_meta.get("gallery") if isinstance(images_meta.get("gallery"), list) else [],
            images_meta.get("front"),
            images_meta.get("back"),
        )
        if require_image and not gallery:
            return {"reason": "missing_image"}

        name = str(row.get("name") or "").strip()
        if not name:
            return {"reason": "missing_name"}

        category_info = self.categories.resolve_from_enrichment(
            categories_raw=str(row.get("categories") or ""),
            preferred_label=str(row.get("category_label") or row.get("category") or ""),
        )

        try:
            mrp = Decimal(str(row.get("mrp") or "0") or "0")
        except (InvalidOperation, ValueError):
            mrp = Decimal("0.00")

        gst_raw = row.get("gst_rate")
        gst: Decimal | None
        if gst_raw in (None, "", "null"):
            gst = None
        else:
            try:
                gst = Decimal(str(gst_raw))
            except (InvalidOperation, ValueError):
                gst = None

        defaults = {
            "name": name[:200],
            "brand": str(row.get("brand") or "")[:120],
            "pack_size": str(row.get("pack_size") or "")[:80],
            "serving_size": str(row.get("serving_size") or "")[:80],
            "description": str(row.get("description") or "")[:5000],
            "details_html": distinct_product_details(
                str(row.get("description") or ""),
                str(row.get("details_html") or ""),
            )[:10000],
            "categories": str(row.get("categories") or category_info.get("categories") or "")[:500],
            "category": str(category_info.get("category") or "")[:64],
            "category_label": str(category_info.get("category_label") or "")[:120],
            "hsn_sac": str(row.get("hsn_sac") or "")[:16],
            "gst_rate": gst,
            "mrp": mrp,
            "currency": str(row.get("currency") or "")[:3],
            "image_url": (gallery[0] if gallery else "")[:1024],
            "images": {
                "front": gallery[0] if gallery else "",
                "back": gallery[1] if len(gallery) > 1 else "",
                "gallery": gallery[:5],
            },
            "source": str(row.get("source") or "")[:64],
            "confidence": str(row.get("confidence") or "medium")[:16],
            "payload": row.get("metadata") if isinstance(row.get("metadata"), dict) else {"raw": row},
        }

        missing_price = mrp <= 0
        missing_gst = gst is None

        if dry_run:
            existing = PlatformGtinCatalog.objects.filter(code=code).exists()
            return {
                "reason": "updated" if existing else "imported",
                "missing_price": missing_price,
                "missing_gst": missing_gst,
            }

        with transaction.atomic():
            _obj, created = PlatformGtinCatalog.objects.update_or_create(code=code, defaults=defaults)
        return {
            "reason": "imported" if created else "updated",
            "missing_price": missing_price,
            "missing_gst": missing_gst,
        }

    @staticmethod
    def quality_report() -> dict[str, Any]:
        total = PlatformGtinCatalog.objects.filter(deleted_at__isnull=True).count()
        if total == 0:
            return {
                "total_products": 0,
                "barcode_available_pct": 0,
                "price_available_pct": 0,
                "gst_available_pct": 0,
                "image_available_pct": 0,
                "description_available_pct": 0,
                "brand_available_pct": 0,
                "pack_size_available_pct": 0,
            }

        def pct(count: int) -> float:
            return round((count / total) * 100, 1)

        qs = PlatformGtinCatalog.objects.filter(deleted_at__isnull=True)
        return {
            "total_products": total,
            "barcode_available_pct": pct(qs.exclude(code="").count()),
            "price_available_pct": pct(qs.filter(mrp__gt=0).count()),
            "gst_available_pct": pct(qs.filter(gst_rate__isnull=False).count()),
            "image_available_pct": pct(qs.exclude(image_url="").count()),
            "description_available_pct": pct(qs.exclude(description="").count()),
            "brand_available_pct": pct(qs.exclude(brand="").count()),
            "pack_size_available_pct": pct(qs.exclude(pack_size="").count()),
        }

    @staticmethod
    def serialize_product(row: PlatformGtinCatalog) -> dict[str, Any]:
        images = row.images if isinstance(row.images, dict) else {}
        gallery = images.get("gallery") if isinstance(images.get("gallery"), list) else []
        gallery_urls = [str(item) for item in gallery if item][:5]
        if not gallery_urls and row.image_url:
            gallery_urls = [row.image_url]
        return {
            "id": str(row.id),
            "product_name": row.name,
            "brand": row.brand,
            "barcode": row.code,
            "pack_size": row.pack_size,
            "category": row.category_label or row.category,
            "category_slug": row.category,
            "price": str(row.mrp),
            "gst_percent": str(row.gst_rate) if row.gst_rate is not None else None,
            "currency": row.currency or "",
            "description_ingredients": row.description,
            "product_details": distinct_product_details(row.description, row.details_html),
            "image_url": row.image_url,
            "images": gallery_urls,
            "source": row.source,
            "hsn_sac": row.hsn_sac,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    @staticmethod
    def serialize_import_run(run: PlatformGtinImportRun) -> dict[str, Any]:
        return {
            "id": str(run.id),
            "source": run.source,
            "status": str(run.status),
            "limit": run.limit,
            "total_source": run.total_source,
            "valid": run.valid,
            "imported": run.imported,
            "updated": run.updated,
            "skipped": run.skipped,
            "duplicates": run.duplicates,
            "invalid_barcodes": run.invalid_barcodes,
            "missing_barcodes": run.missing_barcodes,
            "missing_images": run.missing_images,
            "missing_prices": run.missing_prices,
            "missing_gst": run.missing_gst,
            "error_sample": run.error_sample,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        }
