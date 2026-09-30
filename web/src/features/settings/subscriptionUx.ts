import type { BusinessProductSubscription } from '@ie-orbit/sdk';
import { getProductName } from '../../config/products';

export type SubscriptionUxStatus =
  | 'not_subscribed'
  | 'trial'
  | 'active'
  | 'due_soon'
  | 'payment_pending'
  | 'locked';

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

export function subscriptionDueAt(subscription?: BusinessProductSubscription | null): string | null {
  if (!subscription) return null;
  if (subscription.status === 'trialing') return subscription.trial_ends_at ?? null;
  return subscription.current_period_ends_at ?? null;
}

export function subscriptionUxStatus(
  subscription?: BusinessProductSubscription | null,
  pending?: boolean,
): SubscriptionUxStatus {
  if (!subscription) return 'not_subscribed';
  if (pending) return 'payment_pending';
  if (subscription.status === 'soft_locked') return 'locked';
  const days = daysUntil(subscriptionDueAt(subscription));
  if (subscription.status === 'trialing') {
    if (days != null && days <= 5) return 'due_soon';
    return 'trial';
  }
  if (days != null && days <= 5) return 'due_soon';
  if (days != null && days < 0) return 'locked';
  return 'active';
}

export function subscriptionStatusLabel(status: SubscriptionUxStatus, days?: number | null): string {
  if (status === 'payment_pending') return 'Payment under review';
  if (status === 'locked') return 'Locked — pay to restore';
  if (status === 'due_soon') {
    if (days == null) return 'Due soon';
    if (days <= 0) return 'Due today';
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (status === 'trial') {
    if (days == null) return 'Trial';
    return `Trial (${days} day${days === 1 ? '' : 's'} left)`;
  }
  if (status === 'active') return 'Active';
  return 'Not subscribed';
}

export function nextPaymentCopy(subscription?: BusinessProductSubscription | null, amountLabel?: string | null): string {
  const due = subscriptionDueAt(subscription);
  const date = due ? new Date(due).toLocaleDateString() : '—';
  const amount = amountLabel ? ` · ${amountLabel}` : '';
  return `Next payment due ${date}${amount}. We do not charge automatically.`;
}

export function renewCtaLabel(productCode: string): string {
  return `Renew ${getProductName(productCode)}`;
}

export function orderStatusLabel(paymentStatus?: string | null, sessionStatus?: string | null, refundStatus?: string | null): string {
  const refund = String(refundStatus || '').toLowerCase();
  if (refund === 'requested') return 'Refund requested';
  if (refund === 'rejected') return 'Refund declined';
  if (refund === 'refunded') return 'Refunded';
  if (refund === 'partially_refunded') return 'Partially refunded';
  const status = String(paymentStatus || sessionStatus || '').toLowerCase();
  if (status === 'awaiting_confirmation') return 'Payment under review';
  if (status === 'paid') return 'Confirmed';
  if (status === 'rejected') return 'Rejected';
  if (status === 'expired') return 'Expired';
  if (status === 'failed') return 'Failed';
  if (status === 'created') return 'Awaiting payment';
  return status.replace(/_/g, ' ') || 'Order';
}

export function trackerStepIndex(status: SubscriptionUxStatus): number {
  if (status === 'payment_pending') return 2;
  if (status === 'locked' || status === 'due_soon' || status === 'not_subscribed') return 0;
  // Active / trial: all four steps complete (including "Access until …").
  return 4;
}

export function trackerSteps(status: SubscriptionUxStatus, dueLabel?: string | null): string[] {
  return [
    'Pay with UPI',
    'Submit UTR or screenshot',
    'IE confirms',
    dueLabel ? `Access until ${dueLabel}` : 'Access restored',
  ];
}

export type BillingOrderLike = {
  id: string;
  order_number?: string;
  upi_utr?: string;
  product_code?: string;
  product_codes?: string[];
  plan_code?: string;
  business_name?: string;
  tenant_name?: string;
  tenant_slug?: string;
  payment_status?: string;
  status?: string;
  refund_status?: string;
  amount_paise?: number;
  created_at: string;
  claimed_at?: string | null;
  paid_at?: string | null;
  note?: string;
  invoice_number?: string | null;
  tax_invoice_id?: string | null;
  tax_invoice_number?: string | null;
  refund_request?: {
    amount_paise?: number;
    reason?: string;
    requested_at?: string;
    withdrawn_at?: string;
  } | null;
  refunded_paise?: number;
  refunds?: Array<{
    amount_paise?: number;
    recorded_at?: string;
    note?: string;
    reference?: string;
  }>;
  credit_notes?: Array<{
    id: string;
    invoice_number: string;
    amount_paise?: number;
    issued_at?: string | null;
  }>;
};

export type OrderHistoryStatusFilter = 'all' | 'review' | 'paid' | 'rejected' | 'refunds' | 'created';
export type OrderHistoryRange = '30d' | '90d' | '365d' | 'all';

export type BillingHistoryEntryKind = 'payment' | 'refund_request' | 'refund_declined' | 'refund_paid';

export type BillingHistoryEntry<T extends BillingOrderLike = BillingOrderLike> = {
  key: string;
  kind: BillingHistoryEntryKind;
  order: T;
  statusLabel: string;
  bucket: Exclude<OrderHistoryStatusFilter, 'all'>;
  sortAt: string;
  amountPaise: number;
  note?: string;
  creditNoteId?: string | null;
  creditNoteNumber?: string | null;
};

export const ORDER_STATUS_FILTERS: Array<{ id: OrderHistoryStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Under review' },
  { id: 'paid', label: 'Confirmed' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'rejected', label: 'Rejected' },
];

export const ORDER_RANGE_FILTERS: Array<{ id: OrderHistoryRange; label: string }> = [
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 3 months' },
  { id: '365d', label: 'Last year' },
  { id: 'all', label: 'All time' },
];

function paymentBucket(order: BillingOrderLike): Exclude<OrderHistoryStatusFilter, 'all'> {
  const status = String(order.payment_status || order.status || '').toLowerCase();
  if (status === 'awaiting_confirmation') return 'review';
  if (status === 'paid') return 'paid';
  if (status === 'rejected') return 'rejected';
  return 'created';
}

export function orderHistoryBucket(order: BillingOrderLike): Exclude<OrderHistoryStatusFilter, 'all'> {
  const refund = String(order.refund_status || '').toLowerCase();
  if (refund === 'requested' || refund === 'rejected' || refund === 'refunded' || refund === 'partially_refunded') {
    return 'refunds';
  }
  return paymentBucket(order);
}

/** Split each order into payment + refund timeline rows for Products & Billing history. */
export function expandBillingHistoryEntries<T extends BillingOrderLike>(orders: T[]): BillingHistoryEntry<T>[] {
  const entries: BillingHistoryEntry<T>[] = [];
  for (const order of orders) {
    const refund = String(order.refund_status || '').toLowerCase();
    entries.push({
      key: `${order.id}-payment`,
      kind: 'payment',
      order,
      statusLabel: orderStatusLabel(order.payment_status, order.status, null),
      bucket: paymentBucket(order),
      sortAt: order.paid_at || order.claimed_at || order.created_at,
      amountPaise: Number(order.amount_paise ?? 0) || 0,
      note: order.note || undefined,
    });

    if (refund === 'requested') {
      entries.push({
        key: `${order.id}-refund-request`,
        kind: 'refund_request',
        order,
        statusLabel: 'Refund requested',
        bucket: 'refunds',
        sortAt: order.refund_request?.requested_at || order.claimed_at || order.created_at,
        amountPaise: Number(order.refund_request?.amount_paise ?? order.amount_paise ?? 0) || 0,
        note: order.refund_request?.reason || undefined,
      });
    }

    if (refund === 'rejected') {
      entries.push({
        key: `${order.id}-refund-declined`,
        kind: 'refund_declined',
        order,
        statusLabel: 'Refund declined',
        bucket: 'refunds',
        sortAt: order.claimed_at || order.created_at,
        amountPaise: Number(order.refund_request?.amount_paise ?? order.amount_paise ?? 0) || 0,
        note: order.note || order.refund_request?.reason || undefined,
      });
    }

    if (refund === 'refunded' || refund === 'partially_refunded') {
      const refundRows =
        order.refunds && order.refunds.length > 0
          ? order.refunds
          : [
              {
                amount_paise: order.refunded_paise ?? order.refund_request?.amount_paise ?? order.amount_paise,
                recorded_at: order.paid_at || order.created_at,
                note: order.note,
              },
            ];
      refundRows.forEach((row, index) => {
        const credit = order.credit_notes?.[index] ?? order.credit_notes?.[0];
        entries.push({
          key: `${order.id}-refund-${index}`,
          kind: 'refund_paid',
          order,
          statusLabel: refund === 'partially_refunded' ? 'Partially refunded' : 'Refunded',
          bucket: 'refunds',
          sortAt: row.recorded_at || credit?.issued_at || order.created_at,
          amountPaise: Number(row.amount_paise ?? 0) || 0,
          note: row.note || row.reference || undefined,
          creditNoteId: credit?.id ?? null,
          creditNoteNumber: credit?.invoice_number ?? null,
        });
      });
    }
  }
  return entries.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
}

export type BillingInterval = 'monthly' | 'yearly';

export function planPricePaise(
  catalog:
    | {
        amount_paise?: number | null;
        yearly_amount_paise?: number | null;
        yearly_months_charged?: number | null;
      }
    | null
    | undefined,
  interval: BillingInterval,
): number {
  const monthly = Number(catalog?.amount_paise ?? 0) || 0;
  if (interval === 'yearly') {
    const yearly = catalog?.yearly_amount_paise;
    if (yearly != null && Number(yearly) > 0) return Number(yearly);
    const months = Math.max(1, Math.min(12, Number(catalog?.yearly_months_charged ?? 10) || 10));
    return monthly * months;
  }
  return monthly;
}

export function yearlySavingsCopy(
  monthlyPaise: number,
  yearlyPaise: number,
  yearlyMonthsCharged?: number | null,
): { monthsFree: number; monthsCharged: number; savePercent: number; savePaise: number; label: string; detail: string } | null {
  if (monthlyPaise <= 0 || yearlyPaise <= 0) return null;
  const fullYear = monthlyPaise * 12;
  if (yearlyPaise >= fullYear) return null;
  const configured =
    yearlyMonthsCharged != null && Number(yearlyMonthsCharged) > 0
      ? Math.max(1, Math.min(12, Math.round(Number(yearlyMonthsCharged))))
      : Math.round(yearlyPaise / monthlyPaise);
  const monthsCharged = configured;
  const monthsFree = Math.max(0, 12 - monthsCharged);
  const savePaise = fullYear - yearlyPaise;
  const savePercent = Math.round((savePaise / fullYear) * 100);
  if (monthsFree <= 0 && savePercent <= 0) return null;
  const label =
    monthsFree > 0
      ? `${monthsFree} month${monthsFree === 1 ? '' : 's'} free`
      : `Save ${savePercent}%`;
  const equivMo = Math.round(yearlyPaise / 12 / 100);
  const saveInr = Math.round(savePaise / 100);
  const detail = `≈ ₹${equivMo.toLocaleString('en-IN')}/mo · saves ₹${saveInr.toLocaleString('en-IN')}/year (${monthsFree} month${monthsFree === 1 ? '' : 's'} free when yearly = ${monthsCharged}× monthly)`;
  return { monthsFree, monthsCharged, savePercent, savePaise, label, detail };
}

export function formatInrFromPaiseLocal(paise?: number | null): string | null {
  if (paise == null || Number.isNaN(Number(paise))) return null;
  return `₹${Math.round(Number(paise) / 100).toLocaleString('en-IN')}`;
}

export function filterBillingHistoryEntries<T extends BillingOrderLike>(
  entries: BillingHistoryEntry<T>[],
  opts: {
    query?: string;
    status?: OrderHistoryStatusFilter;
    range?: OrderHistoryRange;
    /** Inclusive YYYY-MM-DD. When set, overrides the preset range. */
    dateFrom?: string;
    /** Inclusive YYYY-MM-DD. When set, overrides the preset range. */
    dateTo?: string;
    productCode?: string;
    productName?: (code: string) => string;
  } = {},
): BillingHistoryEntry<T>[] {
  const query = String(opts.query || '').trim().toLowerCase();
  const status = opts.status || 'all';
  const range = opts.range || 'all';
  const productCode = String(opts.productCode || '').trim();
  const dateFrom = String(opts.dateFrom || '').trim();
  const dateTo = String(opts.dateTo || '').trim();
  const useCustomDates = Boolean(dateFrom || dateTo);
  const days = range === '30d' ? 30 : range === '90d' ? 90 : range === '365d' ? 365 : null;
  const cutoff = useCustomDates || days == null ? null : Date.now() - days * 86_400_000;
  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

  return entries.filter((entry) => {
    if (status !== 'all' && entry.bucket !== status) return false;
    const order = entry.order;
    if (productCode) {
      const codes = order.product_codes?.length ? order.product_codes : [order.product_code];
      if (!codes.includes(productCode)) return false;
    }
    const when = new Date(entry.sortAt).getTime();
    if (useCustomDates) {
      if (Number.isNaN(when)) return false;
      if (fromMs != null && !Number.isNaN(fromMs) && when < fromMs) return false;
      if (toMs != null && !Number.isNaN(toMs) && when > toMs) return false;
    } else if (cutoff != null) {
      if (Number.isNaN(when) || when < cutoff) return false;
    }
    if (!query) return true;
    const codes = (order.product_codes?.length ? order.product_codes : [order.product_code]).filter(Boolean) as string[];
    const names = opts.productName ? codes.map((code) => opts.productName!(code)) : [];
    const haystack = [
      order.order_number,
      order.id,
      order.upi_utr,
      order.plan_code,
      order.business_name,
      order.tenant_name,
      order.tenant_slug,
      order.note,
      order.invoice_number,
      order.payment_status,
      order.refund_status,
      entry.statusLabel,
      entry.note,
      entry.creditNoteNumber,
      ...codes,
      ...names,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/**
 * One row per checkout order (for admin tables).
 * Dedupes after expand — otherwise refunded orders appear twice (payment + refund).
 */
export function filterBillingOrders<T extends BillingOrderLike>(
  orders: T[],
  opts: {
    query?: string;
    status?: OrderHistoryStatusFilter;
    range?: OrderHistoryRange;
    dateFrom?: string;
    dateTo?: string;
    productCode?: string;
    productName?: (code: string) => string;
  } = {},
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of filterBillingHistoryEntries(expandBillingHistoryEntries(orders), opts)) {
    if (seen.has(entry.order.id)) continue;
    seen.add(entry.order.id);
    out.push(entry.order);
  }
  return out;
}

/** Counts unique orders by their primary status bucket (admin claim/order lists). */
export function orderListHistoryCounts(orders: BillingOrderLike[]) {
  const counts: Record<OrderHistoryStatusFilter, number> = {
    all: orders.length,
    review: 0,
    paid: 0,
    rejected: 0,
    refunds: 0,
    created: 0,
  };
  for (const order of orders) {
    counts[orderHistoryBucket(order)] += 1;
  }
  return counts;
}

export function orderHistoryCounts(orders: BillingOrderLike[]) {
  const entries = expandBillingHistoryEntries(orders);
  const counts: Record<OrderHistoryStatusFilter, number> = {
    all: entries.length,
    review: 0,
    paid: 0,
    rejected: 0,
    refunds: 0,
    created: 0,
  };
  entries.forEach((entry) => {
    counts[entry.bucket] += 1;
  });
  return counts;
}
