from django.contrib import admin

from apps.shopie.models import (
    ShopInvoice,
    ShopOrder,
    ShopOrderLine,
    ShopProduct,
    ShopProductBarcode,
    ShopQuotation,
    ShopStockMovement,
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
