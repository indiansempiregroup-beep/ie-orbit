import type { ShopProduct } from '@ie-orbit/sdk';
import { isProductTaxInclusive } from './shopHelpers';

export type DiscountType = '' | 'percent' | 'amount';

export type CartLineInput = {
  id: string;
  unitPrice: number;
  taxRate: number;
  taxInclusive?: boolean;
  quantity: number;
};

export type CartTotals = {
  merchandiseGross: number;
  /** Bill / coupon / automation discount in payable (shelf) rupees. */
  billDiscountAmount: number;
  /** Reward-points redemption in payable rupees. */
  loyaltyDiscountAmount: number;
  taxableSubtotal: number;
  taxTotal: number;
  /** Merchandise payable after discounts + tax (excludes delivery). */
  payable: number;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyDiscount(gross: number, discountType: DiscountType, discountValue: number): number {
  const value = Math.max(0, Number(discountValue) || 0);
  if (!discountType || value <= 0 || gross <= 0) return 0;
  if (discountType === 'percent') {
    return money(Math.min(gross, (gross * Math.min(value, 100)) / 100));
  }
  return money(Math.min(gross, value));
}

function splitTax(
  amount: number,
  taxRate: number,
  taxInclusive: boolean,
): { taxable: number; tax: number; total: number } {
  const rate = Math.max(0, Number(taxRate) || 0);
  const base = money(Math.max(0, amount));
  if (rate <= 0) {
    return { taxable: base, tax: 0, total: base };
  }
  if (taxInclusive) {
    const taxable = money((base * 100) / (100 + rate));
    const tax = money(base - taxable);
    return { taxable, tax, total: base };
  }
  const tax = money((base * rate) / 100);
  return { taxable: base, tax, total: money(base + tax) };
}

/** Re-extract GST from a discounted line total (same formula for incl. and excl. rates). */
function splitFromTotal(total: number, taxRate: number): { taxable: number; tax: number; total: number } {
  const rate = Math.max(0, Number(taxRate) || 0);
  const base = money(Math.max(0, total));
  if (rate <= 0) {
    return { taxable: base, tax: 0, total: base };
  }
  const taxable = money((base * 100) / (100 + rate));
  return { taxable, tax: money(base - taxable), total: base };
}

export function cartLinesFromProducts(
  lines: Array<{ product: ShopProduct; quantity: number }>,
): CartLineInput[] {
  return lines.map((line) => ({
    id: line.product.id,
    unitPrice: Number(line.product.price) || 0,
    taxRate: Number(line.product.tax_rate ?? line.product.gst_rate ?? 0) || 0,
    taxInclusive: isProductTaxInclusive(line.product),
    quantity: line.quantity,
  }));
}

/**
 * Mirrors backend OrderService.create_order:
 * bill % / ₹ off reduce payable (shelf total), then GST is re-extracted per line.
 */
export function computeCartTotals(
  lines: CartLineInput[],
  billDiscountType: DiscountType = '',
  billDiscountValue = 0,
  loyaltyDiscountAmount = 0,
): CartTotals {
  const built = lines.map((line) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
    const taxRate = Math.max(0, Number(line.taxRate) || 0);
    const taxInclusive = Boolean(line.taxInclusive);
    const gross = money(unitPrice * qty);
    const split = splitTax(gross, taxRate, taxInclusive);
    return {
      gross,
      subtotal: split.taxable,
      tax: split.tax,
      total: split.total,
      taxRate,
    };
  });

  const merchandiseGross = money(built.reduce((sum, row) => sum + row.gross, 0));
  const payableBefore = money(built.reduce((sum, row) => sum + row.total, 0));

  const billOnly = applyDiscount(payableBefore, billDiscountType, billDiscountValue);
  const loyaltyOnly = money(
    Math.min(
      Math.max(0, Number(loyaltyDiscountAmount) || 0),
      Math.max(0, payableBefore - billOnly),
    ),
  );
  const combinedDiscount = money(billOnly + loyaltyOnly);

  let taxTotal = 0;
  let remainingDiscount = combinedDiscount;
  if (combinedDiscount > 0 && payableBefore > 0) {
    built.forEach((row, index) => {
      let share = 0;
      if (index === built.length - 1) {
        share = remainingDiscount;
      } else {
        share = money((combinedDiscount * row.total) / payableBefore);
        remainingDiscount = money(remainingDiscount - share);
      }
      const newTotal = money(Math.max(0, row.total - share));
      const split = splitFromTotal(newTotal, row.taxRate);
      row.subtotal = split.taxable;
      row.tax = split.tax;
      row.total = split.total;
      taxTotal = money(taxTotal + row.tax);
    });
  } else {
    taxTotal = money(built.reduce((sum, row) => sum + row.tax, 0));
  }

  const taxableSubtotal = money(built.reduce((sum, row) => sum + row.subtotal, 0));
  return {
    merchandiseGross,
    billDiscountAmount: billOnly,
    loyaltyDiscountAmount: loyaltyOnly,
    taxableSubtotal,
    taxTotal,
    payable: money(taxableSubtotal + taxTotal),
  };
}

/** Coupons already quote payable savings — use that amount directly on the bill. */
export function couponPayableToTaxableDiscount(
  payableSavings: number,
  _merchandiseTaxable: number,
  _payableBeforeCoupon: number,
): number {
  return money(Math.max(0, Number(payableSavings) || 0));
}

export function normalizeStateLabel(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isInterstateSupply(sellerState?: string | null, buyerState?: string | null): boolean {
  const from = normalizeStateLabel(sellerState);
  const to = normalizeStateLabel(buyerState);
  return Boolean(from && to && from !== to);
}
