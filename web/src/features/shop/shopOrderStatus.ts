import type { ShopOrder } from '@ie-orbit/sdk';
import { getI18nInstance } from '@ie-orbit/i18n';

const PARTNER_STATUS_KEYS = [
  'packing',
  'finding_rider',
  'rider_assigned',
  'at_pickup',
  'picked_up',
  'out_for_delivery',
  'nearby',
  'delivered',
  'failed',
  'cancelled',
] as const;

const ORDER_STATUS_KEYS = [
  'pending',
  'confirmed',
  'ready',
  'out_for_delivery',
  'delivery_failed',
  'completed',
  'returned',
  'cancelled',
] as const;

function translateKnown(prefix: string, keys: readonly string[], value: string): string | undefined {
  if (!keys.includes(value)) return undefined;
  return getI18nInstance().t(`${prefix}.${value}`);
}

export function shopOrderStatusText(status: string): string {
  const key = String(status || '').toLowerCase();
  return translateKnown('shop.orders.statuses', ORDER_STATUS_KEYS, key) ?? key;
}

function partnerStatusText(status: string): string {
  return translateKnown('shop.orders.partnerStatuses', PARTNER_STATUS_KEYS, status) ?? '';
}

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
  const fallback = shopOrderStatusText(status);
  const delivery = getShopOrderDeliveryMeta(order);
  if (!delivery.booking_id || ['cancelled', 'delivery_failed', 'returned'].includes(status)) {
    return fallback;
  }
  const partner = String(delivery.partner_status || '').toLowerCase();
  return partnerStatusText(partner) || fallback;
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
  const label = partnerStatusText(status);
  return [label, Number.isFinite(eta) ? getI18nInstance().t('shop.orders.etaMinutes', { minutes: eta }) : ''].filter(Boolean).join(' · ');
}
