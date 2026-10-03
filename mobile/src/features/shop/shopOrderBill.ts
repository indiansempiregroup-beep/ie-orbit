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

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  borrow: 'Credit',
  razorpay: 'Online (Razorpay)',
  cashfree: 'Online (Cashfree)',
};

function paymentLabelFor(method: string): string {
  const key = method.trim().toLowerCase();
  if (!key) return '';
  return PAYMENT_LABELS[key] || key.toUpperCase();
}

export type ShopOrderBillBreakdown = {
  merchandiseGross: number;
  lineDiscountTotal: number;
  /** Items − product discounts. */
  merchandiseAfterLineDiscount: number;
  /** Manual bill discount (excludes coupon + reward points). */
  billDiscount: number;
  couponCode: string;
  couponDiscount: number;
  /** Points redeemed / used on this bill. */
  rewardPoints: number;
  rewardDiscount: number;
  /** Points credited (or expected on a paid bill). */
  pointsEarned: number;
  /** Points that will credit when the bill is paid. */
  pointsToEarn: number;
  deliveryFee: number;
  /** Taxable value after all discounts. */
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
  amountPaid: number;
  amountDue: number;
  paymentMethod: string;
  paymentLabel: string;
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

/** Customer-facing bill breakdown (same fields as ops POS / order invoice). */
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
  const awardLoyalty = pos.award_loyalty_points !== false;
  let pointsEarned = Math.max(0, Math.floor(num(loyalty.points_earned)));
  const expectedEarn = Math.max(0, Math.floor(num(pos.points_to_earn)));
  let pointsToEarn = 0;

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

  const total = money(num(order.total));
  const paymentMethod = String(order.payment_method || pos.payment_method || '')
    .trim()
    .toLowerCase();
  const paymentStatus = String(order.payment_status || pos.payment_status || '')
    .trim()
    .toLowerCase();
  let amountPaid = money(num(pos.amount_paid));
  let amountDue = money(num(pos.amount_due));
  if (amountPaid <= 0 && amountDue <= 0) {
    if (paymentMethod === 'borrow' || paymentStatus === 'due') {
      amountDue = total;
      amountPaid = 0;
    } else if (paymentStatus === 'partially_paid') {
      amountPaid = money(num(pos.amount_paid));
      amountDue = money(Math.max(0, total - amountPaid));
    } else {
      amountPaid = total;
      amountDue = 0;
    }
  } else if (amountDue <= 0 && amountPaid > 0) {
    amountDue = money(Math.max(0, total - amountPaid));
  } else if (amountPaid <= 0 && amountDue > 0) {
    amountPaid = money(Math.max(0, total - amountDue));
  }

  const isPaid = paymentStatus === 'paid' || paymentStatus === 'settled' || amountDue <= 0.009;
  if (awardLoyalty && expectedEarn > 0) {
    if (pointsEarned <= 0 && isPaid) pointsEarned = expectedEarn;
    if (pointsEarned <= 0 && !isPaid) pointsToEarn = expectedEarn;
  }

  return {
    merchandiseGross,
    lineDiscountTotal,
    merchandiseAfterLineDiscount: money(Math.max(0, merchandiseGross - lineDiscountTotal)),
    billDiscount,
    couponCode,
    couponDiscount,
    rewardPoints,
    rewardDiscount,
    pointsEarned,
    pointsToEarn,
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
    total,
    currency: String(order.currency || 'INR'),
    amountPaid,
    amountDue,
    paymentMethod,
    paymentLabel: paymentLabelFor(paymentMethod),
  };
}

export function loyaltyBillHighlight(
  bill: Pick<ShopOrderBillBreakdown, 'pointsEarned' | 'pointsToEarn' | 'rewardPoints'>,
): string {
  if (bill.pointsEarned > 0) return `+${bill.pointsEarned} loyalty points earned`;
  if (bill.pointsToEarn > 0) return `${bill.pointsToEarn} points when this bill is paid`;
  if (bill.rewardPoints > 0) return `${bill.rewardPoints} points used on this bill`;
  return '';
}
