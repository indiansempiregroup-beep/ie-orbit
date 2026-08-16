import { getApiBaseUrl } from '../config/apiBaseUrl';

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
  if (url.startsWith('http://') || url.startsWith('https://') || isLocalOrDataUri(url)) {
    return url;
  }
  const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
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
