import type { UserProfile } from '@ie-orbit/sdk';
import { getAdminAppOrigin, isAdminAppHost, originsAreSameApp } from './hosts';
import { redirectToOpsMobileWeb } from './impersonation';
import { encodeSessionHandoff } from './sessionHandoff';
import {
  getPostLoginPath,
  hasTenantOpsRole,
  isPlatformAdmin,
  isPlatformAdminOnly,
  needsEmailVerification,
  VERIFY_EMAIL_PATH,
} from '../utils/roles';

const ACCESS_KEY = 'ie:auth:access';
const REFRESH_KEY = 'ie:auth:refresh';

export function safeNextPath(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (value.toLowerCase().startsWith('/auth')) return null;
  try {
    const parsed = new URL(value, 'https://ie-orbit.local');
    if (parsed.username || parsed.password) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function nextFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  return safeNextPath(new URLSearchParams(window.location.search).get('next'));
}

export function redirectToAdminApp(pathAndQuery = '/admin') {
  if (typeof window === 'undefined') return;
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  if (originsAreSameApp(window.location.origin, getAdminAppOrigin())) {
    const local = new URL(path, `${window.location.origin}/`);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === `${local.pathname}${local.search}${local.hash}`) {
      return;
    }
    window.location.assign(local.toString());
    return;
  }
  const origin = getAdminAppOrigin();
  const target = new URL(path, `${origin}/`);

  if (window.location.origin === origin) {
    window.location.assign(target.toString());
    return;
  }

  let access: string | undefined;
  let refresh: string | undefined;
  try {
    access = sessionStorage.getItem(ACCESS_KEY) || localStorage.getItem(ACCESS_KEY) || undefined;
    refresh = sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY) || undefined;
  } catch {
    // ignore
  }
  if (access && refresh) {
    target.searchParams.set('ie-session', encodeSessionHandoff({ access, refresh }));
  }
  window.location.assign(target.toString());
}

/** After login: Expo for tenant ops, app host for platform admin, else in-app path. */
export function continueAfterAuth(
  user: UserProfile | null | undefined,
  navigate: (path: string) => void,
) {
  if (typeof window === 'undefined') return;

  const next = nextFromWindow();

  if (needsEmailVerification(user)) {
    navigate(VERIFY_EMAIL_PATH);
    return;
  }

  if (
    isPlatformAdmin(user) &&
    (isAdminAppHost() || originsAreSameApp(window.location.origin, getAdminAppOrigin()))
  ) {
    navigate(next && next.startsWith('/admin') ? next : getPostLoginPath(user));
    return;
  }

  if (hasTenantOpsRole(user)) {
    redirectToOpsMobileWeb({ clearLocalSession: true });
    return;
  }

  if (isPlatformAdminOnly(user)) {
    redirectToAdminApp(next && next.startsWith('/admin') ? next : getPostLoginPath(user));
    return;
  }

  navigate(next || getPostLoginPath(user));
}
