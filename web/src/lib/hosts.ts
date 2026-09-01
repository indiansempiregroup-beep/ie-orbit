function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function configuredOrigin(value: string | undefined): string {
  return trimOrigin(String(value ?? ''));
}

function windowOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function localPort(): string {
  if (typeof window === 'undefined') return '3000';
  return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
}

function localPublicOrigin(): string {
  const port = localPort();
  return port === '80' ? 'http://localhost' : `http://localhost:${port}`;
}

function localAdminOrigin(): string {
  const port = localPort();
  return port === '80' ? 'http://127.0.0.1' : `http://127.0.0.1:${port}`;
}

/** Marketing / register site. Local loopback maps to localhost (like ie-orbit.com). */
export function getPublicSiteOrigin(): string {
  const configured = configuredOrigin(import.meta.env.VITE_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (import.meta.env.DEV && typeof window !== 'undefined' && isLoopbackHost(window.location.hostname)) {
    return localPublicOrigin();
  }
  return windowOrigin();
}

/** Platform Admin SPA. Local loopback maps to 127.0.0.1 (like app.ie-orbit.com). */
export function getAdminAppOrigin(): string {
  const configured = configuredOrigin(import.meta.env.VITE_ADMIN_APP_URL);
  if (configured) return configured;
  if (import.meta.env.DEV && typeof window !== 'undefined' && isLoopbackHost(window.location.hostname)) {
    return localAdminOrigin();
  }
  return windowOrigin();
}

export function adminAppIsSeparateHost(): boolean {
  return getPublicSiteOrigin() !== getAdminAppOrigin();
}

export function isAdminAppHost(): boolean {
  const current = windowOrigin();
  return Boolean(current) && current === getAdminAppOrigin();
}

export function isPublicSiteHost(): boolean {
  const current = windowOrigin();
  return Boolean(current) && current === getPublicSiteOrigin();
}

const PUBLIC_SITE_PATHS = new Set([
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/faq',
  '/help',
]);

export function isPublicMarketingPath(pathname: string): boolean {
  if (PUBLIC_SITE_PATHS.has(pathname)) return true;
  return pathname.startsWith('/auth/register') || pathname.startsWith('/onboarding');
}
