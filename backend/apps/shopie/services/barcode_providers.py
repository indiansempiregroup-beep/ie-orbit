"""Optional commercial / third-party barcode product APIs.

Configured via env (disabled when no key):
  BARCODE_API_PROVIDER = barcodelookup | upcitemdb | go_upc
  BARCODE_API_KEY      = provider API key / user key / bearer token

Free providers (no key):
  - Datakick / gtinsearch.org open product API (GTIN-14 lookup)
  - public Go-UPC product page scrape for retail GTINs that Open*Facts
    and trial UPC APIs often miss (common for Indian EANs)
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

USER_AGENT = "IE-Orbit-ShopIE/1.0 (product enrichment)"
HTTP_TIMEOUT_SECONDS = 12

SUPPORTED_PROVIDERS = frozenset({"barcodelookup", "upcitemdb", "go_upc"})
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


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


def lookup_datakick_barcode(code: str) -> dict[str, Any] | None:
    """Free Datakick (gtinsearch.org) lookup. No API key required.

    Datakick stores GTIN-14 (zero-padded). Returns enrich-style dict or None.
    """
    tried: set[str] = set()
    for digits in gtin_variants(code):
        candidates = [digits]
        if len(digits) < 14:
            candidates.append(digits.zfill(14))
        for candidate in candidates:
            if candidate in tried or len(candidate) not in {8, 12, 13, 14}:
                continue
            tried.add(candidate)
            try:
                raw = _fetch_datakick(candidate)
            except Exception as exc:  # noqa: BLE001 — never break enrich on provider failure
                logger.info("Datakick lookup failed for %s: %s", candidate, exc)
                continue
            if not raw or not str(raw.get("name") or "").strip():
                continue
            gtin14 = str(raw.get("gtin14") or candidate)
            # Prefer a non-padded retail form for the shop form when possible.
            display_code = digits if len(digits) in {8, 12, 13} else gtin14.lstrip("0") or gtin14
            if len(display_code) < 8:
                display_code = gtin14
            pack = str(raw.get("size") or raw.get("pack_size") or "")[:80]
            ingredients = str(raw.get("ingredients") or "")[:5000]
            serving = str(raw.get("serving_size") or "")[:80]
            # Keep attributes in details; pack size has its own field — don't duplicate.
            details = ""
            if serving and serving.lower() != pack.lower():
                details = f"Serving size: {serving}"
            return {
                "found": True,
                "code": display_code,
                "source": "datakick",
                "sku": display_code,
                "name": str(raw.get("name") or "")[:200],
                "brand": str(raw.get("brand_name") or raw.get("brand") or "")[:120],
                "pack_size": pack,
                "serving_size": serving,
                "description": ingredients,
                "details_html": details[:2000],
                "categories": str(raw.get("categories") or "")[:500],
                "category": "",
                "category_label": "",
                "hsn_sac": "",
                "gst_rate": None,
                "mrp": "0",
                "currency": "",
                "image_url": "",
                "front_image_url": "",
                "back_image_url": "",
                "images": {"front": "", "back": "", "gallery": []},
                "confidence": "medium",
                "needs_pack_photo": True,
                "message": (
                    "Filled from Datakick (open product database). "
                    "Review details — add a pack photo if available — then save."
                ),
                "metadata": {
                    "enrichment_source": "datakick",
                    "source_product_id": str(raw.get("id") or ""),
                    "gtin14": gtin14,
                },
            }
    return None


def _fetch_datakick(code: str) -> dict[str, Any] | None:
    """GET https://www.gtinsearch.org/api/items/{gtin} — returns list or object."""
    url = f"https://www.gtinsearch.org/api/items/{urllib.parse.quote(code)}"
    payload = _http_json(url)
    item: dict[str, Any] | None = None
    if isinstance(payload, list):
        for row in payload:
            if isinstance(row, dict) and str(row.get("name") or "").strip():
                item = row
                break
    elif isinstance(payload, dict):
        # Some hosts return {message, exception} on miss.
        if payload.get("exception") or payload.get("error"):
            return None
        if str(payload.get("name") or "").strip():
            item = payload
    return item


def lookup_public_barcode(code: str) -> dict[str, Any] | None:
    """Free public-page fallback (Go-UPC) when Open*Facts / commercial APIs miss."""
    for digits in gtin_variants(code):
        try:
            raw = _fetch_go_upc_public(digits)
        except Exception as exc:  # noqa: BLE001 — never break enrich on scrape failure
            logger.info("Public Go-UPC lookup failed for %s: %s", digits, exc)
            continue
        if not raw or not str(raw.get("name") or "").strip():
            continue
        image_url = str(raw.get("image_url") or "").strip()
        return {
            "found": True,
            "code": digits if len(digits) >= 12 else code,
            "source": "public_go_upc",
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
            "mrp": "0",
            "image_url": image_url[:1024],
            "front_image_url": image_url[:1024],
            "back_image_url": "",
            "images": {
                "front": image_url,
                "back": "",
                "gallery": [image_url] if image_url else [],
            },
            "confidence": "medium",
            "needs_pack_photo": not bool(image_url),
            "message": "Filled from an online product database. Review price and stock, then save.",
            "metadata": {"enrichment_source": "public_go_upc", "provider": "go_upc_public"},
        }
    return None


def _strip_html(value: str) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", value or "")).replace("&amp;", "&").strip()


def _fetch_go_upc_public(code: str) -> dict[str, Any] | None:
    """Parse the public Go-UPC HTML product page (no API key)."""
    url = f"https://go-upc.com/search?q={urllib.parse.quote(code)}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; IE-Orbit-ShopIE/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        html = response.read().decode("utf-8", errors="replace")

    # Confirm the page is for this GTIN (avoid search-miss landing pages).
    if code not in html:
        return None

    title = ""
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    if h1:
        title = _strip_html(h1.group(1))
    if not title:
        title_tag = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
        if title_tag:
            title = _strip_html(title_tag.group(1)).split("—")[0].split("|")[0].strip()
    if not title or title.lower() in {"go-upc", "search", "not found"}:
        return None

    fields: dict[str, str] = {}
    for label, value in re.findall(
        r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>",
        html,
        re.I | re.S,
    ):
        key = _strip_html(label).lower()
        val = _strip_html(value)
        if key and val:
            fields[key] = val

    brand = fields.get("brand") or fields.get("manufacturer") or ""
    category = fields.get("category") or fields.get("categories") or ""
    pack_size = fields.get("size") or fields.get("quantity") or fields.get("volume") or ""
    # Infer pack size from title when the table omits it (e.g. "…, 30 Ml").
    if not pack_size:
        size_match = re.search(
            r"(\d+(?:[.,]\d+)?\s*(?:ml|mL|l|L|g|kg|oz|pcs?|tabs?|tablets?|caps?))\b",
            title,
            re.I,
        )
        if size_match:
            pack_size = size_match.group(1).strip()

    image_url = ""
    for src in re.findall(r'<img[^>]+src="([^"]+)"', html, re.I):
        if "go-upc" in src and "/images/" in src:
            image_url = src.strip()
            break

    return {
        "name": title[:200],
        "brand": brand[:120],
        "description": "",
        "categories": category[:500],
        "pack_size": pack_size[:80],
        "image_url": image_url[:1024],
        "mrp": "0",
    }


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
