from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.request import Request

from apps.businesses.constants import (
    DOCUMENT_TYPE_FEATURES,
    FEATURE_SHOPIE_BOOKS_SALE,
    FEATURE_SHOPIE_BOOKS_STOCK,
    FEATURE_SHOPIE_ORDERS,
    FEATURE_SHOPIE_POS,
    FEATURE_SHOPIE_PRODUCTS,
    PRODUCT_SHOPIE,
    SHOPIE_BOOKS_FEATURES,
    VOUCHER_TYPE_FEATURES,
)
from apps.businesses.models import Branch, BranchStatus, Business
from apps.businesses.services.entitlements import EntitlementService

CATALOG_FEATURES = (FEATURE_SHOPIE_PRODUCTS, FEATURE_SHOPIE_POS, FEATURE_SHOPIE_ORDERS)
POS_SCAN_FEATURES = (FEATURE_SHOPIE_PRODUCTS, FEATURE_SHOPIE_POS)
STOCK_FEATURES = (FEATURE_SHOPIE_BOOKS_STOCK, FEATURE_SHOPIE_PRODUCTS)
INVOICE_FEATURES = (FEATURE_SHOPIE_BOOKS_SALE, FEATURE_SHOPIE_ORDERS, FEATURE_SHOPIE_POS)

_entitlements = EntitlementService()


def require_business(
    request: Request,
    business_id,
    *,
    feature: str | None = None,
    features: list[str] | tuple[str, ...] | None = None,
) -> Business:
    business = get_object_or_404(Business, tenant=request.current_tenant, id=business_id)
    if features:
        _entitlements.ensure_any_feature(
            business=business,
            features=features,
            product_code=PRODUCT_SHOPIE,
        )
    elif feature:
        _entitlements.ensure_feature(
            business=business,
            feature=feature,
            product_code=PRODUCT_SHOPIE,
        )
    return business


def require_business_with_offices(
    request: Request,
    business_id,
    *,
    feature: str,
) -> Business:
    """Resolve a business for stock-location endpoints.

    Shops running more than one office need to move stock between them even
    without the premium godowns feature, because order routing picks the source
    office from those per-office quantities.
    """
    business = get_object_or_404(Business, tenant=request.current_tenant, id=business_id)
    if Branch.objects.filter(business=business, status=BranchStatus.ACTIVE).count() > 1:
        return business
    _entitlements.ensure_feature(
        business=business,
        feature=feature,
        product_code=PRODUCT_SHOPIE,
    )
    return business


def require_shopie_feature(business: Business, feature: str) -> None:
    _entitlements.ensure_feature(business=business, feature=feature, product_code=PRODUCT_SHOPIE)


def require_any_shopie_feature(business: Business, features: list[str] | tuple[str, ...]) -> None:
    _entitlements.ensure_any_feature(
        business=business,
        features=features,
        product_code=PRODUCT_SHOPIE,
    )


def require_voucher_feature(business: Business, voucher_type: str | None) -> None:
    keys = VOUCHER_TYPE_FEATURES.get(str(voucher_type or "").strip().lower())
    if keys:
        require_any_shopie_feature(business, keys)
        return
    require_any_shopie_feature(business, SHOPIE_BOOKS_FEATURES)


def require_document_feature(business: Business, doc_type: str | None) -> None:
    feature = DOCUMENT_TYPE_FEATURES.get(str(doc_type or "").strip().lower())
    if feature:
        require_shopie_feature(business, feature)
        return
    require_any_shopie_feature(
        business,
        tuple(DOCUMENT_TYPE_FEATURES.values()),
    )
