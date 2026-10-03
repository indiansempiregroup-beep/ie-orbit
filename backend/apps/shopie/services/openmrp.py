"""OpenMRP live barcode lookup and dump download helpers.

Live API: https://api.openmrp.in/v1/product/{barcode}
Dump:     https://api.openmrp.in/v1/dump/file/{name}

Optional free developer key via OPENMRP_API_KEY (X-Api-Key). Dumps need no key.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import urllib.error
import urllib.request
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator

from apps.shopie.services.catalog_import.barcodes import canonical_barcode
from apps.shopie.services.catalog_import.normalize import (
    build_product_details,
    clean_text,
    collect_images,
    pack_size_from_parts,
    parse_mrp_paise,
)

logger = logging.getLogger(__name__)

USER_AGENT = "IE-Orbit-ShopIE/1.0 (OpenMRP catalog; +https://ie-orbit.com)"
OPENMRP_API_BASE = (os.environ.get("OPENMRP_API_BASE") or "https://api.openmrp.in").rstrip("/")
HTTP_TIMEOUT_SECONDS = 8


def _api_key() -> str:
    return (os.environ.get("OPENMRP_API_KEY") or "").strip()


def _headers(*, accept: str = "application/json") -> dict[str, str]:
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    key = _api_key()
    if key:
        headers["X-Api-Key"] = key
    return headers


def _http_get(url: str, *, accept: str = "application/json") -> bytes | None:
    request = urllib.request.Request(url, headers=_headers(accept=accept))
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return response.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.info("OpenMRP HTTP failed for %s: %s", url, exc)
        return None


def lookup_openmrp_barcode(code: str) -> dict[str, Any] | None:
    """Return enrich-style dict for a barcode, or None on miss/error."""
    barcode = canonical_barcode(code) or "".join(ch for ch in str(code or "") if ch.isdigit())
    if not barcode:
        return None

    # Try a few common path shapes; OpenMRP docs use /v1/product/{barcode}.
    for path in (
        f"/v1/product/{barcode}",
        f"/v1/products/{barcode}",
        f"/v1/resolve/{barcode}",
    ):
        raw = _http_get(f"{OPENMRP_API_BASE}{path}")
        if not raw:
            continue
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        mapped = _map_live_payload(barcode, payload)
        if mapped and mapped.get("found") and mapped.get("name"):
            return mapped
    return None


def _map_live_payload(barcode: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    # Accept nested {product, variant, brand} or flat product objects.
    product = payload.get("product") if isinstance(payload.get("product"), dict) else payload
    variant = payload.get("variant") if isinstance(payload.get("variant"), dict) else {}
    brand_obj = payload.get("brand") if isinstance(payload.get("brand"), dict) else {}
    if payload.get("found") is False or payload.get("error"):
        return None

    name = clean_text(
        product.get("name")
        or product.get("product_name")
        or payload.get("name")
        or "",
        max_len=200,
    )
    if not name:
        return None

    brand = clean_text(
        brand_obj.get("name") or product.get("brand") or product.get("brand_name") or "",
        max_len=120,
    )
    pack = pack_size_from_parts(
        label=str(variant.get("label") or product.get("pack_size") or ""),
        size=variant.get("pack_size") or product.get("pack_size_value"),
        unit=str(variant.get("unit") or product.get("unit") or ""),
    )
    mrp = parse_mrp_paise(variant.get("mrp_paise") or product.get("mrp_paise") or payload.get("mrp_paise"))
    if mrp is None:
        raw_mrp = product.get("mrp") or payload.get("mrp")
        if raw_mrp not in (None, ""):
            try:
                mrp = Decimal(str(raw_mrp).replace(",", "").replace("₹", "").strip())
            except Exception:  # noqa: BLE001
                mrp = None

    images = collect_images(
        product.get("image_url"),
        product.get("image"),
        payload.get("image_url"),
        (payload.get("images") or []) if isinstance(payload.get("images"), list) else [],
    )
    food_type = clean_text(product.get("food_type") or "", max_len=40)
    category_raw = clean_text(product.get("category") or "", max_len=500)
    hsn = clean_text(product.get("hsn_code") or product.get("hsn") or "", max_len=16)
    details = build_product_details(
        f"Food type: {food_type}" if food_type and food_type.lower() != "none" else "",
        category_raw,
        f"HSN {hsn}" if hsn else "",
    )
    description = clean_text(product.get("description") or product.get("ingredients") or "", max_len=5000)

    return {
        "found": True,
        "code": barcode,
        "source": "openmrp",
        "sku": barcode,
        "name": name,
        "brand": brand,
        "pack_size": pack,
        "serving_size": "",
        "description": description,
        "details_html": details,
        "categories": category_raw,
        "category": "",
        "category_label": "",
        "hsn_sac": hsn,
        "gst_rate": None,
        "mrp": str(mrp) if mrp is not None else "0",
        "currency": "INR",
        "image_url": images[0] if images else "",
        "front_image_url": images[0] if images else "",
        "back_image_url": images[1] if len(images) > 1 else "",
        "images": {
            "front": images[0] if images else "",
            "back": images[1] if len(images) > 1 else "",
            "gallery": images,
        },
        "confidence": "high",
        "needs_pack_photo": len(images) == 0,
        "metadata": {
            "enrichment_source": "openmrp",
            "source_product_id": str(product.get("id") or ""),
            "source_variant_id": str(variant.get("id") or ""),
            "food_type": food_type,
        },
    }


def download_dump_csv(name: str, *, dest_dir: Path | None = None) -> Path | None:
    """Download a dump CSV to dest_dir (or temp under /tmp). Returns path or None."""
    filename = name if name.endswith(".csv") else f"{name}.csv"
    url = f"{OPENMRP_API_BASE}/v1/dump/file/{filename}"
    raw = _http_get(url, accept="text/csv,application/octet-stream,*/*")
    if not raw:
        return None
    target_dir = dest_dir or Path("/tmp/ie-orbit-openmrp")
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / filename
    path.write_bytes(raw)
    return path


def load_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        return [{k: (v or "") for k, v in row.items()} for row in reader]


def iter_joined_openmrp_products(
    *,
    dump_dir: Path | None = None,
    download: bool = True,
) -> Iterator[dict[str, Any]]:
    """Yield normalized enrich-style product dicts from OpenMRP dump CSVs."""
    base = dump_dir or Path("/tmp/ie-orbit-openmrp")
    paths: dict[str, Path] = {}
    for table in ("brands", "products", "variants"):
        local = base / f"{table}.csv"
        if local.exists():
            paths[table] = local
        elif download:
            fetched = download_dump_csv(table, dest_dir=base)
            if fetched:
                paths[table] = fetched
        if table not in paths:
            logger.warning("OpenMRP dump missing %s.csv", table)
            return

    brands = {row.get("id", ""): row for row in load_csv_rows(paths["brands"])}
    products = {row.get("id", ""): row for row in load_csv_rows(paths["products"])}

    for variant in load_csv_rows(paths["variants"]):
        product = products.get(variant.get("product_id", "")) or {}
        brand = brands.get(product.get("brand_id", "")) or {}
        barcode = canonical_barcode(variant.get("barcode") or "")
        name = clean_text(product.get("name") or "", max_len=200)
        if not barcode or not name:
            yield {
                "found": False,
                "skip_reason": "missing_barcode" if not barcode else "missing_name",
                "code": variant.get("barcode") or "",
                "raw": variant,
            }
            continue

        images = collect_images(product.get("image_url"))
        mrp = parse_mrp_paise(variant.get("mrp_paise"))
        food_type = clean_text(product.get("food_type") or "", max_len=40)
        category_raw = clean_text(product.get("category") or "", max_len=500)
        hsn = clean_text(product.get("hsn_code") or "", max_len=16)
        pack = pack_size_from_parts(
            label=variant.get("label") or "",
            size=variant.get("pack_size"),
            unit=variant.get("unit") or "",
        )
        yield {
            "found": True,
            "code": barcode,
            "source": "openmrp",
            "sku": barcode,
            "name": name,
            "brand": clean_text(brand.get("name") or "", max_len=120),
            "pack_size": pack,
            "serving_size": "",
            "description": "",
            "details_html": build_product_details(
                f"Food type: {food_type}" if food_type and food_type.lower() != "none" else "",
                category_raw,
                f"HSN {hsn}" if hsn else "",
            ),
            "categories": category_raw,
            "category": "",
            "category_label": "",
            "hsn_sac": hsn,
            "gst_rate": None,
            "mrp": str(mrp) if mrp is not None else "0",
            "currency": "INR",
            "image_url": images[0] if images else "",
            "front_image_url": images[0] if images else "",
            "back_image_url": "",
            "images": {"front": images[0] if images else "", "back": "", "gallery": images},
            "confidence": "high",
            "needs_pack_photo": len(images) == 0,
            "metadata": {
                "enrichment_source": "openmrp",
                "source_product_id": product.get("id") or "",
                "source_variant_id": variant.get("id") or "",
                "food_type": food_type,
            },
        }
