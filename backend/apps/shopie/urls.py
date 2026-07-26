from django.urls import path

from apps.shopie.api.extended_views import (
    ShopBarcodeBulkLookupView,
    ShopDeliveryMatchView,
    ShopDeliveryZoneDetailView,
    ShopDeliveryZoneListCreateView,
    ShopPetDetailView,
    ShopPetListCreateView,
    ShopReturnListCreateView,
    ShopSettingsView,
)
from apps.shopie.api.views import (
    ShopBarcodeEnrichView,
    ShopBarcodeLookupView,
    ShopInvoiceFromOrderView,
    ShopInvoiceListView,
    ShopOrderDetailView,
    ShopOrderListCreateView,
    ShopOrderSettlePaymentView,
    ShopOrderStatusView,
    ShopPackagingAnalyzeStatusView,
    ShopPackagingAnalyzeView,
    ShopProductDetailView,
    ShopProductListCreateView,
    ShopQuotationListCreateView,
    ShopStockAdjustView,
    ShopStockMovementListView,
)

urlpatterns = [
    path("shop/products", ShopProductListCreateView.as_view(), name="shop-product-list-create"),
    path("shop/products/<uuid:product_id>", ShopProductDetailView.as_view(), name="shop-product-detail"),
    path(
        "shop/products/<uuid:product_id>/stock-adjust",
        ShopStockAdjustView.as_view(),
        name="shop-stock-adjust",
    ),
    path("shop/barcodes/lookup", ShopBarcodeLookupView.as_view(), name="shop-barcode-lookup"),
    path("shop/barcodes/lookup-bulk", ShopBarcodeBulkLookupView.as_view(), name="shop-barcode-lookup-bulk"),
    path("shop/barcodes/enrich", ShopBarcodeEnrichView.as_view(), name="shop-barcode-enrich"),
    path(
        "shop/products/analyze-packaging",
        ShopPackagingAnalyzeView.as_view(),
        name="shop-packaging-analyze",
    ),
    path(
        "shop/products/analyze-packaging/<uuid:job_id>",
        ShopPackagingAnalyzeStatusView.as_view(),
        name="shop-packaging-analyze-status",
    ),
    path("shop/stock-movements", ShopStockMovementListView.as_view(), name="shop-stock-movements"),
    path("shop/orders", ShopOrderListCreateView.as_view(), name="shop-order-list-create"),
    path("shop/orders/<uuid:order_id>", ShopOrderDetailView.as_view(), name="shop-order-detail"),
    path(
        "shop/orders/<uuid:order_id>/status",
        ShopOrderStatusView.as_view(),
        name="shop-order-status",
    ),
    path(
        "shop/orders/<uuid:order_id>/settle-payment",
        ShopOrderSettlePaymentView.as_view(),
        name="shop-order-settle-payment",
    ),
    path(
        "shop/orders/<uuid:order_id>/invoice",
        ShopInvoiceFromOrderView.as_view(),
        name="shop-order-invoice",
    ),
    path("shop/returns", ShopReturnListCreateView.as_view(), name="shop-return-list-create"),
    path("shop/delivery-zones", ShopDeliveryZoneListCreateView.as_view(), name="shop-delivery-zone-list-create"),
    path("shop/delivery-zones/match", ShopDeliveryMatchView.as_view(), name="shop-delivery-zone-match"),
    path(
        "shop/delivery-zones/<uuid:zone_id>",
        ShopDeliveryZoneDetailView.as_view(),
        name="shop-delivery-zone-detail",
    ),
    path("shop/settings", ShopSettingsView.as_view(), name="shop-settings"),
    path("shop/pets", ShopPetListCreateView.as_view(), name="shop-pet-list-create"),
    path("shop/pets/<uuid:pet_id>", ShopPetDetailView.as_view(), name="shop-pet-detail"),
    path("shop/invoices", ShopInvoiceListView.as_view(), name="shop-invoice-list"),
    path("shop/quotations", ShopQuotationListCreateView.as_view(), name="shop-quotation-list-create"),
]
