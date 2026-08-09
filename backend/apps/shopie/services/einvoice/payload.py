from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Any

from django.core.exceptions import ValidationError

from apps.shopie.services.einvoice.state_codes import resolve_state_code

if TYPE_CHECKING:
    from apps.businesses.models import Business
    from apps.customers.models import Customer
    from apps.shopie.models import ShopBooksVoucher, ShopBusinessSettings

EINVOICE_SCHEMA_VERSION = "1.1"

_DOC_TYPE_BY_VOUCHER_TYPE = {
    "sale": "INV",
    "credit_note": "CRN",
    "debit_note": "DBN",
}

_DEFAULT_PIN = "999999"
_DEFAULT_HSN = "9999"
_DEFAULT_LOC = "NA"
_DEFAULT_ADDR = "NA"


def _num(value: Any) -> float:
    try:
        return float(Decimal(str(value or "0")))
    except Exception:  # noqa: BLE001 - defensive, malformed stored values
        return 0.0


def _gst_compliance(settings: ShopBusinessSettings | None) -> dict[str, Any]:
    if settings is None:
        return {}
    raw = getattr(settings, "gst_compliance", None)
    return raw if isinstance(raw, dict) else {}


def _seller_details(business: Business, settings: ShopBusinessSettings | None) -> dict[str, Any]:
    compliance = _gst_compliance(settings)
    gstin = str(business.gst_tax_number or "").strip().upper()
    if not gstin:
        raise ValidationError(
            {
                "gstin": (
                    "Seller GSTIN is required to generate an e-invoice. Set business GST number "
                    "or configure gst_compliance.seller_gstin in compliance settings."
                )
            }
        )
    legal_name = str(
        compliance.get("seller_legal_name") or business.business_name or business.display_name
    )
    trade_name = str(compliance.get("seller_trade_name") or business.display_name or legal_name)
    addr1 = str(compliance.get("seller_addr1") or business.address_line1 or _DEFAULT_ADDR)
    addr2 = str(compliance.get("seller_addr2") or business.address_line2 or "")
    loc = str(compliance.get("seller_loc") or business.city or _DEFAULT_LOC)
    pin = str(compliance.get("seller_pin") or business.postal_code or _DEFAULT_PIN)
    state_code = resolve_state_code(
        compliance.get("seller_state_code") or business.state
    ) or "99"
    phone = str(compliance.get("seller_phone") or business.primary_contact or "")
    email = str(compliance.get("seller_email") or business.email or "")

    seller: dict[str, Any] = {
        "Gstin": gstin,
        "LglNm": legal_name,
        "TrdNm": trade_name,
        "Addr1": addr1,
        "Loc": loc,
        "Pin": int(pin) if pin.isdigit() else _DEFAULT_PIN,
        "Stcd": state_code,
    }
    if addr2:
        seller["Addr2"] = addr2
    if phone:
        seller["Ph"] = phone
    if email:
        seller["Em"] = email
    return seller


def _customer_default_address(customer: Customer | None) -> Any:
    if customer is None:
        return None
    try:
        return customer.addresses.filter(is_default=True).first() or customer.addresses.first()
    except Exception:  # noqa: BLE001 - customer may not have `addresses` prefetched/available
        return None


def _buyer_details(
    *,
    business: Business,
    voucher: ShopBooksVoucher,
    customer: Customer | None,
    allow_b2c: bool,
) -> dict[str, Any]:
    metadata = voucher.metadata if isinstance(voucher.metadata, dict) else {}
    buyer_override = metadata.get("buyer") if isinstance(metadata.get("buyer"), dict) else {}

    gstin = str(
        buyer_override.get("gstin")
        or (customer.gstin if customer else "")
        or metadata.get("customer_gstin")
        or ""
    ).strip().upper()

    if not gstin and not allow_b2c:
        raise ValidationError(
            {
                "gstin": (
                    "Buyer GSTIN is required to generate a B2B e-invoice. Add a GSTIN to the "
                    "customer or enable B2C e-invoicing for this voucher."
                )
            }
        )

    address = _customer_default_address(customer)
    legal_name = str(
        buyer_override.get("legal_name")
        or (customer.display_name if customer else "")
        or metadata.get("customer_name")
        or "Unregistered Buyer"
    )
    pos_state_source = (
        buyer_override.get("state")
        or voucher.place_of_supply
        or (customer.billing_state if customer else "")
        or (address.state if address else "")
        or business.state
    )
    pos = resolve_state_code(pos_state_source) or "99"
    addr1 = str(buyer_override.get("addr1") or (address.line1 if address else "") or _DEFAULT_ADDR)
    addr2 = str(buyer_override.get("addr2") or (address.line2 if address else ""))
    loc = str(buyer_override.get("loc") or (address.city if address else "") or _DEFAULT_LOC)
    pin_raw = str(
        buyer_override.get("pin") or (address.postal_code if address else "") or _DEFAULT_PIN
    )
    pin = "".join(ch for ch in pin_raw if ch.isdigit()) or _DEFAULT_PIN

    buyer: dict[str, Any] = {
        "Gstin": gstin or "URP",
        "LglNm": legal_name,
        "Pos": pos,
        "Addr1": addr1,
        "Loc": loc,
        "Pin": int(pin) if pin.isdigit() else _DEFAULT_PIN,
        "Stcd": pos,
    }
    if addr2:
        buyer["Addr2"] = addr2
    return buyer


