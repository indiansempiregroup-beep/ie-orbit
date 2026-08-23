import { getActiveIntlLocale } from '@ie-platform/i18n';
import { SHOP_PRODUCT_CATEGORIES, type ShopOrder, type ShopProduct } from '@ie-platform/sdk';
import { colors } from '../../theme/tokens';

const NONE = '__none__';

export const UNCATEGORIZED_ID = NONE;

export function shopCategoryKey(category?: ShopProduct['category'] | null): string {
  if (!category) return '';
  return typeof category === 'string' ? category : String(category);
}

export function shopCategoryLabel(category?: ShopProduct['category'] | null): string {
  const raw = shopCategoryKey(category);
  if (!raw) return 'Uncategorized';
  return SHOP_PRODUCT_CATEGORIES.find((item) => item.value === raw)?.label ?? raw.replace(/_/g, ' ');
}

export function isProductTaxInclusive(product: Pick<ShopProduct, 'tax_inclusive' | 'metadata'>): boolean {
  if (typeof product.tax_inclusive === 'boolean') return product.tax_inclusive;
  const meta = product.metadata;
  return Boolean(meta && typeof meta === 'object' && meta.tax_inclusive === true);
}

export function shopLinePayable(product: ShopProduct, quantity: number): number {
  const qty = Number(quantity) || 0;
  const price = Number(product.price) || 0;
  const gross = price * qty;
  const rate = Number(product.tax_rate ?? product.gst_rate ?? 0) || 0;
  if (!rate || isProductTaxInclusive(product)) return gross;
  return gross + (gross * rate) / 100;
}

