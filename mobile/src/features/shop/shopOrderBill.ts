import type { ShopOrder, ShopOrderLine } from '@ie-orbit/sdk';

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type ShopOrderBillBreakdown = {
  merchandiseGross: number;
  lineDiscountTotal: number;
  billDiscount: number;
  couponCode: string;
  couponDiscount: number;
  rewardPoints: number;
  rewardDiscount: number;
  deliveryFee: number;
  taxableSubtotal: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  isInterstate: boolean;
  placeOfSupply: string;
  customerGstin: string;
  sellerGstin: string;
  invoiceType: 'B2B' | 'B2C' | string;
  booksVoucherNumber: string;
  total: number;
  currency: string;
};

export function splitGstDisplay(
  taxTotal: number,
  options?: {
    cgst?: number;
    sgst?: number;
    igst?: number;
    isInterstate?: boolean;
  },
): { cgst: number; sgst: number; igst: number } {
  const tax = money(Math.max(0, taxTotal));
  const cgst = money(Math.max(0, options?.cgst ?? 0));
  const sgst = money(Math.max(0, options?.sgst ?? 0));
  const igst = money(Math.max(0, options?.igst ?? 0));
  if (igst > 0 || options?.isInterstate) {
    return { cgst: 0, sgst: 0, igst: igst > 0 ? igst : tax };
  }
  if (cgst > 0 || sgst > 0) return { cgst, sgst, igst: 0 };
  if (tax <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  const half = money(tax / 2);
  return { cgst: half, sgst: money(tax - half), igst: 0 };
}

export function lineMerchandiseGross(line: ShopOrderLine): number {
  return money(num(line.quantity) * num(line.unit_price));
}

export function shopOrderBillBreakdown(order: ShopOrder): ShopOrderBillBreakdown {
  const metadata = asRecord(order.metadata);
  const pos = asRecord(metadata.pos);
  const loyalty = asRecord(metadata.loyalty);
  const coupon = asRecord(metadata.coupon);
  const gstMeta = asRecord(metadata.gst);

  const lines = order.lines ?? [];
  const merchandiseGross = money(lines.reduce((sum, line) => sum + lineMerchandiseGross(line), 0));

  const lineDiscountFromLines = money(lines.reduce((sum, line) => sum + num(line.discount_amount), 0));
  const lineDiscountTotal = money(num(pos.line_discount_total) || lineDiscountFromLines);

  const rewardDiscount = money(num(loyalty.discount_amount));
  const rewardPoints = Math.max(0, Math.floor(num(loyalty.points_redeemed)));

  const couponCode = String(order.coupon_code || coupon.code || '').trim();
  const couponDiscount = money(num(order.coupon_discount) || num(coupon.discount_amount));

  const combinedBill = money(num(pos.bill_discount_amount));
  const billDiscount = couponCode ? 0 : money(Math.max(0, combinedBill - rewardDiscount));

  const deliveryFee = money(num(order.delivery_fee) || num(metadata.delivery_fee));
  const taxableSubtotal = money(
    num(order.taxable_value) || num(gstMeta.taxable_value) || num(order.subtotal),
  );
  const taxTotal = money(num(order.tax_total) || num(gstMeta.tax_total));
  const isInterstate = Boolean(
    order.is_interstate ?? gstMeta.is_interstate ?? num(order.igst_total) > 0,
  );
  const gst = splitGstDisplay(taxTotal, {
    cgst: num(order.cgst_total) || num(gstMeta.cgst_total),
    sgst: num(order.sgst_total) || num(gstMeta.sgst_total),
    igst: num(order.igst_total) || num(gstMeta.igst_total),
    isInterstate,
  });

  const customerGstin = String(
    order.customer_gstin || gstMeta.customer_gstin || metadata.customer_gstin || '',
  )
    .trim()
    .toUpperCase();
  const sellerGstin = String(order.seller_gstin || '').trim().toUpperCase();
  const invoiceType = String(
    order.invoice_type || (customerGstin ? 'B2B' : 'B2C'),
  ).toUpperCase();

  return {
    merchandiseGross,
    lineDiscountTotal,
    billDiscount,
    couponCode,
    couponDiscount,
    rewardPoints,
    rewardDiscount,
    deliveryFee,
    taxableSubtotal,
    taxTotal,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    isInterstate,
    placeOfSupply: String(order.place_of_supply || gstMeta.place_of_supply || '').trim(),
    customerGstin,
    sellerGstin,
    invoiceType,
    booksVoucherNumber: String(order.books_voucher_number || '').trim(),
    total: money(num(order.total)),
    currency: String(order.currency || 'INR'),
  };
}