def _item_list(voucher: ShopBooksVoucher) -> list[dict[str, Any]]:
    lines = voucher.line_items if isinstance(voucher.line_items, list) else []
    items: list[dict[str, Any]] = []
    for idx, row in enumerate(lines, start=1):
        qty = _num(row.get("qty"))
        rate = _num(row.get("rate"))
        discount = _num(row.get("discount"))
        gst_rate = _num(row.get("gst_rate"))
        taxable = _num(row.get("taxable"))
        cgst = _num(row.get("cgst"))
        sgst = _num(row.get("sgst"))
        igst = _num(row.get("igst"))
        total = _num(row.get("total"))
        hsn = str(row.get("hsn_sac") or "").strip() or _DEFAULT_HSN
        items.append(
            {
                "SlNo": str(idx),
                "PrdDesc": str(row.get("name") or f"Item {idx}"),
                "IsServc": "N",
                "HsnCd": hsn,
                "Qty": qty,
                "Unit": "NOS",
                "UnitPrice": rate,
                "TotAmt": round(qty * rate, 2),
                "Discount": discount,
                "AssAmt": taxable,
                "GstRt": gst_rate,
                "IgstAmt": igst,
                "CgstAmt": cgst,
                "SgstAmt": sgst,
                "CesRt": 0,
                "CesAmt": 0,
                "TotItemVal": total,
            }
        )
    return items


def build_einvoice_payload(
    business: Business,
    settings: ShopBusinessSettings | None,
    voucher: ShopBooksVoucher,
    customer: Customer | None,
    *,
    doc_type: str | None = None,
    allow_b2c: bool = False,
) -> dict[str, Any]:
    """Build a GST e-invoice (IRN) request payload conforming to schema v1.1.

    Raises `django.core.exceptions.ValidationError` when required seller/buyer
    details (most commonly GSTIN) are missing.
    """
    resolved_doc_type = doc_type or _DOC_TYPE_BY_VOUCHER_TYPE.get(voucher.voucher_type, "INV")
    seller = _seller_details(business, settings)
    buyer = _buyer_details(
        business=business, voucher=voucher, customer=customer, allow_b2c=allow_b2c
    )
    sup_typ = "B2B" if buyer["Gstin"] != "URP" else "B2C"
    items = _item_list(voucher)
    if not items:
        raise ValidationError({"lines": "Voucher has no line items to generate an e-invoice for."})

    val_dtls = {
        "AssVal": _num(voucher.subtotal),
        "CgstVal": _num(voucher.cgst_total),
        "SgstVal": _num(voucher.sgst_total),
        "IgstVal": _num(voucher.igst_total),
        "CesVal": 0,
        "StCesVal": 0,
        "Discount": _num(voucher.discount_total),
        "OthChrg": 0,
        "RndOffAmt": 0,
        "TotInvVal": _num(voucher.total),
    }

    return {
        "Version": EINVOICE_SCHEMA_VERSION,
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": sup_typ,
            "RegRev": "N",
            "IgstOnIntra": "N",
        },
        "DocDtls": {
            "Typ": resolved_doc_type,
            "No": voucher.voucher_number,
            "Dt": voucher.voucher_date.strftime("%d/%m/%Y"),
        },
        "SellerDtls": seller,
        "BuyerDtls": buyer,
        "ItemList": items,
        "ValDtls": val_dtls,
    }
