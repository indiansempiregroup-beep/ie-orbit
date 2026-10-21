import type { Customer, ShopBooksVoucher, ShopOrder, ShopPartyLedgerEntry, ShopSupplier } from '@ie-orbit/sdk';
import { formatDate, formatTime } from '../../utils/format';

export { formatMoney } from './posPayment';

/** True once the sale is done (delivered/picked up, or POS counter sale confirmed). */
export function orderReturnBadgeReady(
  order?: Pick<ShopOrder, 'status' | 'fulfillment_mode'> | null,
): boolean {
  if (!order) return false;
  const status = String(order.status || '').toLowerCase();
  if (status === 'completed' || status === 'delivered' || status === 'returned') return true;
  // POS counter sales are final at confirm — no separate delivery step.
  if (
    String(order.fulfillment_mode || '').toLowerCase() === 'pos' &&
    ['confirmed', 'ready', 'packed', 'completed', 'returned'].includes(status)
  ) {
    return true;
  }
  return false;
}

/**
 * Return-window copy for POS sale invoices and online orders.
 * Returns null until the order is delivered / picked up (or POS confirmed).
 */
export function orderReturnWindow(
  order?: Pick<
    ShopOrder,
    'status' | 'fulfillment_mode' | 'return_days' | 'return_eligible_until' | 'return_window_open'
  > | null,
): { days: number; open: boolean; untilLabel: string; summary: string } | null {
  const days = Number(order?.return_days ?? 0);
  if (!order || !Number.isFinite(days) || days <= 0) return null;
  if (!orderReturnBadgeReady(order)) return null;
  const untilLabel = order.return_eligible_until ? formatDate(order.return_eligible_until) : '';
  const open = order.return_window_open !== false;
  if (!untilLabel) {
    return {
      days,
      open,
      untilLabel: '',
      summary: `${days}-day return policy`,
    };
  }
  return {
    days,
    open,
    untilLabel,
    summary: open ? `Returns until ${untilLabel}` : `Returns closed ${untilLabel}`,
  };
}

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

/** Where this sale invoice came from — POS counter, online shop, or booking. */
export function saleInvoiceSourceLabel(
  voucher: ShopBooksVoucher,
  order?: { fulfillment_mode?: string | null } | null,
): string {
  const meta =
    voucher.metadata && typeof voucher.metadata === 'object'
      ? (voucher.metadata as Record<string, unknown>)
      : {};
  const source = String(meta.source || '').trim().toLowerCase();
  if (source === 'booking' || meta.source_booking_id) return 'Booking';

  const mode = String(order?.fulfillment_mode || meta.fulfillment_mode || meta.channel || '')
    .trim()
    .toLowerCase();
  if (mode === 'pos') return 'POS';
  if (mode === 'pickup' || mode === 'online_pickup') return 'Online order · Pickup';
  if (mode === 'delivery' || mode === 'online_delivery') return 'Online order · Delivery';
  // Linked shop order but mode not loaded yet — don't guess POS vs online.
  if (voucher.linked_order && !order) return 'Shop sale';
  if (voucher.linked_order) return 'Online order';
  return 'Books sale';
}

export function isVoidedVoucher(status?: string) {
  const s = (status || '').toLowerCase();
  return s === 'void' || s === 'voided' || s === 'cancelled';
}

