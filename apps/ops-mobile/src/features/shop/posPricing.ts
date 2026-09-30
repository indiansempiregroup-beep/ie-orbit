export type DiscountType = '' | 'percent' | 'amount';

export type PosLineInput = {
  id: string;
  name: string;
  unitPrice: number;
  taxRate: number;
  /** When true, unitPrice already includes GST. */
  taxInclusive?: boolean;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
};

export type PosTotals = {
  merchandiseGross: number;
  lineDiscountTotal: number;
  merchandiseAfterLineDiscount: number;
  /** Manual / coupon bill discount only (excludes reward points). */
  billDiscountAmount: number;
  /** Reward-points redemption applied as taxable bill credit. */
  loyaltyDiscountAmount: number;
  subtotal: number;
  taxTotal: number;
  payable: number;
  /** Line amounts after product + bill + loyalty discounts. */
  lines: Array<{
    id: string;
    gross: number;
    discountAmount: number;
    subtotal: number;
    tax: number;
    total: number;
  }>;
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

/** Split tax out of an inclusive amount, or add tax on exclusive amount. */
export function splitTax(
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

export function isProductTaxInclusive(product: {
  metadata?: Record<string, unknown> | null;
  tax_inclusive?: boolean | null;
}): boolean {
  if (typeof product.tax_inclusive === 'boolean') return product.tax_inclusive;
  const meta = product.metadata;
  if (meta && typeof meta === 'object' && typeof meta.tax_inclusive === 'boolean') {
    return meta.tax_inclusive;
  }
  return false;
}

/**
 * Mirrors backend OrderService.create_order pricing:
 * 1) line discount on gross, then extract/add GST
 * 2) bill % / ₹ off against payable (shelf) totals
 * 3) loyalty amount added to bill discount
 * 4) allocate combined discount across line totals and re-extract GST
 */
export function computePosTotals(
  lines: PosLineInput[],
  billDiscountType: DiscountType = '',
  billDiscountValue = 0,
  loyaltyDiscountAmount = 0,
): PosTotals {
  const built = lines.map((line) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
    const taxRate = Math.max(0, Number(line.taxRate) || 0);
    const taxInclusive = Boolean(line.taxInclusive);
    const gross = money(unitPrice * qty);
    const discountAmount = applyDiscount(gross, line.discountType, line.discountValue);
    const afterDiscount = money(gross - discountAmount);
    const split = splitTax(afterDiscount, taxRate, taxInclusive);
    return {
      id: line.id,
      gross,
      discountAmount,
      subtotal: split.taxable,
      tax: split.tax,
      total: split.total,
      taxRate,
    };
  });

  const lineDiscountTotal = money(built.reduce((sum, row) => sum + row.discountAmount, 0));
  const merchandiseGross = money(built.reduce((sum, row) => sum + row.gross, 0));
  const payableBefore = money(built.reduce((sum, row) => sum + row.total, 0));

  const billOnly = applyDiscount(payableBefore, billDiscountType, billDiscountValue);
  const loyaltyOnly = money(
    Math.min(
      Math.max(0, Number(loyaltyDiscountAmount) || 0),
      Math.max(0, payableBefore - billOnly),
    ),
  );
  const combinedBillDiscount = money(billOnly + loyaltyOnly);

  let taxTotal = 0;
  let remainingDiscount = combinedBillDiscount;
  if (combinedBillDiscount > 0 && payableBefore > 0) {
    built.forEach((row, index) => {
      let share = 0;
      if (index === built.length - 1) {
        share = remainingDiscount;
      } else {
        share = money((combinedBillDiscount * row.total) / payableBefore);
        remainingDiscount = money(remainingDiscount - share);
      }
      const newTotal = money(Math.max(0, row.total - share));
      const rate = Math.max(0, row.taxRate);
      const taxable =
        rate > 0 ? money((newTotal * 100) / (100 + rate)) : newTotal;
      const tax = money(newTotal - taxable);
      row.subtotal = taxable;
      row.tax = tax;
      row.total = newTotal;
      taxTotal = money(taxTotal + tax);
    });
  } else {
    taxTotal = money(built.reduce((sum, row) => sum + row.tax, 0));
  }

  const subtotal = money(built.reduce((sum, row) => sum + row.subtotal, 0));
  return {
    merchandiseGross,
    lineDiscountTotal,
    merchandiseAfterLineDiscount: subtotal,
    billDiscountAmount: billOnly,
    loyaltyDiscountAmount: loyaltyOnly,
    subtotal,
    taxTotal,
    payable: money(subtotal + taxTotal),
    lines: built.map(({ id, gross, discountAmount, subtotal: lineSubtotal, tax, total }) => ({
      id,
      gross,
      discountAmount,
      subtotal: lineSubtotal,
      tax,
      total,
    })),
  };
}
