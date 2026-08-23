import type { ShopOrder } from '@ie-platform/sdk';

const PARTNER_STATUS_LABELS: Record<string, string> = {
  packing: 'Preparing delivery',
  finding_rider: 'Finding rider',
  rider_assigned: 'Rider assigned',
  at_pickup: 'Rider at shop',
  picked_up: 'On the way',
  out_for_delivery: 'Out for delivery',
  nearby: 'Nearby',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  cancelled: 'Delivery cancelled',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivery_failed: 'Delivery failed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export type ShopOrderDeliveryMeta = {
  booking_id?: string;
  partner_status?: string;
  rider?: { name?: string; phone?: string; vehicle?: string; photo_url?: string };
  eta_minutes?: number | null;
  status?: string;
};

export function getShopOrderDeliveryMeta(order: ShopOrder): ShopOrderDeliveryMeta {
  const delivery = order.metadata?.delivery;
  if (!delivery || typeof delivery !== 'object') return {};
  return delivery as ShopOrderDeliveryMeta;
}

/**
 * Order status is coarse, so a dispatched delivery shows the partner's stage
 * instead of sitting on "Ready" until the rider picks up.
 */
export function shopOrderStatusLabel(order: ShopOrder): string {
  const status = String(order.status || '').toLowerCase();
  const fallback = ORDER_STATUS_LABELS[status] ?? status;
  const delivery = getShopOrderDeliveryMeta(order);
  if (!delivery.booking_id || ['cancelled', 'delivery_failed'].includes(status)) return fallback;
  const partner = String(delivery.partner_status || '').toLowerCase();
  return PARTNER_STATUS_LABELS[partner] ?? fallback;
}

export function shopOrderDeliveryMethod(order: ShopOrder): string {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  const method = String(metadata.delivery_method || '').toLowerCase();
  if (method) return method;
  return typeof metadata.delivery === 'object' && metadata.delivery !== null ? 'instant' : 'standard';
}

export function shopOrderDeliverySummary(order: ShopOrder): string {
  if (String(order.fulfillment_mode || '').toLowerCase() !== 'delivery') return '';
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  const delivery = getShopOrderDeliveryMeta(order);
  const status = String(delivery.partner_status || delivery.status || '').toLowerCase();
  const rawEta = delivery.eta_minutes ?? metadata.eta_minutes;
  const eta = rawEta == null ? null : Number(rawEta);
  const label = PARTNER_STATUS_LABELS[status] ?? '';
  return [label, Number.isFinite(eta) ? `ETA ${eta} min` : ''].filter(Boolean).join(' · ');
}