export function voucherAmount(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function voucherMeta(voucher: ShopBooksVoucher): Record<string, unknown> {
  return voucher.metadata && typeof voucher.metadata === 'object'
    ? (voucher.metadata as Record<string, unknown>)
    : {};
}

/** Invoice total after completed returns (falls back to original total). */
export function voucherDisplayTotal(voucher: ShopBooksVoucher): number {
  const meta = voucherMeta(voucher);
  if (meta.net_total != null) return voucherAmount(meta.net_total as string | number);
  const returned = voucherAmount(meta.returned_total as string | number | undefined);
  return Math.max(0, voucherAmount(voucher.total) - returned);
}

/** Amount still considered paid after cash refunds from returns. */
export function voucherDisplayPaid(voucher: ShopBooksVoucher): number {
  const meta = voucherMeta(voucher);
  if (meta.net_amount_paid != null) return voucherAmount(meta.net_amount_paid as string | number);
  const paid = voucherAmount(voucher.amount_paid);
  const total = voucherDisplayTotal(voucher);
  // Legacy vouchers: cash refund may not have reduced amount_paid yet.
  if (voucherAmount(meta.returned_total as string | number | undefined) > 0 && paid > total) {
    return total;
  }
  return paid;
}

/** Remaining balance on a sale/purchase voucher (0 if fully paid / voided). */
export function voucherBalanceDue(voucher: ShopBooksVoucher): number {
  if (isVoidedVoucher(voucher.status)) return 0;
  const meta = voucherMeta(voucher);
  if (meta.net_amount_due != null) {
    return Math.max(0, voucherAmount(meta.net_amount_due as string | number));
  }
  const total = voucherDisplayTotal(voucher);
  const paid = voucherDisplayPaid(voucher);
  const status = (voucher.status || '').toLowerCase();
  if (status === 'paid' && voucherAmount(meta.returned_total as string | number | undefined) <= 0) {
    return 0;
  }
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
      const total = voucherDisplayTotal(voucher);
      const paid = voucherDisplayPaid(voucher);
      const balance = voucherBalanceDue(voucher);
      acc.count += 1;
      acc.totalAmount += total;
      acc.paidAmount += Math.min(paid, total);
      acc.unpaidAmount += balance;
      if (balance <= 0.009) acc.paidCount += 1;
      else acc.unpaidCount += 1;
      return acc;
    },
    { totalAmount: 0, paidAmount: 0, unpaidAmount: 0, count: 0, paidCount: 0, unpaidCount: 0 },
  );
}

export type VoucherPayFilter = 'all' | 'paid' | 'unpaid';

export type VoucherPeriodFilter = 'all' | 'today' | '7d' | 'month';

export type VoucherInvoiceTypeFilter = 'all' | 'b2b' | 'b2c';

export function periodDateRange(period: VoucherPeriodFilter): { dateFrom?: string; dateTo?: string } {
  if (period === 'all') return {};
  const today = new Date();
  const toIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const end = toIso(today);
  if (period === 'today') return { dateFrom: end, dateTo: end };
  if (period === '7d') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { dateFrom: toIso(start), dateTo: end };
  }
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return { dateFrom: toIso(monthStart), dateTo: end };
}

export function voucherHasGstin(voucher: ShopBooksVoucher): boolean {
  const meta = voucher.metadata && typeof voucher.metadata === 'object' ? voucher.metadata : {};
  return Boolean(String((meta as { customer_gstin?: string }).customer_gstin || '').trim());
}

