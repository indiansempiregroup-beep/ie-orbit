from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.authentication.models import User, UserStatus
from apps.authentication.tests.otp_helpers import authenticate_api_client
from apps.businesses.models import Business
from apps.shopie.models import ShopProduct, ShopProductBarcode, ShopSupplier, SmartLookupUsage, SmartLookupWallet
from apps.shopie.services.invoice_scan import InvoiceScanService
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def shop_business() -> Business:
    owner = User.objects.create_user(
        email="invoice-scan-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="invoice-scan-tenant", display_name="Invoice Scan", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Invoice Scan Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="invoice-scan-biz",
        business_name="Invoice Scan Biz",
        display_name="Invoice Scan Biz",
        selected_product="shopie",
    )


def _product(business: Business, **kwargs) -> ShopProduct:
    defaults = {
        "tenant": business.tenant,
        "business": business,
        "name": "Rice 5kg",
        "sku": "RICE-5",
        "price": Decimal("249"),
        "purchase_price": Decimal("180"),
        "avg_cost": Decimal("180"),
        "gst_rate": Decimal("5"),
        "hsn_sac": "1006",
        "stock_on_hand": Decimal("2"),
    }
    defaults.update(kwargs)
    return ShopProduct.objects.create(**defaults)


@pytest.mark.django_db
def test_analyze_matches_barcode_sku_name_and_unmatched(shop_business: Business) -> None:
    rice = _product(shop_business)
    ShopProductBarcode.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        product=rice,
        code="8901234567890",
        is_primary=True,
    )
    chips = _product(shop_business, name="Lays Classic", sku="LAYS-50", hsn_sac="1905")
    atta = _product(shop_business, name="Ashirvaad Atta 10kg", sku="ATTA-10")
    supplier = ShopSupplier.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        name="Acme Supplies",
        gstin="27AAAAA0000A1Z5",
    )

    result = InvoiceScanService().analyze(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/bill.jpg"],
        extracted={
            "supplier_name": "Acme Supplies",
            "gstin": "27AAAAA0000A1Z5",
            "invoice_number": "INV-88",
            "grand_total": "1000",
            "lines": [
                {"name": "Something else", "barcode": "8901234567890", "qty": "4", "rate": "190", "gst_rate": "5", "line_total": "760"},
                {"name": "Wrong", "sku": "LAYS-50", "qty": "2", "rate": "20", "line_total": "40"},
                {"name": "Ashirvaad Atta 10kg", "qty": "1", "rate": "400", "line_total": "400"},
                {"name": "New Oil 1L", "qty": "3", "rate": "150", "hsn_sac": "1512", "gst_rate": "5", "line_total": "450"},
            ],
        },
        charged_paise=12,
        balance_after_paise=88,
        usage_id=str(uuid4()),
        charge_message="₹0.12 deducted from AI wallet.",
    )
    assert result["ok"] is True
    assert result["charged_paise"] == 12
    assert result["charge_currency"] in {"INR", "USD"}
    assert result["draft"]["supplier"]["supplier_id"] == str(supplier.id)
    assert result["draft"]["supplier"]["match"] == "gstin"
    assert result["draft"]["supplier"]["create"] is False
    by_name = {row["name"]: row for row in result["draft"]["lines"]}
    assert by_name[rice.name]["match"] == "barcode"
    assert by_name[rice.name]["product_id"] == str(rice.id)
    assert by_name[chips.name]["match"] == "sku"
    assert by_name[atta.name]["match"] == "name"
    assert by_name["New Oil 1L"]["match"] == ""
    assert by_name["New Oil 1L"]["create"] is True
    assert Decimal(by_name[rice.name]["price"]) == Decimal("249")
    assert Decimal(by_name["New Oil 1L"]["price"]) == Decimal("150")
    assert by_name["New Oil 1L"]["barcode"] == ""
    assert result["draft"]["totals_mismatch"] is True


