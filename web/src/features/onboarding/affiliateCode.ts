const STORAGE_KEY = 'ie:affiliate-code';
const QUERY_KEYS = ['ref', 'affiliate', 'affiliate_code'] as const;

export function normalizeAffiliateCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);
}

export function readAffiliateCodeFromSearch(search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of QUERY_KEYS) {
    const normalized = normalizeAffiliateCode(params.get(key));
    if (normalized) return normalized;
  }
  return '';
}

export function persistAffiliateCode(code: string): string {
  const normalized = normalizeAffiliateCode(code);
  try {
    if (normalized) sessionStorage.setItem(STORAGE_KEY, normalized);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
  return normalized;
}

export function loadStoredAffiliateCode(): string {
  try {
    return normalizeAffiliateCode(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return '';
  }
}

export function clearStoredAffiliateCode() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function captureAffiliateCodeFromLocation(search?: string): string {
  const fromUrl = readAffiliateCodeFromSearch(
    search ?? (typeof window === 'undefined' ? '' : window.location.search),
  );
  if (fromUrl) return persistAffiliateCode(fromUrl);
  return loadStoredAffiliateCode();
}

export function registerStartPath(search?: string): string {
  const fromUrl = readAffiliateCodeFromSearch(
    search ?? (typeof window === 'undefined' ? '' : window.location.search),
  );
  const code = fromUrl || loadStoredAffiliateCode();
  return code ? `/auth/register/start?ref=${encodeURIComponent(code)}` : '/auth/register/start';
}

export function affiliateSignupPath(code: string): string {
  const normalized = normalizeAffiliateCode(code);
  return normalized ? `/auth/register/start?ref=${encodeURIComponent(normalized)}` : '/auth/register/start';
}
