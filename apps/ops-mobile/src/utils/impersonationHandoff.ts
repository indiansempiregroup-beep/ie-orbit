import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { setPersistentItem } from './persistentStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolvePublicSiteOrigin } = require('./publicSiteOrigin.cjs') as typeof import('./publicSiteOrigin.cjs');

export const OPS_TENANT_KEY = 'ie.ops.active-tenant-id';
export const IMPERSONATOR_KEY = 'ie.ops.impersonator-id';
export const IMPERSONATION_RETURN_KEY = 'ie.ops.impersonation-return';

export type SessionHandoff = {
  access: string;
  refresh: string;
  tenantId?: string;
  impersonatorId?: string;
  returnTo?: string;
};

export type ImpersonationHandoff = SessionHandoff & {
  tenantId: string;
  impersonatorId: string;
};

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readHandoffPayload(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const sources = [hash, search];
  for (const source of sources) {
    const impersonate = source.match(/ie-impersonate=([^&]+)/);
    if (impersonate?.[1]) return decodeURIComponent(impersonate[1]);
    const session = source.match(/ie-session=([^&]+)/);
    if (session?.[1]) return decodeURIComponent(session[1]);
  }
  return null;
}

function clearHandoffFromUrl() {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  try {
    history.replaceState(null, '', window.location.pathname || '/');
  } catch {
    // ignore
  }
}

let capturedHandoff: SessionHandoff | null = null;
let handoffRead = false;

function parseHandoffFromUrl(): SessionHandoff | null {
  const encoded = readHandoffPayload();
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<SessionHandoff>;
    if (!parsed.access || !parsed.refresh) {
      return null;
    }
    return {
      access: parsed.access,
      refresh: parsed.refresh,
      tenantId: parsed.tenantId,
      impersonatorId: parsed.impersonatorId,
      returnTo: parsed.returnTo,
    };
  } catch {
    return null;
  }
}

/** Call as soon as the web bundle loads so Expo splash cannot drop the query string. */
export function captureImpersonationHandoff() {
  if (handoffRead) return;
  handoffRead = true;
  capturedHandoff = parseHandoffFromUrl();
  if (capturedHandoff) clearHandoffFromUrl();
}

export function consumeImpersonationHandoff(): SessionHandoff | null {
  captureImpersonationHandoff();
  const value = capturedHandoff;
  capturedHandoff = null;
  return value;
}

export async function persistImpersonationHandoff(handoff: ImpersonationHandoff): Promise<void> {
  await setPersistentItem(OPS_TENANT_KEY, handoff.tenantId);
  await setPersistentItem(IMPERSONATOR_KEY, handoff.impersonatorId);
  await setPersistentItem(IMPERSONATION_RETURN_KEY, handoff.returnTo ?? null);
}

export async function persistSessionHandoff(handoff: SessionHandoff): Promise<void> {
  if (handoff.tenantId) {
    await setPersistentItem(OPS_TENANT_KEY, handoff.tenantId);
  }
}

export async function clearImpersonationHandoff(): Promise<void> {
  await setPersistentItem(IMPERSONATOR_KEY, null);
  await setPersistentItem(IMPERSONATION_RETURN_KEY, null);
}

export function jwtIsImpersonation(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return false;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = globalThis.atob(padded);
    const data = JSON.parse(json) as { impersonation?: unknown };
    return data.impersonation === true;
  } catch {
    return false;
  }
}

export function defaultPublicSiteUrl(): string {
  const extra = (Constants.expoConfig?.extra as { publicSiteUrl?: string } | undefined)?.publicSiteUrl;
  const configured = (
    extra ||
    process.env.EXPO_PUBLIC_PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    ''
  ).trim();
  return resolvePublicSiteOrigin({
    configured,
    protocol: typeof window !== 'undefined' ? window.location.protocol : 'http:',
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  });
}

export function defaultAdminReturnUrl(tenantId?: string | null): string {
  const configured = (process.env.EXPO_PUBLIC_WEB_ADMIN_URL ?? '').trim().replace(/\/$/, '');
  const origin =
    configured ||
    (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000` : 'http://localhost:3000');
  if (tenantId) return `${origin}/admin/tenants/${tenantId}`;
  return `${origin}/admin`;
}

export function redirectToAdminWeb(url: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.location.assign(url);
}

/**
 * Expo web has no /admin routes. Send /admin* to the Vite Platform Admin app
 * (localhost:3000 locally, app.ie-orbit.com in production).
 */
export function redirectOpsWebAdminPathToVite(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname || '';
  if (!path.startsWith('/admin')) return false;

  let origin = 'http://localhost:3000';
  try {
    origin = new URL(defaultAdminReturnUrl()).origin;
  } catch {
    // keep default
  }
  if (origin === window.location.origin) return false;

  const target = new URL(`${path}${window.location.search}`, `${origin}/`);
  try {
    const access =
      capturedHandoff?.access ||
      window.localStorage.getItem('ie.ops.access') ||
      window.localStorage.getItem('ie:ops:access');
    const refresh =
      capturedHandoff?.refresh ||
      window.localStorage.getItem('ie.ops.refresh') ||
      window.localStorage.getItem('ie:ops:refresh');
    if (access && refresh) {
      target.searchParams.set(
        'ie-session',
        toBase64Url(JSON.stringify({ access, refresh })),
      );
    }
  } catch {
    // ignore storage / encoding failures
  }
  window.location.replace(target.toString());
  return true;
}

/** Clear leftover Vite tokens after ops-web logout so Sign in cannot restore the previous user. */
export function redirectToPublicSiteSignedOut() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const origin = defaultPublicSiteUrl();
  if (!origin || origin === window.location.origin) return;
  window.location.assign(`${origin}/auth?signed-out=1`);
}
