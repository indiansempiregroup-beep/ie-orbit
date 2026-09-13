import type { BusinessProductSubscription } from '@ie-orbit/sdk';
import { getProductName } from './products';

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

export function renewCtaLabel(productCode: string): string {
  return `Renew ${getProductName(productCode)}`;
}

export function orderStatusLabel(paymentStatus?: string | null, sessionStatus?: string | null): string {
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
  return 3;
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
  created_at: string;
  claimed_at?: string | null;
  paid_at?: string | null;
  note?: string;
  invoice_number?: string | null;
};

export type OrderHistoryStatusFilter = 'all' | 'review' | 'paid' | 'rejected' | 'created';
export type OrderHistoryRange = '30d' | '90d' | '365d' | 'all';

export const ORDER_STATUS_FILTERS: Array<{ id: OrderHistoryStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'review', label: 'Under review' },
  { id: 'paid', label: 'Confirmed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'created', label: 'Awaiting payment' },
];

export const ORDER_RANGE_FILTERS: Array<{ id: OrderHistoryRange; label: string }> = [
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 3 months' },
  { id: '365d', label: 'Last year' },
  { id: 'all', label: 'All time' },
];

export function orderHistoryBucket(order: BillingOrderLike): Exclude<OrderHistoryStatusFilter, 'all'> {
  const status = String(order.payment_status || order.status || '').toLowerCase();
  if (status === 'awaiting_confirmation') return 'review';
  if (status === 'paid') return 'paid';
  if (status === 'rejected') return 'rejected';
  return 'created';
}

export function filterBillingOrders<T extends BillingOrderLike>(
  orders: T[],
  opts: {
    query?: string;
    status?: OrderHistoryStatusFilter;
    range?: OrderHistoryRange;
    productCode?: string;
    productName?: (code: string) => string;
  } = {},
): T[] {
  const query = String(opts.query || '').trim().toLowerCase();
  const status = opts.status || 'all';
  const range = opts.range || 'all';
  const productCode = String(opts.productCode || '').trim();
  const days = range === '30d' ? 30 : range === '90d' ? 90 : range === '365d' ? 365 : null;
  const cutoff = days == null ? null : Date.now() - days * 86_400_000;

  return orders.filter((order) => {
    if (status !== 'all' && orderHistoryBucket(order) !== status) return false;
    if (productCode) {
      const codes = order.product_codes?.length ? order.product_codes : [order.product_code];
      if (!codes.includes(productCode)) return false;
    }
    if (cutoff != null) {
      const when = new Date(order.paid_at || order.claimed_at || order.created_at).getTime();
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
      ...codes,
      ...names,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function orderHistoryCounts(orders: BillingOrderLike[]) {
  const counts: Record<OrderHistoryStatusFilter, number> = {
    all: orders.length,
    review: 0,
    paid: 0,
    rejected: 0,
    created: 0,
  };
  orders.forEach((order) => {
    counts[orderHistoryBucket(order)] += 1;
  });
  return counts;
}

export function nextPaymentCopy(subscription?: BusinessProductSubscription | null, amountLabel?: string | null): string {
  const due = subscriptionDueAt(subscription);
  const date = due ? new Date(due).toLocaleDateString() : '—';
  const amount = amountLabel ? ` · ${amountLabel}` : '';
  return `Next payment due ${date}${amount}. We do not charge automatically.`;
}
