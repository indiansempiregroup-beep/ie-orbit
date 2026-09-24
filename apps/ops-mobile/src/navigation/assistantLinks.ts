import type { AssistantEntityLink } from '@ie-orbit/sdk';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

export function messageEntityLinks(metadata?: { links?: AssistantEntityLink[] } | null): AssistantEntityLink[] {
  const raw = metadata?.links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (link): link is AssistantEntityLink =>
      Boolean(link && typeof link === 'object' && link.kind && link.id && link.label),
  );
}

/** Drop bullet lines when clickable record cards already show the same rows. */
export function assistantMessageBody(content: string, links: AssistantEntityLink[]): string {
  const text = String(content || '').trim();
  if (!text || links.length === 0) return text;
  const kept = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trim().startsWith('•'));
  const cleaned = kept.join('\n').trim();
  return cleaned || text.split('\n')[0]?.trim() || text;
}

export function previewQueryForLink(link: AssistantEntityLink): string {
  const action = String(link.action || 'preview').toLowerCase();
  if (action === 'select') {
    return String(link.select_text || link.label || '').trim();
  }
  const kind = String(link.kind || '').trim().toLowerCase();
  // Orders/bookings/returns use human-readable numbers as the label; keep UUID for navigation.
  const preferLabel = kind === 'order' || kind === 'booking' || kind === 'return';
  const raw = preferLabel ? String(link.label || link.id || '') : String(link.id || '');
  const id = raw.trim().replace(/^Open\s+/i, '');
  return `preview ${kind} ${id}`.trim();
}

export function openAssistantEntityLink(
  link: AssistantEntityLink,
  navigation: NativeStackNavigationProp<RootStackParamList>,
): boolean {
  const kind = String(link.kind || '').toLowerCase();
  const id = String(link.id || '').trim();
  if (!id) return false;

  if (kind === 'order') {
    navigation.navigate('ShopOrderDetail', { orderId: id });
    return true;
  }
  if (kind === 'return') {
    const orderId = String(link.order_id || id).trim();
    navigation.navigate('ShopOrderDetail', { orderId });
    return true;
  }
  if (kind === 'booking') {
    navigation.navigate('BookingDetail', { bookingId: id });
    return true;
  }
  if (kind === 'customer') {
    navigation.navigate('CustomerDetail', { customerId: id });
    return true;
  }
  if (kind === 'product') {
    navigation.navigate('ShopProductAdd', { productId: id });
    return true;
  }
  if (kind === 'service') {
    navigation.navigate('ServiceDetail', { serviceId: id });
    return true;
  }
  if (kind === 'staff') {
    navigation.navigate('StaffDetail', { staffId: id });
    return true;
  }
  return false;
}