@pytest.mark.django_db
def test_analyze_uses_invoice_mrp_as_selling_price(shop_business: Business) -> None:
    rice = _product(shop_business)
    ShopProductBarcode.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        product=rice,
        code="8901234567890",
        is_primary=True,
    )
    result = InvoiceScanService().analyze(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/bill.jpg"],
        extracted={
            "supplier_name": "Acme Supplies",
            "invoice_number": "INV-MRP",
            "lines": [
                {"name": rice.name, "barcode": "8901234567890", "qty": "2", "rate": "190", "mrp": "275"},
                {"name": "New Oil 1L", "qty": "3", "rate": "140", "mrp": "175"},
            ],
        },
    )
    by_name = {row["name"]: row for row in result["draft"]["lines"]}
    assert Decimal(by_name[rice.name]["price"]) == Decimal("275")
    assert Decimal(by_name[rice.name]["rate"]) == Decimal("190")
    assert Decimal(by_name["New Oil 1L"]["price"]) == Decimal("175")
    assert Decimal(by_name["New Oil 1L"]["rate"]) == Decimal("140")


@pytest.mark.django_db
def test_confirm_creates_missing_product_and_receives_stock_at_cost(shop_business: Business) -> None:
    rice = _product(shop_business, stock_on_hand=Decimal("10"), purchase_price=Decimal("180"), avg_cost=Decimal("180"))
    draft = {
        "image_urls": ["https://example.com/bill.jpg"],
        "header": {"supplier_name": "Fresh Mart", "gstin": "27BBBBB0000B1Z5", "invoice_number": "INV-99"},
        "supplier": {"name": "Fresh Mart", "gstin": "27BBBBB0000B1Z5", "create": True},
        "lines": [
            {
                "name": rice.name,
                "product_id": str(rice.id),
                "qty": "10",
                "rate": "200",
                "gst_rate": "5",
                "hsn_sac": "1006",
            },
            {
                "name": "Mustard Oil 1L",
                "barcode": "8901999000111",
                "sku": "OIL-1",
                "qty": "4",
                "rate": "140",
                "price": "175",
                "gst_rate": "5",
                "hsn_sac": "1514",
                "brand": "Fortune",
                "pack_size": "1 L",
                "status": "active",
                "category": "food_grocery",
                "currency": "INR",
                "tax_inclusive": False,
                "description": "Mustard oil",
                "details_html": "<p>Cold pressed</p>",
                "image_url": "https://cdn.example.com/oil.jpg",
                "use_image": True,
                "create": True,
            },
        ],
    }
    posted = InvoiceScanService().confirm(
        tenant=shop_business.tenant,
        business=shop_business,
        draft=draft,
        create_missing=True,
        create_supplier=True,
    )
    rice.refresh_from_db()
    assert rice.stock_on_hand == Decimal("20")
    assert rice.purchase_price == Decimal("200")
    assert rice.avg_cost == Decimal("190")
    assert rice.price == Decimal("249")
    oil = ShopProduct.objects.get(name="Mustard Oil 1L")
    assert oil.stock_on_hand == Decimal("4")
    assert oil.purchase_price == Decimal("140")
    assert oil.price == Decimal("175")
    assert oil.sku == "OIL-1"
    assert oil.brand == "Fortune"
    assert oil.pack_size == "1 L"
    assert oil.status == "active"
    assert oil.category == "food_grocery"
    assert oil.currency == "INR"
    assert oil.description == "Mustard oil"
    assert "Cold pressed" in oil.details_html
    assert oil.metadata.get("tax_inclusive") is False
    assert oil.image_url == "https://cdn.example.com/oil.jpg"
    assert oil.hsn_sac == "1514"
    assert ShopSupplier.objects.filter(name="Fresh Mart").exists()
    assert posted["voucher_number"]
    from apps.shopie.models import ShopBooksVoucher

    voucher = ShopBooksVoucher.objects.get(id=posted["voucher_id"])
    assert voucher.metadata["invoice_scan"]["invoice_number"] == "INV-99"


