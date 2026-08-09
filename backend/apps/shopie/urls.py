from django.urls import path

from apps.shopie.api.books_views import (
    ShopBooksDashboardView,
    ShopBooksReportView,
    ShopBooksVoucherDetailView,
    ShopBooksVoucherListCreateView,
    ShopBooksVoucherVoidView,
    ShopCashAccountDetailView,
    ShopCashAccountListCreateView,
    ShopPartyStatementView,
    ShopQuotationConvertToSaleView,
    ShopSupplierDetailView,
    ShopSupplierListCreateView,
)
from apps.shopie.api.compliance_views import (
    ShopComplianceSettingsView,
    ShopEWayCancelView,
    ShopEWayListView,
    ShopVoucherEInvoiceCancelView,
    ShopVoucherEInvoiceView,
    ShopVoucherEWayView,
)
from apps.shopie.api.extended_books_views import (
    ShopBooksDocumentConvertView,
    ShopBooksDocumentListCreateView,
    ShopChequeBounceView,
    ShopChequeClearView,
    ShopChequeListCreateView,
    ShopGodownListCreateView,
    ShopLoanListCreateView,
    ShopLoanRepaymentView,
    ShopStockTransferListCreateView,
)
from apps.shopie.api.extended_views import (
    ShopBarcodeBulkLookupView,
    ShopDeliveryMatchView,
    ShopDeliveryZoneDetailView,
    ShopDeliveryZoneListCreateView,
    ShopPetDetailView,
    ShopPetListCreateView,
    ShopPetNotifyView,
    ShopReturnListCreateView,
    ShopSettingsView,
)
from apps.shopie.api.views import (
    ShopBarcodeEnrichView,
    ShopBarcodeLookupView,
    ShopInvoiceFromOrderView,
    ShopInvoiceListView,
    ShopOrderConfirmPaymentView,
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
        "shop/orders/<uuid:order_id>/confirm-payment",
        ShopOrderConfirmPaymentView.as_view(),
        name="shop-order-confirm-payment",
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
    path("shop/pets/<uuid:pet_id>/notify", ShopPetNotifyView.as_view(), name="shop-pet-notify"),
    path("shop/invoices", ShopInvoiceListView.as_view(), name="shop-invoice-list"),
    path("shop/quotations", ShopQuotationListCreateView.as_view(), name="shop-quotation-list-create"),
    path(
        "shop/quotations/<uuid:quotation_id>/convert-to-sale",
        ShopQuotationConvertToSaleView.as_view(),
        name="shop-quotation-convert-to-sale",
    ),
    path(
        "shop/books/documents",
        ShopBooksDocumentListCreateView.as_view(),
        name="shop-books-document-list-create",
    ),
    path(
        "shop/books/documents/<uuid:document_id>/convert",
        ShopBooksDocumentConvertView.as_view(),
        name="shop-books-document-convert",
    ),
    path("shop/godowns", ShopGodownListCreateView.as_view(), name="shop-godown-list-create"),
    path(
        "shop/stock-transfers",
        ShopStockTransferListCreateView.as_view(),
        name="shop-stock-transfer-list-create",
    ),
    path("shop/cheques", ShopChequeListCreateView.as_view(), name="shop-cheque-list-create"),
    path(
        "shop/cheques/<uuid:cheque_id>/clear",
        ShopChequeClearView.as_view(),
        name="shop-cheque-clear",
    ),
    path(
        "shop/cheques/<uuid:cheque_id>/bounce",
        ShopChequeBounceView.as_view(),
        name="shop-cheque-bounce",
    ),
    path("shop/loans", ShopLoanListCreateView.as_view(), name="shop-loan-list-create"),
    path(
        "shop/loans/<uuid:loan_id>/repay",
        ShopLoanRepaymentView.as_view(),
        name="shop-loan-repay",
    ),
    # --- ShopIE GST books: suppliers, cash accounts, vouchers, reports ---
    path(
        "shop/books/dashboard",
        ShopBooksDashboardView.as_view(),
        name="shop-books-dashboard",
    ),
    path(
        "shop/suppliers",
        ShopSupplierListCreateView.as_view(),
        name="shop-supplier-list-create",
    ),
    path(
        "shop/suppliers/<uuid:supplier_id>",
        ShopSupplierDetailView.as_view(),
        name="shop-supplier-detail",
    ),
    path(
        "shop/books/accounts",
        ShopCashAccountListCreateView.as_view(),
        name="shop-books-account-list-create",
    ),
    path(
        "shop/books/accounts/<uuid:account_id>",
        ShopCashAccountDetailView.as_view(),
        name="shop-books-account-detail",
    ),
    path(
        "shop/books/vouchers",
        ShopBooksVoucherListCreateView.as_view(),
        name="shop-books-voucher-list-create",
    ),
    path(
        "shop/books/vouchers/<uuid:voucher_id>",
        ShopBooksVoucherDetailView.as_view(),
        name="shop-books-voucher-detail",
    ),
    path(
        "shop/books/vouchers/<uuid:voucher_id>/void",
        ShopBooksVoucherVoidView.as_view(),
        name="shop-books-voucher-void",
    ),
    path(
        "shop/books/party-statement",
        ShopPartyStatementView.as_view(),
        name="shop-books-party-statement",
    ),
    path(
        "shop/books/reports/<str:slug>",
        ShopBooksReportView.as_view(),
        name="shop-books-report",
    ),
    # --- ShopIE GST e-invoice (IRN) + e-way bill compliance ---
    path(
        "shop/books/compliance-settings",
        ShopComplianceSettingsView.as_view(),
        name="shop-books-compliance-settings",
    ),
    path(
        "shop/books/vouchers/<uuid:voucher_id>/einvoice",
        ShopVoucherEInvoiceView.as_view(),
        name="shop-books-voucher-einvoice",
    ),
    path(
        "shop/books/vouchers/<uuid:voucher_id>/einvoice/cancel",
        ShopVoucherEInvoiceCancelView.as_view(),
        name="shop-books-voucher-einvoice-cancel",
    ),
    path(
        "shop/books/vouchers/<uuid:voucher_id>/eway",
        ShopVoucherEWayView.as_view(),
        name="shop-books-voucher-eway",
    ),
    path(
        "shop/books/eway/<uuid:eway_id>/cancel",
        ShopEWayCancelView.as_view(),
        name="shop-books-eway-cancel",
    ),
    path(
        "shop/books/eway",
        ShopEWayListView.as_view(),
        name="shop-books-eway-list",
    ),
]
