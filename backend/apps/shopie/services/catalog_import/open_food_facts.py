"""Open Food Facts bulk/search helpers for optional catalog seed."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator

from apps.shopie.services.catalog_import.barcodes import canonical_barcode
from apps.shopie.services.catalog_import.normalize import (
    build_product_details,
    clean_text,
    collect_images,
    infer_pack_size,
    pack_size_from_parts,
)

logger = logging.getLogger(__name__)

USER_AGENT = "IE-Orbit-ShopIE/1.0 (catalog seed; +https://ie-orbit.com)"
SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
HTTP_TIMEOUT_SECONDS = 40


def _http_get_json(url: str, *, retries: int = 4) -> dict[str, Any] | None:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Language": "en",
        },
    )
    delay = 1.5
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {429, 502, 503, 504} and attempt + 1 < retries:
                time.sleep(delay)
                delay *= 1.8
                continue
            logger.info("Open Food Facts seed HTTP failed: %s", exc)
            return None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError) as exc:
            if attempt + 1 < retries:
                time.sleep(delay)
                delay *= 1.8
                continue
            logger.info("Open Food Facts seed HTTP failed: %s", exc)
            return None
    return None


def map_off_product(product: dict[str, Any]) -> dict[str, Any] | None:
    barcode = canonical_barcode(str(product.get("code") or ""))
    name = clean_text(
        product.get("product_name")
        or product.get("product_name_en")
        or product.get("generic_name")
        or "",
        max_len=200,
    )
    if not barcode or not name:
        return None

    brand = clean_text(str(product.get("brands") or "").split(",")[0], max_len=120)
    pack = pack_size_from_parts(
        label=str(product.get("quantity") or ""),
        size=product.get("product_quantity"),
        unit=str(product.get("product_quantity_unit") or ""),
    )
    pack = infer_pack_size(
        pack_size=pack,
        serving_size=str(product.get("serving_size") or ""),
        name=name,
        quantity=str(product.get("quantity") or ""),
    )
    ingredients = clean_text(
        product.get("ingredients_text") or product.get("ingredients_text_en") or "",
        max_len=5000,
    )
    categories = product.get("categories") or ""
    if isinstance(categories, list):
        categories = ", ".join(str(item) for item in categories if item)
    categories = clean_text(categories, max_len=500)

    labels = product.get("labels") or product.get("labels_tags") or ""
    if isinstance(labels, list):
        labels = ", ".join(str(item).replace("en:", "") for item in labels if item)
    labels = clean_text(labels, max_len=300)
    allergens = clean_text(product.get("allergens") or product.get("allergens_from_ingredients") or "", max_len=300)

    images = collect_images(
        product.get("image_front_url"),
        product.get("image_url"),
        product.get("image_front_large_url"),
        product.get("image_ingredients_url"),
        product.get("image_nutrition_url"),
        product.get("image_packaging_url"),
    )
    # selected_images nested structure
    selected = product.get("selected_images") if isinstance(product.get("selected_images"), dict) else {}
    extra_urls: list[str] = []
    for role in ("front", "ingredients", "nutrition", "packaging"):
        role_obj = selected.get(role) if isinstance(selected.get(role), dict) else {}
        display = role_obj.get("display") if isinstance(role_obj.get("display"), dict) else {}
        for lang_url in display.values():
            extra_urls.append(str(lang_url or ""))
    if extra_urls:
        images = collect_images(*images, *extra_urls)

    details = build_product_details(
        labels,
        f"Allergens: {allergens}" if allergens else "",
        clean_text(product.get("serving_size") or "", max_len=80),
        categories.split(",")[0].strip() if categories else "",
    )

    countries = clean_text(product.get("countries") or "", max_len=120)
    currency = "INR" if "india" in countries.lower() else ""

    return {
        "found": True,
        "code": barcode,
        "source": "open_food_facts",
        "sku": barcode,
        "name": name,
        "brand": brand,
        "pack_size": pack,
        "serving_size": clean_text(product.get("serving_size") or "", max_len=80),
        "description": ingredients or clean_text(product.get("generic_name") or "", max_len=2000),
        "details_html": details,
        "categories": categories,
        "category": "",
        "category_label": "",
        "hsn_sac": "",
        "gst_rate": None,
        "mrp": "0",
        "currency": currency,
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
            "enrichment_source": "open_food_facts",
            "source_product_id": barcode,
            "countries": countries,
        },
    }


def _search_pages(
    *,
    limit: int,
    extra_params: dict[str, str],
    start_page: int = 1,
    max_pages: int = 50,
) -> Iterator[dict[str, Any]]:
    page = max(1, start_page)
    end_page = page + max_pages - 1
    yielded = 0
    page_size = 50
    fields = (
        "code,product_name,product_name_en,generic_name,brands,quantity,serving_size,"
        "ingredients_text,ingredients_text_en,categories,labels,labels_tags,allergens,"
        "allergens_from_ingredients,countries,image_front_url,image_url,"
        "image_front_large_url,image_ingredients_url,image_nutrition_url,"
        "image_packaging_url,selected_images"
    )
    while yielded < limit and page <= end_page:
        params = {
            "action": "process",
            "json": "1",
            "page": str(page),
            "page_size": str(page_size),
            "fields": fields,
            **extra_params,
        }
        payload = _http_get_json(f"{SEARCH_URL}?{urllib.parse.urlencode(params)}")
        products = (payload or {}).get("products") or []
        if not products:
            break
        for product in products:
            if not isinstance(product, dict):
                continue
            mapped = map_off_product(product)
            if not mapped:
                continue
            # Seed path prefers products with at least one image.
            gallery = (mapped.get("images") or {}).get("gallery") if isinstance(mapped.get("images"), dict) else []
            if not gallery and not mapped.get("image_url"):
                continue
            yield mapped
            yielded += 1
            if yielded >= limit:
                return
        page += 1
        time.sleep(0.35)


def iter_off_products(*, limit: int = 1000, countries_tag: str = "en:india") -> Iterator[dict[str, Any]]:
    """Page through OFF search; prefer India + front photo, then broader fallbacks."""
    category_tags = (
        "en:snacks",
        "en:beverages",
        "en:dairies",
        "en:breakfasts",
        "en:plant-based-foods-and-beverages",
        "en:meals",
        "en:chocolates",
        "en:biscuits-and-cakes",
    )
    attempts: list[dict[str, str]] = [
        {
            "tagtype_0": "countries",
            "tag_contains_0": "contains",
            "tag_0": countries_tag,
            "tagtype_1": "states",
            "tag_contains_1": "contains",
            "tag_1": "en:front-photo-selected",
        },
        {
            "tagtype_0": "countries",
            "tag_contains_0": "contains",
            "tag_0": countries_tag,
        },
    ]
    for cat in category_tags:
        attempts.append(
            {
                "tagtype_0": "categories",
                "tag_contains_0": "contains",
                "tag_0": cat,
                "tagtype_1": "states",
                "tag_contains_1": "contains",
                "tag_1": "en:front-photo-selected",
            }
        )
    attempts.append(
        {
            "tagtype_0": "states",
            "tag_contains_0": "contains",
            "tag_0": "en:front-photo-selected",
        }
    )

    seen: set[str] = set()
    remaining = limit
    for index, extra in enumerate(attempts):
        if remaining <= 0:
            return
        # Rotate start page so re-runs discover new rows beyond the first pages.
        start_page = 1 + (index * 3)
        for mapped in _search_pages(
            limit=remaining,
            extra_params=extra,
            start_page=start_page,
            max_pages=30,
        ):
            code = str(mapped.get("code") or "")
            if not code or code in seen:
                continue
            seen.add(code)
            yield mapped
            remaining -= 1
            if remaining <= 0:
                return