@pytest.mark.django_db
def test_confirm_skips_supplier_unless_opted_in(shop_business: Business) -> None:
    rice = _product(shop_business)
    posted = InvoiceScanService().confirm(
        tenant=shop_business.tenant,
        business=shop_business,
        draft={
            "header": {"supplier_name": "Walk-in Vendor", "invoice_number": "INV-SKIP"},
            "supplier": {"name": "Walk-in Vendor", "gstin": "27CCCCC0000C1Z5", "create": False},
            "lines": [{"name": rice.name, "product_id": str(rice.id), "qty": "1", "rate": "10", "gst_rate": "0"}],
        },
        create_missing=True,
        create_supplier=False,
    )
    assert not ShopSupplier.objects.filter(name="Walk-in Vendor").exists()
    from apps.shopie.models import ShopBooksVoucher

    voucher = ShopBooksVoucher.objects.get(id=posted["voucher_id"])
    assert voucher.supplier_id is None


@pytest.mark.django_db
def test_duplicate_invoice_warning(shop_business: Business) -> None:
    service = InvoiceScanService()
    rice = _product(shop_business)
    draft = {
        "header": {"supplier_name": "Dup Vendor", "invoice_number": "DUP-1"},
        "supplier": {"name": "Dup Vendor", "create": True},
        "lines": [{"name": rice.name, "product_id": str(rice.id), "qty": "1", "rate": "10", "gst_rate": "0"}],
    }
    service.confirm(tenant=shop_business.tenant, business=shop_business, draft=draft)
    again = service.analyze(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/dup.jpg"],
        extracted={
            "supplier_name": "Dup Vendor",
            "invoice_number": "DUP-1",
            "lines": [{"name": rice.name, "qty": "1", "rate": "10"}],
        },
    )
    assert again["draft"]["duplicate"]["found"] is True


@pytest.mark.django_db
def test_invoice_vision_writes_ledger(shop_business: Business, monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services import smart_lookup as smart_mod

    wallet = SmartLookupWallet.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        balance_paise=500,
    )

    class _Platform:
        enabled = True
        markup_bps = 0
        input_usd_per_million = Decimal("0.10")
        output_usd_per_million = Decimal("0.40")
        usd_to_inr = Decimal("85")
        gst_percent = Decimal("0")

    monkeypatch.setattr(smart_mod, "get_platform_smart_lookup_row", lambda: _Platform())
    monkeypatch.setattr(
        smart_mod,
        "smart_lookup_prices_for_currency",
        lambda *args, **kwargs: {"min_charge": 1},
    )
    monkeypatch.setattr(
        smart_mod.SmartLookupService,
        "_call_invoice_gemini",
        lambda self, **kwargs: {
            "ok": True,
            "data": {"invoice_number": "INV-LEDGER", "supplier_name": "Acme", "lines": [{"name": "Rice"}]},
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        },
    )
    result = smart_mod.SmartLookupService().invoice_vision(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/bill.jpg"],
    )
    assert result["ok"] is True
    assert result["charged_paise"] > 0
    wallet.refresh_from_db()
    assert wallet.balance_paise == 500 - result["charged_paise"]
    row = SmartLookupUsage.objects.get(source="gemini_invoice")
    assert row.code == "INV-LEDGER"
    assert row.metadata["kind"] == "invoice_scan"
    assert row.metadata["supplier_name"] == "Acme"
    assert row.charged_paise == result["charged_paise"]
    confirm = InvoiceScanService().confirm(
        tenant=shop_business.tenant,
        business=shop_business,
        draft={
            "header": {"supplier_name": "Acme", "invoice_number": "INV-LEDGER"},
            "supplier": {"name": "Acme", "create": True},
            "lines": [{"name": "Rice", "qty": "1", "rate": "20", "gst_rate": "0", "create": True}],
        },
    )
    assert confirm["voucher_id"]
    assert SmartLookupUsage.objects.filter(source="gemini_invoice").count() == 1


