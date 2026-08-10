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
  billDiscountAmount: number;
  subtotal: number;
  taxTotal: number;
  payable: number;
  /** Line amounts after product discounts only — bill discount stays in summary. */
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
export function splitTax(amount: number, taxRate: number, taxInclusive: boolean): { taxable: number; tax: number; total: number } {
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

export function isProductTaxInclusive(product: { metadata?: Record<string, unknown> | null; tax_inclusive?: boolean | null }): boolean {
  if (typeof product.tax_inclusive === 'boolean') return product.tax_inclusive;
  const meta = product.metadata;
  if (meta && typeof meta === 'object' && typeof meta.tax_inclusive === 'boolean') {
    return meta.tax_inclusive;
  }
  return false;
}

export function computePosTotals(
  lines: PosLineInput[],
  billDiscountType: DiscountType = '',
  billDiscountValue = 0,
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
      taxInclusive,
    };
  });

  const merchandiseAfterLineDiscount = money(built.reduce((sum, row) => sum + row.subtotal, 0));
  const lineDiscountTotal = money(built.reduce((sum, row) => sum + row.discountAmount, 0));
  const merchandiseGross = money(built.reduce((sum, row) => sum + row.gross, 0));
  const lineTaxBeforeBillDiscount = money(built.reduce((sum, row) => sum + row.tax, 0));
  const billDiscountAmount = applyDiscount(
    money(merchandiseAfterLineDiscount + lineTaxBeforeBillDiscount),
    billDiscountType,
    billDiscountValue,
  );

  // Prefer applying bill discount against taxable base when prices are exclusive;
  // for inclusive lines, discount already came off the inclusive gross above.
  let taxTotal = 0;
  let remainingDiscount = billDiscountAmount;
  const payableBase = money(merchandiseAfterLineDiscount + lineTaxBeforeBillDiscount);
  built.forEach((row, index) => {
    let share = 0;
    if (billDiscountAmount > 0 && payableBase > 0) {
      const weight = money(row.subtotal + row.tax);
      if (index === built.length - 1) {
        share = remainingDiscount;
      } else {
        share = money((billDiscountAmount * weight) / payableBase);
        remainingDiscount = money(remainingDiscount - share);
      }
    }
    if (row.taxInclusive) {
      const discountedInclusive = money(Math.max(0, row.total - share));
      const split = splitTax(discountedInclusive, row.taxRate, true);
      taxTotal = money(taxTotal + split.tax);
      row.subtotal = split.taxable;
      row.tax = split.tax;
      row.total = split.total;
    } else {
      const discountedSubtotal = money(Math.max(0, row.subtotal - share));
      const split = splitTax(discountedSubtotal, row.taxRate, false);
      taxTotal = money(taxTotal + split.tax);
      row.subtotal = split.taxable;
      row.tax = split.tax;
      row.total = split.total;
    }
  });

  const subtotal = money(built.reduce((sum, row) => sum + row.subtotal, 0));
  return {
    merchandiseGross,
    lineDiscountTotal,
    merchandiseAfterLineDiscount: subtotal,
    billDiscountAmount,
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
