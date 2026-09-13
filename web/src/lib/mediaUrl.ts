const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function rewriteLoopbackToPath(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      (parsed.pathname.startsWith('/api/') || parsed.pathname.startsWith('/media/'))
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return url;
  }
  return url;
}

export function resolveMediaAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return rewriteLoopbackToPath(trimmed);
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveBillingProofUrl(order?: {
  payment_proof_url?: string | null;
  payment_proof_media_id?: string | null;
} | null): string | null {
  const mediaId = String(order?.payment_proof_media_id || '').trim();
  if (mediaId) return resolveMediaAssetUrl(`/api/v1/media/${mediaId}/file`);
  return resolveMediaAssetUrl(order?.payment_proof_url);
}

export function toStoredMediaAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed;
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
