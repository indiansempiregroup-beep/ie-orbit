import type { UserProfile } from '@ie-orbit/sdk';
import { getAdminAppOrigin, isAdminAppHost } from './hosts';
import { redirectToOpsMobileWeb } from './impersonation';
import { encodeSessionHandoff } from './sessionHandoff';
import { getPostLoginPath, hasTenantOpsRole, isPlatformAdmin, isPlatformAdminOnly } from '../utils/roles';

const ACCESS_KEY = 'ie:auth:access';
const REFRESH_KEY = 'ie:auth:refresh';

export function redirectToAdminApp(pathAndQuery = '/admin') {
  if (typeof window === 'undefined') return;
  const origin = getAdminAppOrigin();
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const target = new URL(path, `${origin}/`);

  if (window.location.origin === origin) {
    window.location.assign(target.toString());
    return;
  }

  let access: string | undefined;
  let refresh: string | undefined;
  try {
    access = localStorage.getItem(ACCESS_KEY) || undefined;
    refresh = localStorage.getItem(REFRESH_KEY) || undefined;
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

  if (isAdminAppHost() && isPlatformAdmin(user)) {
    navigate(getPostLoginPath(user));
    return;
  }

  if (hasTenantOpsRole(user)) {
    redirectToOpsMobileWeb();
    return;
  }

  if (isPlatformAdminOnly(user) && window.location.origin !== getAdminAppOrigin()) {
    redirectToAdminApp(getPostLoginPath(user));
    return;
  }

  navigate(getPostLoginPath(user));
}