export function formatShopMoney(amount: string | number | null | undefined, currency?: string | null): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const code = currency?.trim() || 'INR';
  try {
    return new Intl.NumberFormat(getActiveIntlLocale(), { style: 'currency', currency: code }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

export function isOutOfStock(product: Pick<ShopProduct, 'stock_on_hand'>): boolean {
  return product.stock_on_hand != null && Number(product.stock_on_hand) <= 0;
}

export function stockLabel(product: Pick<ShopProduct, 'stock_on_hand'>): string {
  if (product.stock_on_hand == null) return '';
  const qty = Number(product.stock_on_hand);
  if (!Number.isFinite(qty) || qty <= 0) return 'Out of stock';
  if (qty <= 5) return `Only ${qty} left`;
  return 'In stock';
}

export type ShopSortKey = 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'rating';

export const SHOP_SORT_OPTIONS: Array<{ id: ShopSortKey; label: string }> = [
  { id: 'featured', label: 'Featured' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'newest', label: 'Newest' },
  { id: 'rating', label: 'Top rated' },
];

export function formatShopTimeLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || hours > 23 || !Number.isFinite(minutes)) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function nextAvailablePickupTime(minuteStep = 15): string | null {
  const now = new Date();
  let total = now.getHours() * 60 + now.getMinutes() + 1;
  const remainder = total % minuteStep;
  if (remainder !== 0) total += minuteStep - remainder;
  if (total >= 24 * 60) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isPickupTimeAfterNow(dateIso: string, timeHhmm: string): boolean {
  if (!dateIso || !timeHhmm) return false;
  const today = formatShopDateIso(new Date());
  if (dateIso > today) return true;
  if (dateIso < today) return false;
  const min = nextAvailablePickupTime();
  if (!min) return false;
  return timeHhmm >= min;
}

export function formatShopDateIso(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function formatShopDateLabel(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatShopQty(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '—');
  return Number.isInteger(n) ? String(n) : String(n);
}

export function formatShopOrderPlaced(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(getActiveIntlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export type ShopOrderStatusFilter = 'all' | 'processing' | 'ready' | 'completed' | 'cancelled';
export type ShopOrderPeriodFilter = '30d' | '3m' | 'year' | 'all';
export type ShopOrderFulfillmentFilter = 'all' | 'pickup' | 'delivery';
export type ShopOrderPaymentFilter = 'all' | 'unpaid';
export type ShopOrderStatusTone = 'success' | 'warning' | 'info' | 'danger' | 'muted';

export const SHOP_ORDER_STATUS_FILTERS: Array<{ id: ShopOrderStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Ready' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export const SHOP_ORDER_PERIOD_FILTERS: Array<{ id: ShopOrderPeriodFilter; label: string }> = [
  { id: '30d', label: 'Last 30 days' },
  { id: '3m', label: 'Last 3 months' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

export const SHOP_ORDER_FULFILLMENT_FILTERS: Array<{ id: ShopOrderFulfillmentFilter; label: string }> = [
  { id: 'all', label: 'Any type' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'delivery', label: 'Delivery' },
];

export function shopFulfillmentLabel(mode?: string | null): string {
  const value = String(mode || '').toLowerCase();
  if (value === 'delivery') return 'Delivery';
  if (value === 'pos') return 'In-store';
  return 'Pickup';
}

export function shopPaymentMethodLabel(method?: string | null): string {
  const value = String(method || '').toLowerCase();
  if (value === 'upi') return 'UPI';
  if (value === 'card') return 'Card';
  if (value === 'borrow') return 'On account';
  if (value === 'cash') return 'Cash';
  return 'Payment';
}

export function shopPaymentStatusLabel(status?: string | null): string {
  const value = String(status || '').toLowerCase();
  if (value === 'paid' || value === 'settled') return 'Paid';
  if (value === 'awaiting_confirmation') return 'Awaiting confirmation';
  if (value === 'rejected') return 'Payment rejected';
  if (value === 'due') return 'Payment due';
  return 'Unpaid';
}

export function isShopOrderUnpaid(order: Pick<ShopOrder, 'payment_status'>): boolean {
  const value = String(order.payment_status || '').toLowerCase();
  return !['paid', 'settled', 'awaiting_confirmation'].includes(value);
}

export function shopOrderStatusTone(status?: string | null): ShopOrderStatusTone {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'delivered') return 'success';
  if (['ready', 'packed', 'confirmed', 'out_for_delivery'].includes(value)) return 'info';
  if (value === 'pending' || value === 'order_placed') return 'warning';
  if (['cancelled', 'delivery_cancelled', 'delivery_failed', 'failed'].includes(value)) return 'danger';
  return 'muted';
}

export function shopOrderStatusColors(tone: ShopOrderStatusTone): { bg: string; text: string; dot: string } {
  switch (tone) {
    case 'success':
      return { bg: '#ECFDF5', text: '#047857', dot: colors.success };
    case 'warning':
      return { bg: '#FFFBEB', text: '#B45309', dot: colors.warning };
    case 'info':
      return { bg: '#EFF6FF', text: '#1D4ED8', dot: '#2563EB' };
    case 'danger':
      return { bg: '#FEF2F2', text: '#B91C1C', dot: colors.destructive };
    default:
      return { bg: '#F1F5F9', text: '#475569', dot: colors.mutedForeground };
  }
}

const PARTNER_HEADLINES: Record<
  string,
  { title: string; subtitle: string; tone: ShopOrderStatusTone }
> = {
  finding_rider: {
    title: 'Finding your rider',
    subtitle: 'The shop is looking for a rider to pick up your parcel.',
    tone: 'warning',
  },
  rider_assigned: {
    title: 'Rider assigned',
    subtitle: 'Your rider is heading to the shop for pickup.',
    tone: 'info',
  },
  at_pickup: {
    title: 'Rider at the shop',
    subtitle: 'Your rider is collecting the parcel now.',
    tone: 'info',
  },
  picked_up: {
    title: 'On the way',
    subtitle: 'Your order is with the rider and on the way.',
    tone: 'info',
  },
  nearby: {
    title: 'Almost there',
    subtitle: 'Your rider is close by. Keep your phone handy.',
    tone: 'info',
  },
  failed: {
    title: 'Delivery needs attention',
    subtitle: 'The delivery could not be completed. The shop will get in touch.',
    tone: 'danger',
  },
  cancelled: {
    title: 'Delivery cancelled',
    subtitle: 'The rider trip was cancelled. The shop still has your order.',
    tone: 'danger',
  },
};

export function shopOrderHeadline(
  order: Pick<ShopOrder, 'status' | 'fulfillment_mode' | 'metadata'>,
): {
  title: string;
  subtitle: string;
  tone: ShopOrderStatusTone;
} {
  const status = String(order.status || '').toLowerCase();
  const delivery = String(order.fulfillment_mode || '').toLowerCase() === 'delivery';
  const tone = shopOrderStatusTone(status);
  if (status === 'cancelled' || status === 'delivery_cancelled') {
    return { title: 'Cancelled', subtitle: 'This order was cancelled.', tone };
  }
  if (status === 'delivery_failed' || status === 'failed') {
    return {
      title: 'Delivery needs attention',
      subtitle: 'The delivery could not be completed. The shop is arranging the next step.',
      tone,
    };
  }
  // A dispatched rider is more specific than the order's own status, which
  // stays on "ready" until the parcel is actually picked up.
  const meta =
    order.metadata && typeof order.metadata === 'object'
      ? ((order.metadata as Record<string, unknown>).delivery as
          | { booking_id?: string; partner_status?: string }
          | undefined)
      : undefined;
  if (!['completed', 'delivered'].includes(status) && meta?.partner_status) {
    const partner = PARTNER_HEADLINES[String(meta.partner_status || '').toLowerCase()];
    if (partner) return partner;
  }
  if (status === 'completed' || status === 'delivered') {
    return {
      title: delivery ? 'Delivered' : 'Picked up',
      subtitle: delivery ? 'Your order has been delivered.' : 'Your order has been collected.',
      tone,
    };
  }
  if (status === 'ready' || status === 'packed') {
    return {
      title: delivery ? 'Packed and ready' : 'Ready for pickup',
      subtitle: delivery
        ? 'The shop will request your rider when the parcel is ready to hand over.'
        : 'You can collect this order from the shop.',
      tone,
    };
  }
  if (status === 'out_for_delivery') {
    return {
      title: 'Out for delivery',
      subtitle: 'Your order is with the rider and on the way.',
      tone,
    };
  }
  if (status === 'confirmed') {
    return {
      title: 'Confirmed',
      subtitle: delivery ? 'The shop is packing your delivery.' : 'The shop is preparing your order.',
      tone,
    };
  }
  return {
    title: 'Order placed',
    subtitle: 'We have received your order and will update you soon.',
    tone,
  };
}

export function shopOrderDeliverySummary(
  order: Pick<ShopOrder, 'status' | 'fulfillment_mode' | 'metadata'>,
): { active: boolean; statusLabel: string; etaLabel: string | null; actionLabel: 'Track' | 'View' } | null {
  if (String(order.fulfillment_mode || '').toLowerCase() !== 'delivery') return null;
  const status = String(order.status || '').toLowerCase();
  const metadata = order.metadata && typeof order.metadata === 'object'
    ? (order.metadata as Record<string, unknown>)
    : {};
  const delivery = metadata.delivery && typeof metadata.delivery === 'object'
    ? (metadata.delivery as Record<string, unknown>)
    : {};
  const eta = Number(delivery.eta_minutes ?? metadata.eta_minutes);
  const terminal = ['completed', 'delivered', 'cancelled'].includes(status);
  return {
    active: !terminal,
    statusLabel: shopOrderHeadline(order).title,
    etaLabel: !terminal && Number.isFinite(eta) && eta > 0 ? `${Math.round(eta)} min` : null,
    actionLabel: terminal ? 'View' : 'Track',
  };
}

export function shopOrderCanCancel(status?: string | null): boolean {
  return String(status || '').toLowerCase() === 'pending';
}

export function shopOrderCanReturn(status?: string | null): boolean {
  return String(status || '').toLowerCase() === 'completed';
}

export function shopRefundPlan(
  order: Pick<ShopOrder, 'payment_method' | 'payment_status' | 'currency'>,
  amount: number,
): { title: string; body: string; mode: string } {
  const method = String(order.payment_method || '').toLowerCase();
  const paid = ['paid', 'settled'].includes(String(order.payment_status || '').toLowerCase());
  const money = formatShopMoney(amount, order.currency);
  if (!paid) {
    return {
      mode: 'bill_adjustment',
      title: 'Bill credit',
      body: `${money} will be taken off this unpaid bill. No cash refund is needed.`,
    };
  }
  if (method === 'upi') {
    return {
      mode: 'original_payment',
      title: 'UPI refund',
      body: `The shop will send ${money} back to your UPI after this return is recorded.`,
    };
  }
  if (method === 'card') {
    return {
      mode: 'original_payment',
      title: 'Card refund',
      body: `The shop will refund ${money} to the original card.`,
    };
  }
  if (method === 'borrow') {
    return {
      mode: 'account_credit',
      title: 'Account credit',
      body: `${money} will be credited to your shop account.`,
    };
  }
  return {
    mode: 'cash_at_shop',
    title: 'Cash refund',
    body: `Collect ${money} in cash from the shop. Show this return to the staff if needed.`,
  };
}

export function shopOrderTimeline(order: Pick<ShopOrder, 'status' | 'fulfillment_mode'>): Array<{
  key: string;
  label: string;
  done: boolean;
  current: boolean;
}> {
  const status = String(order.status || '').toLowerCase();
  const delivery = String(order.fulfillment_mode || '').toLowerCase() === 'delivery';
  const rankByStatus: Record<string, number> = {
    order_placed: 0,
    pending: 0,
    confirmed: 1,
    packed: 2,
    ready: 2,
    out_for_delivery: 3,
    // A failed trip puts the parcel back at the packed step, awaiting a retry.
    delivery_failed: 2,
    completed: delivery ? 4 : 3,
    delivered: delivery ? 4 : 3,
    cancelled: -1,
  };
  const rank = rankByStatus[status] ?? 0;
  const steps = [
    { key: 'pending', label: 'Ordered' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'ready', label: delivery ? 'Packed' : 'Ready' },
    ...(delivery ? [{ key: 'out_for_delivery', label: 'On the way' }] : []),
    { key: 'completed', label: delivery ? 'Delivered' : 'Picked up' },
  ];
  return steps.map((step, index) => ({
    ...step,
    done: rank >= index,
    current: rank === index,
  }));
}

export function shopOrderMatchesFilters(
  order: ShopOrder,
  filters: {
    query: string;
    status: ShopOrderStatusFilter;
    period: ShopOrderPeriodFilter;
    fulfillment: ShopOrderFulfillmentFilter;
    payment: ShopOrderPaymentFilter;
  },
): boolean {
  const status = String(order.status || '').toLowerCase();
  if (
    filters.status === 'processing' &&
    !['order_placed', 'pending', 'confirmed', 'out_for_delivery', 'delivery_failed'].includes(status)
  ) {
    return false;
  }
  if (filters.status === 'ready' && !['ready', 'packed'].includes(status)) return false;
  if (filters.status === 'completed' && !['completed', 'delivered'].includes(status)) return false;
  if (filters.status === 'cancelled' && status !== 'cancelled') return false;

  const mode = String(order.fulfillment_mode || '').toLowerCase();
  if (filters.fulfillment !== 'all' && mode !== filters.fulfillment) return false;

  if (filters.payment === 'unpaid' && !isShopOrderUnpaid(order)) return false;

  if (filters.period !== 'all') {
    const created = order.created_at ? new Date(order.created_at).getTime() : 0;
    const now = Date.now();
    if (filters.period === '30d' && created < now - 30 * 24 * 60 * 60 * 1000) return false;
    if (filters.period === '3m' && created < now - 90 * 24 * 60 * 60 * 1000) return false;
    if (filters.period === 'year') {
      const year = new Date().getFullYear();
      if (!order.created_at || new Date(order.created_at).getFullYear() !== year) return false;
    }
  }

  const needle = filters.query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    order.order_number,
    order.status,
    order.fulfillment_mode,
    order.payment_status,
    order.payment_method,
    order.coupon_code,
    order.delivery_address,
    ...(order.lines ?? []).map((line) => line.product_name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}
