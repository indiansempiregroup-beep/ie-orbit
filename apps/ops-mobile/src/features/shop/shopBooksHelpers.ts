import type { Customer, ShopBooksVoucher, ShopSupplier } from '@ie-platform/sdk';

export { formatMoney } from './posPayment';

export const VOUCHER_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  posted: { bg: '#D1FAE5', text: '#047857' },
  paid: { bg: '#D1FAE5', text: '#047857' },
  draft: { bg: '#FEF3C7', text: '#B45309' },
  pending: { bg: '#FEF3C7', text: '#B45309' },
  void: { bg: '#FEE2E2', text: '#B91C1C' },
  voided: { bg: '#FEE2E2', text: '#B91C1C' },
  cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
};

export function voucherStatusStyle(status?: string) {
  return VOUCHER_STATUS_STYLES[(status || '').toLowerCase()] ?? { bg: '#E2E8F0', text: '#475569' };
}

export function isVoidedVoucher(status?: string) {
  const s = (status || '').toLowerCase();
  return s === 'void' || s === 'voided' || s === 'cancelled';
}

export function voucherAmount(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Remaining balance on a sale/purchase voucher (0 if fully paid / voided). */
export function voucherBalanceDue(voucher: ShopBooksVoucher): number {
  if (isVoidedVoucher(voucher.status)) return 0;
  const total = voucherAmount(voucher.total);
  const paid = voucherAmount(voucher.amount_paid);
  const status = (voucher.status || '').toLowerCase();
  if (status === 'paid') return 0;
  return Math.max(0, total - paid);
}

export function isVoucherFullyPaid(voucher: ShopBooksVoucher): boolean {
  if (isVoidedVoucher(voucher.status)) return false;
  return voucherBalanceDue(voucher) <= 0.009;
}

export type VoucherListSummary = {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  count: number;
  paidCount: number;
  unpaidCount: number;
};

export function summarizeVouchers(vouchers: ShopBooksVoucher[]): VoucherListSummary {
  return vouchers.reduce<VoucherListSummary>(
    (acc, voucher) => {
      if (isVoidedVoucher(voucher.status)) return acc;
      const total = voucherAmount(voucher.total);
      const balance = voucherBalanceDue(voucher);
      const paid = Math.max(0, total - balance);
      acc.count += 1;
      acc.totalAmount += total;
      acc.paidAmount += paid;
      acc.unpaidAmount += balance;
      if (balance <= 0.009) acc.paidCount += 1;
      else acc.unpaidCount += 1;
      return acc;
    },
    { totalAmount: 0, paidAmount: 0, unpaidAmount: 0, count: 0, paidCount: 0, unpaidCount: 0 },
  );
}

export type VoucherPayFilter = 'all' | 'paid' | 'unpaid';

export function filterVouchersByPayStatus(
  vouchers: ShopBooksVoucher[],
  filter: VoucherPayFilter,
): ShopBooksVoucher[] {
  if (filter === 'all') return vouchers;
  return vouchers.filter((voucher) => {
    if (isVoidedVoucher(voucher.status)) return false;
    const paid = isVoucherFullyPaid(voucher);
    return filter === 'paid' ? paid : !paid;
  });
}

export function customerLabel(customer: Customer): string {
  return (
    customer.full_name ||
    customer.display_name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.email ||
    customer.phone_number ||
    customer.id
  );
}

export function supplierLabel(supplier: ShopSupplier): string {
  return supplier.name || supplier.phone || supplier.email || supplier.id;
}

export function voucherPartyLabel(voucher: ShopBooksVoucher): string {
  return voucher.customer_name || voucher.supplier_name || voucher.contra_account_name || '—';
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
