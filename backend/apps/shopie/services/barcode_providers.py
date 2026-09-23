"""Optional commercial / third-party barcode product APIs.

Configured via env (disabled when no key):
  BARCODE_API_PROVIDER = barcodelookup | upcitemdb | go_upc
  BARCODE_API_KEY      = provider API key / user key / bearer token
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

USER_AGENT = "IE-Orbit-ShopIE/1.0"
HTTP_TIMEOUT_SECONDS = 12

SUPPORTED_PROVIDERS = frozenset({"barcodelookup", "upcitemdb", "go_upc"})


def gtin_variants(code: str) -> list[str]:
    """Return plausible UPC/EAN/GTIN forms for the same product identity."""
    digits = "".join(ch for ch in (code or "") if ch.isdigit())
    if not digits:
        return []
    forms: list[str] = []
    for candidate in (
        digits,
        digits.lstrip("0") or "0",
        digits.zfill(12),
        digits.zfill(13),
        digits.zfill(14),
    ):
        if candidate not in forms and len(candidate) in {8, 12, 13, 14}:
            forms.append(candidate)
    return forms


def barcode_api_configured() -> bool:
    provider = (os.environ.get("BARCODE_API_PROVIDER") or "").strip().lower()
    key = (os.environ.get("BARCODE_API_KEY") or "").strip()
    return bool(provider in SUPPORTED_PROVIDERS and key)


def lookup_commercial_barcode(code: str) -> dict[str, Any] | None:
    """Return a normalized enrich-style dict or None when disabled/miss/error."""
    provider = (os.environ.get("BARCODE_API_PROVIDER") or "").strip().lower()
    key = (os.environ.get("BARCODE_API_KEY") or "").strip()
    if provider not in SUPPORTED_PROVIDERS or not key:
        return None

    for digits in gtin_variants(code):
        try:
            if provider == "barcodelookup":
                raw = _fetch_barcodelookup(digits, key)
            elif provider == "upcitemdb":
                raw = _fetch_upcitemdb(digits, key)
            else:
                raw = _fetch_go_upc(digits, key)
        except Exception as exc:  # noqa: BLE001 — never break enrich on provider failure
            logger.info("Commercial barcode API (%s) failed for %s: %s", provider, digits, exc)
            continue

        if not raw or not str(raw.get("name") or "").strip():
            continue
        return {
            "found": True,
            "code": digits if len(digits) >= 12 else code,
            "source": f"commercial_{provider}",
            "sku": digits,
            "name": str(raw.get("name") or "")[:200],
            "brand": str(raw.get("brand") or "")[:120],
            "pack_size": str(raw.get("pack_size") or "")[:80],
            "serving_size": "",
            "description": str(raw.get("description") or "")[:2000],
            "details_html": "",
            "categories": str(raw.get("categories") or "")[:500],
            "category": "",
            "category_label": "",
            "hsn_sac": "",
            "gst_rate": "0",
            "mrp": str(raw.get("mrp") or "0"),
            "image_url": str(raw.get("image_url") or "")[:1024],
            "front_image_url": str(raw.get("image_url") or "")[:1024],
            "back_image_url": "",
            "images": {
                "front": str(raw.get("image_url") or ""),
                "back": "",
                "gallery": [str(raw.get("image_url") or "")] if raw.get("image_url") else [],
            },
            "confidence": "medium",
            "needs_pack_photo": not bool(raw.get("image_url")),
            "message": "Filled from a barcode data provider. Review price and stock, then save.",
            "metadata": {"enrichment_source": f"commercial_{provider}", "provider": provider},
        }
    return None


def _http_json(url: str, *, headers: dict[str, str] | None = None) -> dict[str, Any] | list[Any] | None:
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_barcodelookup(code: str, key: str) -> dict[str, Any] | None:
    # https://www.barcodelookup.com/api
    query = urllib.parse.urlencode({"barcode": code, "formatted": "y", "key": key})
    payload = _http_json(f"https://api.barcodelookup.com/v3/products?{query}")
    if not isinstance(payload, dict):
        return None
    products = payload.get("products") or []
    if not products:
        return None
    product = products[0] if isinstance(products[0], dict) else {}
    images = product.get("images") if isinstance(product.get("images"), list) else []
    image_url = ""
    for item in images:
        if isinstance(item, str) and item.strip():
            image_url = item.strip()
            break
        if isinstance(item, dict) and item.get("url"):
            image_url = str(item["url"]).strip()
            break
    stores = product.get("stores") if isinstance(product.get("stores"), list) else []
    mrp = "0"
    for store in stores:
        if not isinstance(store, dict):
            continue
        price = store.get("price") or store.get("sale_price")
        if price not in (None, ""):
            mrp = str(price).replace("$", "").replace(",", "").strip()
            break
    category = product.get("category") or product.get("category_path") or ""
    if isinstance(category, list):
        category = " > ".join(str(x) for x in category if x)
    return {
        "name": product.get("title") or product.get("description") or "",
        "brand": product.get("brand") or product.get("manufacturer") or "",
        "description": product.get("description") or product.get("features") or "",
        "categories": str(category),
        "pack_size": product.get("size") or product.get("weight") or "",
        "image_url": image_url,
        "mrp": mrp,
    }


def _fetch_upcitemdb(code: str, key: str) -> dict[str, Any] | None:
    # https://www.upcitemdb.com/api/explorer#!/lookup/get_trial_lookup
    # Paid: /prod/v1/lookup with user_key header. Trial: /prod/trial/lookup (key ignored).
    use_trial = key.lower() in {"trial", "free"}
    path = "trial" if use_trial else "v1"
    url = f"https://api.upcitemdb.com/prod/{path}/lookup?upc={urllib.parse.quote(code)}"
    headers = {} if use_trial else {"user_key": key, "key_type": "3scale"}
    try:
        payload = _http_json(url, headers=headers)
    except urllib.error.HTTPError as exc:
        # Some plans use Authorization header instead.
        if exc.code in {401, 403} and not use_trial:
            payload = _http_json(url, headers={"Authorization": f"Bearer {key}"})
        else:
            raise
    if not isinstance(payload, dict):
        return None
    items = payload.get("items") or []
    if not items:
        return None
    item = items[0] if isinstance(items[0], dict) else {}
    images = item.get("images") if isinstance(item.get("images"), list) else []
    image_url = str(images[0]).strip() if images else ""
    return {
        "name": item.get("title") or "",
        "brand": item.get("brand") or "",
        "description": item.get("description") or "",
        "categories": item.get("category") or "",
        "pack_size": item.get("size") or "",
        "image_url": image_url,
        "mrp": str(item.get("lowest_recorded_price") or item.get("highest_recorded_price") or "0"),
    }


def _fetch_go_upc(code: str, key: str) -> dict[str, Any] | None:
    # https://go-upc.com/api
    url = f"https://go-upc.com/api/v1/code/{urllib.parse.quote(code)}"
    payload = _http_json(url, headers={"Authorization": f"Bearer {key}"})
    if not isinstance(payload, dict):
        return None
    product = payload.get("product") if isinstance(payload.get("product"), dict) else payload
    if not product.get("name") and not product.get("title"):
        return None
    image_url = str(product.get("imageUrl") or product.get("image_url") or "").strip()
    return {
        "name": product.get("name") or product.get("title") or "",
        "brand": product.get("brand") or product.get("manufacturer") or "",
        "description": product.get("description") or "",
        "categories": product.get("category") or "",
        "pack_size": product.get("specs", {}).get("size")
        if isinstance(product.get("specs"), dict)
        else product.get("size") or "",
        "image_url": image_url,
        "mrp": "0",
    }
