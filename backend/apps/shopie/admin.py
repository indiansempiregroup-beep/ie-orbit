from django.contrib import admin

from apps.shopie.models import (
    ShopBooksVoucher,
    ShopCashAccount,
    ShopEInvoice,
    ShopEWayBill,
    ShopInvoice,
    ShopOrder,
    ShopOrderLine,
    ShopPartyLedgerEntry,
    ShopProduct,
    ShopProductBarcode,
    ShopProductBatch,
    ShopQuotation,
    ShopStockMovement,
    ShopSupplier,
)


class ShopProductBarcodeInline(admin.TabularInline):
    model = ShopProductBarcode
    extra = 0


@admin.register(ShopProduct)
class ShopProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "price", "stock_on_hand", "status", "business")
    list_filter = ("status",)
    search_fields = ("name", "brand", "sku")
    inlines = [ShopProductBarcodeInline]


@admin.register(ShopOrder)
class ShopOrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "status", "total", "fulfillment_mode", "business", "created_at")
    list_filter = ("status", "fulfillment_mode")


admin.site.register(ShopOrderLine)
admin.site.register(ShopStockMovement)
admin.site.register(ShopInvoice)
admin.site.register(ShopQuotation)


@admin.register(ShopSupplier)
class ShopSupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "gstin", "opening_balance", "business")
    search_fields = ("name", "phone", "email", "gstin")


@admin.register(ShopCashAccount)
class ShopCashAccountAdmin(admin.ModelAdmin):
    list_display = ("name", "account_type", "current_balance", "is_active", "business")
    list_filter = ("account_type", "is_active")


@admin.register(ShopBooksVoucher)
class ShopBooksVoucherAdmin(admin.ModelAdmin):
    list_display = ("voucher_number", "voucher_type", "status", "voucher_date", "total", "business")
    list_filter = ("voucher_type", "status")
    search_fields = ("voucher_number",)


admin.site.register(ShopPartyLedgerEntry)
admin.site.register(ShopProductBatch)


@admin.register(ShopEInvoice)
class ShopEInvoiceAdmin(admin.ModelAdmin):
    list_display = ("voucher", "status", "doc_type", "irn", "ack_no", "business")
    list_filter = ("status", "doc_type")
    search_fields = ("irn", "ack_no")


@admin.register(ShopEWayBill)
class ShopEWayBillAdmin(admin.ModelAdmin):
    list_display = ("voucher", "status", "ewb_no", "supply_type", "vehicle_no", "business")
    list_filter = ("status", "supply_type")
    search_fields = ("ewb_no", "vehicle_no", "transporter_name")
