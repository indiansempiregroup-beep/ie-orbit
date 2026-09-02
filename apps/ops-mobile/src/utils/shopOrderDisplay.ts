import type { ShopOrder } from '@ie-orbit/sdk';
import { deliveryMethodForOrder, deliverySummaryFromOrder, formatDeliveryStatus } from '../features/shop/deliveryTracking';
import {
  formatMoney,
  formatShopOrderFulfillment,
  formatShopOrderPayment,
  nextShopOrderAction,
} from '../features/shop/posPayment';
import { formatDate, formatTime } from './format';

export const ONLINE_FULFILLMENT_MODES = new Set(['pickup', 'delivery']);

export const OPEN_ORDER_STATUSES = new Set([
  'pending',
  'delivery_failed',
  'confirmed',
  'ready',
  'out_for_delivery',
]);

const HOME_ORDER_STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  delivery_failed: 1,
  confirmed: 2,
  ready: 3,
  out_for_delivery: 4,
};

export function isOnlineShopOrder(order: ShopOrder): boolean {
  return ONLINE_FULFILLMENT_MODES.has(String(order.fulfillment_mode || '').toLowerCase());
}

export function isOpenShopOrder(order: ShopOrder): boolean {
  return OPEN_ORDER_STATUSES.has(String(order.status || '').toLowerCase());
}

export function filterOpenOnlineOrders(orders: ShopOrder[]): ShopOrder[] {
  return orders.filter((order) => isOnlineShopOrder(order) && isOpenShopOrder(order));
}

export function sortHomeOrders(orders: ShopOrder[]): ShopOrder[] {
  return [...orders].sort((a, b) => {
    const aPriority = HOME_ORDER_STATUS_PRIORITY[String(a.status || '').toLowerCase()] ?? 99;
    const bPriority = HOME_ORDER_STATUS_PRIORITY[String(b.status || '').toLowerCase()] ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

export function homeOrdersFromList(orders: ShopOrder[], limit = 5): ShopOrder[] {
  return sortHomeOrders(filterOpenOnlineOrders(orders)).slice(0, limit);
}

export function orderCustomerLabel(order: ShopOrder, customerMap?: Map<string, string>): string {
  if (order.customer_name?.trim()) return order.customer_name.trim();
  if (order.customer_id && customerMap?.has(order.customer_id)) {
    return customerMap.get(order.customer_id) || 'Customer';
  }
  return 'Walk-in';
}

export function orderCustomerPhone(order: ShopOrder): string {
  return String(order.customer_phone || '').trim();
}

export function orderLinePreview(order: ShopOrder, maxLines = 2): string {
  return (order.lines ?? [])
    .slice(0, maxLines)
    .map((line) => `${line.product_name} × ${line.quantity}`)
    .join(', ');
}

export function orderItemCount(order: ShopOrder): number {
  return (order.lines ?? []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
}

/** Primary card headline — what staff need to pack. */
export function orderTitle(order: ShopOrder): string {
  const lines = order.lines ?? [];
  if (lines.length === 0) return 'Online order';
  if (lines.length === 1) {
    return `${lines[0].product_name} × ${lines[0].quantity}`;
  }
  const preview = orderLinePreview(order, 1);
  const extra = lines.length - 1;
  const count = orderItemCount(order);
  return `${preview} +${extra} more · ${count} items`;
}

export function orderNumberLabel(orderNumber: string): string {
  const value = orderNumber.trim();
  return value.startsWith('#') ? value : `#${value}`;
}

export function orderRefLabel(order: ShopOrder): string {
  return orderNumberLabel(order.order_number);
}

export function orderCreatedDateLabel(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const date = formatDate(createdAt);
  return date === '—' ? null : date;
}

export function orderFulfillmentLabel(order: ShopOrder): string {
  const mode = String(order.fulfillment_mode || '').toLowerCase();
  if (mode === 'delivery') {
    return deliveryMethodForOrder(order) === 'instant' ? 'Deliver now' : 'Delivery';
  }
  return formatShopOrderFulfillment(order.fulfillment_mode);
}

export function orderTotalLabel(order: ShopOrder): string {
  const currency = String(order.currency || 'INR').toUpperCase();
  const amount = formatMoney(order.total);
  return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
}

export function orderMetaSummary(order: ShopOrder): string {
  const parts = [orderFulfillmentLabel(order)];
  const count = orderItemCount(order);
  if (count > 0) parts.push(`${count} item${count === 1 ? '' : 's'}`);
  const payment = formatShopOrderPayment(order);
  if (payment) parts.push(payment);
  return parts.join(' · ');
}

export function orderDeliveryNote(order: ShopOrder): string | null {
  const mode = String(order.fulfillment_mode || '').toLowerCase();
  if (mode !== 'delivery') return null;

  const summary = deliverySummaryFromOrder(order);
  if (summary.status || summary.etaMinutes != null) {
    const status = summary.status ? formatDeliveryStatus(summary.status) : 'Delivery active';
    return summary.etaMinutes != null ? `${status} · ETA ${summary.etaMinutes} min` : status;
  }

  const address = String(order.delivery_address || '').trim();
  if (!address) return null;
  return address.length > 48 ? `${address.slice(0, 48)}…` : address;
}

export function orderNextActionLabel(order: ShopOrder): string | null {
  const deliveryMethod = deliveryMethodForOrder(order);
  const next =
    deliveryMethod === 'instant' && order.status === 'delivery_failed'
      ? null
      : nextShopOrderAction(order.status, order.fulfillment_mode, deliveryMethod);
  return next?.label ?? null;
}

export function orderRelativeTimeLabel(createdAt?: string | null, now = new Date()): string {
  if (!createdAt) return '—';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '—';

  const diffMinutes = Math.round((now.getTime() - created.getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
  return formatTime(createdAt);
}

export function orderTimeLabel(createdAt?: string | null, now = new Date()): { label: string; time: string } {
  if (!createdAt) return { label: '—', time: '—' };
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return { label: '—', time: '—' };

  const diffMinutes = Math.round((now.getTime() - created.getTime()) / 60000);
  let label: string;
  if (diffMinutes < 1) label = 'Just now';
  else if (diffMinutes < 60) label = `${diffMinutes} min ago`;
  else {
    const hours = Math.floor(diffMinutes / 60);
    if (hours < 24) label = hours === 1 ? '1 hr ago' : `${hours} hr ago`;
    else label = formatTime(createdAt);
  }

  return { label, time: formatTime(createdAt) };
}
