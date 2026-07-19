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