export function filterSaleVouchers(
  vouchers: ShopBooksVoucher[],
  opts: {
    pay?: VoucherPayFilter;
    period?: VoucherPeriodFilter;
    customerId?: string;
    invoiceType?: VoucherInvoiceTypeFilter;
    search?: string;
  },
): ShopBooksVoucher[] {
  const pay = opts.pay ?? 'all';
  const period = opts.period ?? 'all';
  const invoiceType = opts.invoiceType ?? 'all';
  const customerId = opts.customerId ?? '';
  const term = (opts.search ?? '').trim().toLowerCase();
  const { dateFrom, dateTo } = periodDateRange(period);

  return vouchers.filter((voucher) => {
    if (isVoidedVoucher(voucher.status) && pay !== 'all') return false;

    if (pay !== 'all') {
      const paid = isVoucherFullyPaid(voucher);
      if (pay === 'paid' ? !paid : paid) return false;
    }

    if (dateFrom || dateTo) {
      const d = String(voucher.voucher_date || '').slice(0, 10);
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
    }

    if (customerId === '__walkin__') {
      if (voucher.customer) return false;
    } else if (customerId) {
      if (String(voucher.customer || '') !== customerId) return false;
    }

    if (invoiceType === 'b2b' && !voucherHasGstin(voucher)) return false;
    if (invoiceType === 'b2c' && voucherHasGstin(voucher)) return false;

    if (!term) return true;
    const meta = voucher.metadata && typeof voucher.metadata === 'object' ? voucher.metadata : {};
    const gstin = String((meta as { customer_gstin?: string }).customer_gstin || '');
    const lines = Array.isArray(voucher.line_items) ? voucher.line_items : [];
    const lineNames = lines
      .map((row) => {
        if (!row || typeof row !== 'object') return '';
        const line = row as Record<string, unknown>;
        return String(line.name || line.product_name || '');
      })
      .join(' ');
    const haystack = [
      voucher.voucher_number,
      voucher.customer_name,
      voucher.supplier_name,
      voucher.notes,
      voucher.status,
      gstin,
      lineNames,
      String(voucher.total),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function filterVouchersByPayStatus(
  vouchers: ShopBooksVoucher[],
  filter: VoucherPayFilter,
): ShopBooksVoucher[] {
  return filterSaleVouchers(vouchers, { pay: filter });
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

export function voucherLineProductId(line: Record<string, unknown>): string {
  const id = String(line.product_id || line.product || '').trim();
  if (!id || id === 'undefined' || id === 'null') return '';
  return id;
}

export type VoucherPaymentRecord = {
  amount: number;
  cashAccountName: string;
  at?: string;
  notes?: string;
};

export function voucherPaymentHistory(voucher: ShopBooksVoucher): VoucherPaymentRecord[] {
  const meta = voucherMeta(voucher);
  const raw = Array.isArray(meta.payments) ? meta.payments : [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const amount = voucherAmount(item.amount as string | number);
      if (amount <= 0) return null;
      return {
        amount,
        cashAccountName: String(item.cash_account_name || 'Cash'),
        at: typeof item.at === 'string' ? item.at : undefined,
        notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : undefined,
      };
    })
    .filter((row): row is VoucherPaymentRecord => Boolean(row));
}

export function purchaseSourceLabel(voucher: ShopBooksVoucher): string {
  const meta = voucherMeta(voucher);
  const scan =
    meta.invoice_scan && typeof meta.invoice_scan === 'object'
      ? (meta.invoice_scan as Record<string, unknown>)
      : null;
  if (!scan) return 'Purchase bill';
  const number = String(scan.invoice_number || '').trim();
  return number ? `Scanned · ${number}` : 'Scanned invoice';
}

export function ledgerEntryLabel(entry: Pick<ShopPartyLedgerEntry, 'entry_type'> & { voucher_type?: string | null }): string {
  const type = String(entry.entry_type || '').toLowerCase();
  if (type === 'purchase') return 'Purchase bill';
  if (type === 'payment_out') return 'Payment';
  if (type === 'debit_note') return 'Debit note';
  if (type === 'adjustment') return 'Adjustment';
  if (String(entry.voucher_type || '').toLowerCase() === 'purchase') return 'Purchase bill';
  return entry.entry_type || 'Entry';
}

export function canOpenPurchaseFromLedger(
  entry: Pick<ShopPartyLedgerEntry, 'voucher' | 'entry_type'> & { voucher_type?: string | null },
): boolean {
  if (!entry.voucher) return false;
  const voucherType = String(entry.voucher_type || '').toLowerCase();
  if (voucherType === 'purchase') return true;
  return String(entry.entry_type || '').toLowerCase() === 'purchase';
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatVoucherDate(iso?: string | null) {
  const day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Document date plus clock time from `created_at` (or a datetime `date` value). */
export function formatVoucherDateTime(date?: string | null, timestamp?: string | null) {
  const dateLabel = formatVoucherDate(date || timestamp);
  if (!dateLabel) return '';
  const timeSource =
    timestamp && String(timestamp).length > 10
      ? timestamp
      : date && String(date).length > 10
        ? date
        : null;
  if (!timeSource) return dateLabel;
  const timeLabel = formatTime(timeSource);
  if (!timeLabel || timeLabel === '—') return dateLabel;
  return `${dateLabel}, ${timeLabel}`;
}
