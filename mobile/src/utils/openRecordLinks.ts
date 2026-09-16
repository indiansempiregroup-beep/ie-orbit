import { mobileRuntime } from '../config/flavors';

const RECORD_KINDS = new Set(['booking', 'order', 'return', 'pet']);

export type OpenRecordData = Record<string, unknown>;

export function parseOpenRecordUrl(url: string): OpenRecordData | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    const fromPath = path.match(/^\/open\/([^/]+)\/([^/]+)$/);
    const kind = fromPath?.[1] || '';
    const id = fromPath?.[2] || '';
    const hostKind = `${parsed.host}${path}`.match(/^(?:open\/)?(booking|order|return|pet)\/([^/]+)$/);
    const resolvedKind = (RECORD_KINDS.has(kind) ? kind : hostKind?.[1]) || '';
    const resolvedId = id || hostKind?.[2] || '';
    if (!resolvedKind || !resolvedId || !RECORD_KINDS.has(resolvedKind)) return null;
    if (resolvedKind === 'booking') return { booking_id: resolvedId };
    if (resolvedKind === 'order') return { order_id: resolvedId };
    if (resolvedKind === 'return') {
      return { return_id: resolvedId, order_id: parsed.searchParams.get('order') || '' };
    }
    return { pet_id: resolvedId };
  } catch {
    return null;
  }
}

export function customerAppOpenUrl(kind: string, id: string): string {
  const slug = mobileRuntime.appSlug || 'ie-orbit-mobile';
  return `${slug}://open/${kind}/${id}`;
}
