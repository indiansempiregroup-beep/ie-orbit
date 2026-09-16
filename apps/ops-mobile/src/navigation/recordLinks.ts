import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { Platform } from 'react-native';
import { navigateRoot, rootNavigationRef } from './rootNavigationRef';
import type { RootStackParamList } from './types';

const RECORD_KINDS = new Set(['booking', 'order', 'return', 'pet', 'ticket']);

export type RecordOpenData = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

export function opsLinkPrefixes(): string[] {
  const prefixes = ['ieorbitops://'];
  const configured = String(
    process.env.EXPO_PUBLIC_OPS_WEB_URL || process.env.VITE_OPS_MOBILE_WEB_URL || '',
  )
    .trim()
    .replace(/\/$/, '');
  if (configured) prefixes.push(configured);
  if (typeof window !== 'undefined' && window.location?.origin) {
    prefixes.push(window.location.origin);
  }
  return prefixes;
}

export function parseRecordUrl(url: string): RecordOpenData | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    const ticket = parsed.searchParams.get('ticket') || '';
    const petId = parsed.searchParams.get('petId') || '';

    const booking = path.match(/^\/bookings\/([^/]+)$/);
    if (booking?.[1]) return { booking_id: booking[1] };

    const order = path.match(/^\/shop\/orders\/([^/]+)$/);
    if (order?.[1]) return { order_id: order[1] };

    if (path === '/shop/pets' && petId) return { pet_id: petId };
    const petPath = path.match(/^\/shop\/pets\/([^/]+)$/);
    if (petPath?.[1]) return { pet_id: petPath[1] };

    if ((path === '/settings/support' || path === '/admin/tickets') && ticket) {
      return { ticket_id: ticket };
    }
    const ticketPath = path.match(/^\/(?:settings\/support|admin\/tickets)\/([^/]+)$/);
    if (ticketPath?.[1]) return { ticket_id: ticketPath[1] };

    const open = path.match(/^\/open\/([^/]+)\/([^/]+)$/);
    if (open?.[1] && open[2] && RECORD_KINDS.has(open[1])) {
      const kind = open[1];
      const id = open[2];
      if (kind === 'booking') return { booking_id: id };
      if (kind === 'order') return { order_id: id };
      if (kind === 'return') return { return_id: id, order_id: parsed.searchParams.get('order') || '' };
      if (kind === 'pet') return { pet_id: id };
      if (kind === 'ticket') return { ticket_id: id };
    }

    const custom = `${parsed.host}${path}`.match(/^(?:open\/)?(booking|order|return|pet|ticket)\/([^/]+)$/);
    if (custom?.[1] && custom[2]) {
      const kind = custom[1];
      const id = custom[2];
      if (kind === 'booking') return { booking_id: id };
      if (kind === 'order') return { order_id: id };
      if (kind === 'return') return { return_id: id, order_id: parsed.searchParams.get('order') || '' };
      if (kind === 'pet') return { pet_id: id };
      return { ticket_id: id };
    }
  } catch {
    return null;
  }
  return null;
}

export function navigateFromNotificationData(
  data: RecordOpenData,
  options?: { platformAdminOnly?: boolean },
): boolean {
  if (!rootNavigationRef.isReady()) return false;
  const platformAdminOnly = Boolean(options?.platformAdminOnly);

  const orderId = firstString(data.order_id, data.orderId);
  const returnId = firstString(data.return_id, data.returnId);
  const bookingId = firstString(data.booking_id, data.bookingId);
  const petId = firstString(data.pet_id, data.petId);
  const ticketId = firstString(data.ticket_id, data.ticketId, data.ticket);
  const tenantId = firstString(data.tenant_id, data.tenantId);
  const screen = firstString(data.screen);
  const eventType = firstString(data.event_type);
  const billingEvent = eventType.startsWith('billing.');

  if (!platformAdminOnly) {
    if (orderId) {
      navigateRoot('ShopOrderDetail', { orderId });
      return true;
    }
    if (returnId) {
      navigateRoot('ShopOrderDetail', { orderId: returnId });
      return true;
    }
    if (bookingId) {
      navigateRoot('BookingDetail', { bookingId });
      return true;
    }
    if (petId) {
      navigateRoot('ShopPetDetail', { petId, openNotify: true });
      return true;
    }
    if (ticketId) {
      navigateRoot('SupportTicketDetail', { ticketId });
      return true;
    }
  } else if (ticketId) {
    navigateRoot('SupportTicketDetail', { ticketId, mode: 'platform' });
    return true;
  }

  if (billingEvent || screen === 'ProductSettings' || screen === 'PlatformAdminTenantDetail') {
    if (platformAdminOnly) {
      if (tenantId) {
        navigateRoot('PlatformAdminTenantDetail', { tenantId });
        return true;
      }
      navigateRoot('PlatformAdmin');
      return true;
    }
    navigateRoot('ProductSettings');
    return true;
  }

  return false;
}

export const opsRecordLinking = {
  prefixes: opsLinkPrefixes(),
  config: {
    screens: {
      BookingDetail: 'bookings/:bookingId',
      ShopOrderDetail: 'shop/orders/:orderId',
      ShopPetDetail: 'shop/pets/:petId',
      SupportTicketDetail: 'settings/support/:ticketId',
      ProductSettings: 'settings/products',
      PlatformAdminTenantDetail: 'admin/tenants/:tenantId',
    } satisfies Partial<Record<keyof RootStackParamList, string>>,
  },
  getStateFromPath(path: string, options?: Parameters<typeof defaultGetStateFromPath>[1]) {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://ops.ie-orbit.com';
    const parsed = parseRecordUrl(path.startsWith('http') ? path : `${origin}${path.startsWith('/') ? path : `/${path}`}`);
    if (parsed?.booking_id) {
      return { routes: [{ name: 'BookingDetail', params: { bookingId: String(parsed.booking_id) } }] };
    }
    if (parsed?.order_id) {
      return { routes: [{ name: 'ShopOrderDetail', params: { orderId: String(parsed.order_id) } }] };
    }
    if (parsed?.pet_id) {
      return { routes: [{ name: 'ShopPetDetail', params: { petId: String(parsed.pet_id), openNotify: true } }] };
    }
    if (parsed?.ticket_id) {
      return { routes: [{ name: 'SupportTicketDetail', params: { ticketId: String(parsed.ticket_id) } }] };
    }
    return defaultGetStateFromPath(path, options);
  },
};

let capturedInitialUrl = '';
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  capturedInitialUrl = `${window.location.pathname}${window.location.search}`;
}

export function capturedWebRecordUrl(): string {
  return capturedInitialUrl;
}
