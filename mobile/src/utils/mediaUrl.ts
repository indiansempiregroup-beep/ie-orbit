import { getApiBaseUrl } from '../config/apiBaseUrl';

const LOCAL_URI_PREFIXES = [
  'file:',
  'content:',
  'ph:',
  'assets-library:',
  'data:',
  'blob:',
];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** True for device/local URIs that must not be prefixed with the API origin. */
export function isLocalMediaUri(url?: string | null): boolean {
  if (!url) return false;
  const value = url.trim().toLowerCase();
  return LOCAL_URI_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (isLocalMediaUri(trimmed)) return trimmed;

  const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      // Phones cannot reach the API via localhost — rewrite to the LAN API host.
      if (LOOPBACK_HOSTS.has(parsed.hostname)) {
        const api = new URL(origin);
        parsed.protocol = api.protocol;
        parsed.hostname = api.hostname;
        parsed.port = api.port;
        return parsed.toString();
      }
      return trimmed;
    }
  } catch {
    // fall through and treat as a relative path
  }
  return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function resolveShopPaymentProofUrl(order?: {
  payment_proof_url?: string | null;
  payment_proof_media_id?: string | null;
} | null): string {
  const mediaId = String(order?.payment_proof_media_id || '').trim();
  if (mediaId) return resolveMediaUrl(`/api/v1/media/${mediaId}/file`);
  return resolveMediaUrl(order?.payment_proof_url);
}