@pytest.mark.django_db
def test_invoice_scan_api_requires_plan_feature(shop_business: Business) -> None:
    owner = shop_business.tenant.owner
    client = APIClient()
    access = authenticate_api_client(client, owner)
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=str(shop_business.tenant.id),
    )
    response = client.post(
        reverse("shop-books-invoice-scan"),
        {"business_id": str(shop_business.id), "image_urls": ["https://example.com/bill.jpg"]},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_download_image_reads_relative_media_url(shop_business: Business, tmp_path, settings) -> None:
    from apps.platform_media.models import Media, MediaType, MediaVisibility, StorageProviderType
    from apps.shopie.services.smart_lookup import SmartLookupService

    settings.PLATFORM_MEDIA_LOCAL_ROOT = tmp_path
    settings.PLATFORM_MEDIA_STORAGE_PROVIDER = "local"
    payload = b"\xff\xd8\xff\xe0invoice-bytes"
    rel = "tenants/invoice.jpg"
    (tmp_path / "tenants").mkdir()
    (tmp_path / rel).write_bytes(payload)
    media = Media.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        media_type=MediaType.IMAGE,
        original_filename="invoice.jpg",
        storage_filename="invoice.jpg",
        display_name="Invoice",
        file_extension="jpg",
        mime_type="image/jpeg",
        file_size=len(payload),
        storage_provider=StorageProviderType.LOCAL,
        storage_path=rel,
        checksum="invoice-scan-local",
        visibility=MediaVisibility.PUBLIC,
    )
    service = SmartLookupService()
    assert service._download_image(f"/api/v1/media/{media.id}/file") == payload
    assert service._download_image(f"http://localhost:8000/api/v1/media/{media.id}/file") == payload


def test_invoice_gemini_requires_image_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services import smart_lookup as smart_mod

    monkeypatch.setattr(smart_mod.SmartLookupService, "_download_image", lambda self, url: None)
    opened: list[str] = []
    monkeypatch.setattr(
        smart_mod.urllib.request,
        "urlopen",
        lambda *args, **kwargs: opened.append("called"),
    )
    result = smart_mod.SmartLookupService()._call_invoice_gemini(
        api_key="test-key",
        image_urls=["/api/v1/media/01a15cb1-f227-7d2c-9b51-950374d7f802/file"],
    )
    assert result["ok"] is False
    assert opened == []
    assert "open" in result["error"].lower()


@pytest.mark.django_db
def test_analyze_attaches_catalog_image_for_new_barcode(shop_business: Business, monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.shopie.services.catalog import CatalogService

    monkeypatch.setattr(
        CatalogService,
        "enrich_barcode",
        lambda self, *, code="", query="": {
            "found": True,
            "source": "platform_gtin",
            "image_url": "https://cdn.example.com/lays.jpg",
            "front_image_url": "https://cdn.example.com/lays.jpg",
            "brand": "Lays",
            "pack_size": "52 g",
            "description": "Potato chips",
            "details_html": "<p>Classic salted</p>",
            "categories": "snacks",
            "currency": "INR",
        },
    )
    result = InvoiceScanService().analyze(
        tenant=shop_business.tenant,
        business=shop_business,
        image_urls=["https://example.com/bill.jpg"],
        extracted={
            "supplier_name": "Acme",
            "invoice_number": "IMG-1",
            "lines": [{"name": "Lays Classic", "barcode": "8901234567890", "qty": "2", "rate": "20"}],
        },
    )
    line = result["draft"]["lines"][0]
    assert line["create"] is True
    assert line["price"] == "20"
    assert line["image_url"] == "https://cdn.example.com/lays.jpg"
    assert line["use_image"] is True
    assert line["image_source"] == "platform_gtin"
    assert line["brand"] == "Lays"
    assert line["pack_size"] == "52 g"
    assert line["description"] == "Potato chips"
    assert line["category"] == "snacks"
    assert line["currency"] == "INR"
    assert line["status"] == "active"
    assert line["tax_inclusive"] is False
    assert line["stock_on_hand"] == "0"


@pytest.mark.django_db
def test_analyze_blocked_when_tenant_invoice_scan_is_off(shop_business: Business) -> None:
    from rest_framework.exceptions import ValidationError

    from apps.platform_admin.models import PlatformFeatureFlag

    PlatformFeatureFlag.objects.create(
        tenant=shop_business.tenant,
        key="shopie_invoice_scan",
        enabled=False,
    )
    with pytest.raises(ValidationError):
        InvoiceScanService().analyze(
            tenant=shop_business.tenant,
            business=shop_business,
            image_urls=["https://example.com/bill.jpg"],
            extracted={"invoice_number": "INV-1", "lines": []},
        )
