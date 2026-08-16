import type { ShopOrder } from '@ie-platform/sdk';

export type PosMeta = {
  payment_method?: string;
  payment_status?: string;
  amount_due?: string | number;
  amount_paid?: string | number;
  bill_discount_type?: string;
  bill_discount_value?: string | number;
  bill_discount_amount?: string | number;
  line_discount_total?: string | number;
};

export function getShopOrderPosMeta(order: ShopOrder): PosMeta {
  const pos = order.metadata?.pos;
  if (!pos || typeof pos !== 'object') return {};
  return pos as PosMeta;
}

export function formatShopOrderPayment(order: ShopOrder): string {
  const pos = getShopOrderPosMeta(order);
  const method = String(pos.payment_method || '').toLowerCase();
  if (!method) return '';
  if (method === 'borrow') {
    const due = Number(pos.amount_due ?? order.total ?? 0);
    if (due > 0) return `Borrow · Due ${due.toFixed(2)}`;
    return 'Borrow · Settled';
  }
  return method.toUpperCase();
}

export function isShopOrderBorrowDue(order: ShopOrder): boolean {
  const pos = getShopOrderPosMeta(order);
  return (
    String(pos.payment_method || '').toLowerCase() === 'borrow' &&
    Number(pos.amount_due ?? order.total ?? 0) > 0
  );
}

export function formatShopOrderFulfillment(mode?: string | null): string {
  const value = String(mode || '').toLowerCase();
  if (value === 'pos') return 'Counter sale';
  if (value === 'pickup') return 'Pickup';
  if (value === 'delivery') return 'Delivery';
  return mode || '—';
}

export const SHOP_ORDER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function shopOrderStatusStyle(status?: string | null): { bg: string; text: string; label: string } {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { bg: '#D1FAE5', text: '#047857', label: 'Completed' };
  if (value === 'ready') return { bg: '#DBEAFE', text: '#1D4ED8', label: 'Ready' };
  if (value === 'confirmed') return { bg: '#E0E7FF', text: '#3730A3', label: 'Confirmed' };
  if (value === 'cancelled') return { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' };
  if (value === 'pending') return { bg: '#FEF3C7', text: '#B45309', label: 'Pending' };
  return { bg: '#E2E8F0', text: '#475569', label: value || 'Status' };
}

export function nextShopOrderAction(
  status?: string | null,
  fulfillment?: string | null,
): { status: string; label: string; hint: string } | null {
  const value = String(status || '').toLowerCase();
  const delivery = String(fulfillment || '').toLowerCase() === 'delivery';
  if (value === 'pending') {
    return {
      status: 'confirmed',
      label: 'Confirm order',
      hint: 'Accept this order. Stock is deducted when you confirm.',
    };
  }
  if (value === 'confirmed') {
    return {
      status: 'ready',
      label: delivery ? 'Ready to ship' : 'Ready for pickup',
      hint: delivery
        ? 'Packed and ready to go out for delivery. The customer will see Out for delivery.'
        : 'Packed and waiting at the counter. The customer will see Ready for pickup.',
    };
  }
  if (value === 'ready') {
    return {
      status: 'completed',
      label: delivery ? 'Mark delivered' : 'Mark picked up',
      hint: delivery
        ? 'Customer has received the order.'
        : 'Customer has collected the order.',
    };
  }
  return null;
}

export function canCancelShopOrder(status?: string | null): boolean {
  return ['pending', 'confirmed', 'ready'].includes(String(status || '').toLowerCase());
}

export function formatMoney(value: string | number | undefined | null, fallback = '0.00'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(2);
}
