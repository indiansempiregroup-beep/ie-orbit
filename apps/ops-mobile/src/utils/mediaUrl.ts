import { getApiBaseUrl } from '../config/apiBaseUrl';

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const origin = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}
