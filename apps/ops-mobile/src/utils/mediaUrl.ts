import { getApiBaseUrl } from '../config/apiBaseUrl';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function isLocalOrDataUri(url: string): boolean {
  return (
    url.startsWith('file://') ||
    url.startsWith('content://') ||
    url.startsWith('ph://') ||
    url.startsWith('assets-library://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  );
}

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (isLocalOrDataUri(url)) return url;
  const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      if (LOOPBACK_HOSTS.has(parsed.hostname)) {
        const api = new URL(origin);
        parsed.protocol = api.protocol;
        parsed.hostname = api.hostname;
        parsed.port = api.port;
        return parsed.toString();
      }
      return url;
    }
  } catch {
    // fall through and treat as a relative path
  }
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export function resolveBillingProofUrl(order?: {
  payment_proof_url?: string | null;
  payment_proof_media_id?: string | null;
} | null): string {
  const mediaId = String(order?.payment_proof_media_id || '').trim();
  if (mediaId) return resolveMediaUrl(`/api/v1/media/${mediaId}/file`);
  return resolveMediaUrl(order?.payment_proof_url);
}

/** Persist relative /media paths. Drop one-shot picker URIs that die after reload. */
export function toStoredMediaUrl(url?: string | null): string {
  const trimmed = String(url || '').trim();
  if (!trimmed || isLocalOrDataUri(trimmed)) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).pathname || trimmed;
    }
  } catch {
    // keep original
  }
  return trimmed;
}
