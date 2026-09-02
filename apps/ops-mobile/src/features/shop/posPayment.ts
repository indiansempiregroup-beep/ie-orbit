import type { ShopOrder } from '@ie-orbit/sdk';

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
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivery_failed', label: 'Delivery failed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function shopOrderStatusStyle(status?: string | null): { bg: string; text: string; label: string } {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { bg: '#D1FAE5', text: '#047857', label: 'Completed' };
  if (value === 'ready') return { bg: '#DBEAFE', text: '#1D4ED8', label: 'Ready' };
  if (value === 'out_for_delivery') {
    return { bg: '#CFFAFE', text: '#0E7490', label: 'Out for delivery' };
  }
  if (value === 'delivery_failed') return { bg: '#FEE2E2', text: '#B91C1C', label: 'Delivery failed' };
  if (value === 'confirmed') return { bg: '#E0E7FF', text: '#3730A3', label: 'Confirmed' };
  if (value === 'cancelled') return { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' };
  if (value === 'pending') return { bg: '#FEF3C7', text: '#B45309', label: 'Pending' };
  return { bg: '#E2E8F0', text: '#475569', label: value || 'Status' };
}

export type ShopOrderDeliveryMeta = {
  booking_id?: string;
  partner_status?: string;
  rider?: { name?: string; phone?: string; vehicle?: string; photo_url?: string };
  eta_minutes?: number;
  status?: string;
};

export function getShopOrderDeliveryMeta(order: ShopOrder): ShopOrderDeliveryMeta {
  const delivery = order.metadata?.delivery;
  if (!delivery || typeof delivery !== 'object') return {};
  return delivery as ShopOrderDeliveryMeta;
}

export function shopDeliveryPartnerStatusStyle(
  partnerStatus?: string | null,
): { bg: string; text: string; label: string } | null {
  const value = String(partnerStatus || '').toLowerCase();
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    finding_rider: { bg: '#FEF3C7', text: '#B45309', label: 'Finding rider' },
    rider_assigned: { bg: '#E0E7FF', text: '#3730A3', label: 'Rider assigned' },
    at_pickup: { bg: '#E0E7FF', text: '#3730A3', label: 'Rider at shop' },
    picked_up: { bg: '#CFFAFE', text: '#0E7490', label: 'On the way' },
    nearby: { bg: '#CFFAFE', text: '#0E7490', label: 'Nearby' },
    delivered: { bg: '#D1FAE5', text: '#047857', label: 'Delivered' },
    failed: { bg: '#FEE2E2', text: '#B91C1C', label: 'Delivery failed' },
    cancelled: { bg: '#FEE2E2', text: '#B91C1C', label: 'Delivery cancelled' },
  };
  return styles[value] ?? null;
}

/**
 * Order status is coarse, so a dispatched delivery shows the partner's stage
 * instead of sitting on "Ready" until the rider picks up.
 */
export function shopOrderBadgeStyle(order: ShopOrder): { bg: string; text: string; label: string } {
  const fallback = shopOrderStatusStyle(order.status);
  const delivery = getShopOrderDeliveryMeta(order);
  if (!delivery.booking_id) return fallback;
  if (['cancelled', 'delivery_failed'].includes(String(order.status || '').toLowerCase())) {
    return fallback;
  }
  return shopDeliveryPartnerStatusStyle(delivery.partner_status) ?? fallback;
}

export function nextShopOrderAction(
  status?: string | null,
  fulfillment?: string | null,
  deliveryMethod?: string | null,
): { status: string; label: string; hint: string } | null {
  const value = String(status || '').toLowerCase();
  const delivery = String(fulfillment || '').toLowerCase() === 'delivery';
  const instant = delivery && String(deliveryMethod || '').toLowerCase() === 'instant';
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
    if (instant || delivery) return null;
    return {
      status: 'completed',
      label: 'Mark picked up',
      hint: 'Customer has collected the order.',
    };
  }
  if (value === 'out_for_delivery') {
    return {
      status: 'completed',
      label: 'Mark delivered',
      hint: 'Use this only if the provider has not already confirmed delivery.',
    };
  }
  if (value === 'delivery_failed') {
    if (instant) {
      return {
        status: 'completed',
        label: 'Mark delivered',
        hint: 'Retry with another rider, deliver it yourself, or mark it delivered if already received.',
      };
    }
    return {
      status: 'completed',
      label: 'Mark delivered',
      hint: 'The delivery failed. Mark it delivered only if the customer has now received it, or cancel and refund.',
    };
  }
  return null;
}

export function canCancelShopOrder(status?: string | null): boolean {
  return ['pending', 'confirmed', 'ready', 'delivery_failed'].includes(
    String(status || '').toLowerCase(),
  );
}

export function canDispatchShopOrder(order: ShopOrder): boolean {
  const status = String(order.status || '').toLowerCase();
  if (status === 'delivery_failed') return true;
  if (status !== 'ready') return false;
  // Status stays "ready" until pickup; hide once a rider is already booked.
  return !getShopOrderDeliveryMeta(order).booking_id;
}

export function formatMoney(value: string | number | undefined | null, fallback = '0.00'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(2);
}
