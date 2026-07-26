export type DiscountType = '' | 'percent' | 'amount';

export type PosLineInput = {
  id: string;
  name: string;
  unitPrice: number;
  taxRate: number;
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

export function computePosTotals(
  lines: PosLineInput[],
  billDiscountType: DiscountType = '',
  billDiscountValue = 0,
): PosTotals {
  const built = lines.map((line) => {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
    const taxRate = Math.max(0, Number(line.taxRate) || 0);
    const gross = money(unitPrice * qty);
    const discountAmount = applyDiscount(gross, line.discountType, line.discountValue);
    const subtotal = money(gross - discountAmount);
    const tax = money((subtotal * taxRate) / 100);
    return {
      id: line.id,
      gross,
      discountAmount,
      subtotal,
      tax,
      total: money(subtotal + tax),
      taxRate,
    };
  });

  const merchandiseAfterLineDiscount = money(built.reduce((sum, row) => sum + row.subtotal, 0));
  const lineDiscountTotal = money(built.reduce((sum, row) => sum + row.discountAmount, 0));
  const merchandiseGross = money(built.reduce((sum, row) => sum + row.gross, 0));
  const billDiscountAmount = applyDiscount(
    merchandiseAfterLineDiscount,
    billDiscountType,
    billDiscountValue,
  );

  // Bill discount affects payable tax only — line rows stay product-level amounts.
  let taxTotal = 0;
  let remainingDiscount = billDiscountAmount;
  built.forEach((row, index) => {
    let share = 0;
    if (billDiscountAmount > 0 && merchandiseAfterLineDiscount > 0) {
      if (index === built.length - 1) {
        share = remainingDiscount;
      } else {
        share = money((billDiscountAmount * row.subtotal) / merchandiseAfterLineDiscount);
        remainingDiscount = money(remainingDiscount - share);
      }
    }
    const discountedSubtotal = money(row.subtotal - share);
    taxTotal = money(taxTotal + money((discountedSubtotal * row.taxRate) / 100));
  });

  const subtotal = money(merchandiseAfterLineDiscount - billDiscountAmount);
  return {
    merchandiseGross,
    lineDiscountTotal,
    merchandiseAfterLineDiscount,
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
