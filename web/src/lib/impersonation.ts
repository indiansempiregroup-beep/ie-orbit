import { getAdminAppOrigin } from './hosts';

export const IMPERSONATOR_ID_KEY = 'ie:auth:impersonator_id';
export const IMPERSONATION_TENANT_ID_KEY = 'ie:auth:impersonation_tenant_id';
export const ADMIN_TOKENS_BACKUP_KEY = 'ie_admin_tokens_backup';

const ACCESS_KEY = 'ie:auth:access';
const REFRESH_KEY = 'ie:auth:refresh';
/** Keep in sync with WorkspaceContext ACTIVE_TENANT_STORAGE_KEY / WORKSPACE_MODE_STORAGE_KEY. */
const ACTIVE_TENANT_STORAGE_KEY = 'ie:active-tenant-id';
const WORKSPACE_MODE_STORAGE_KEY = 'ie:workspace-mode';

export type AdminTokenBackup = {
  access: string | null;
  refresh: string | null;
};

export function isImpersonating(): boolean {
  try {
    return Boolean(localStorage.getItem(IMPERSONATOR_ID_KEY));
  } catch {
    return false;
  }
}

export function getImpersonationTenantId(): string | null {
  try {
    return localStorage.getItem(IMPERSONATION_TENANT_ID_KEY);
  } catch {
    return null;
  }
}

export function readAdminTokenBackup(): AdminTokenBackup | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_TOKENS_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminTokenBackup;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearImpersonationMarkers() {
  try {
    localStorage.removeItem(IMPERSONATOR_ID_KEY);
    localStorage.removeItem(IMPERSONATION_TENANT_ID_KEY);
    sessionStorage.removeItem(ADMIN_TOKENS_BACKUP_KEY);
  } catch {
    // ignore
  }
}

export function beginImpersonationSession(params: {
  access: string;
  refresh: string;
  impersonatorId: string;
  tenantId: string;
}) {
  try {
    sessionStorage.setItem(
      ADMIN_TOKENS_BACKUP_KEY,
      JSON.stringify({
        access: localStorage.getItem(ACCESS_KEY),
        refresh: localStorage.getItem(REFRESH_KEY),
      } satisfies AdminTokenBackup),
    );
    localStorage.setItem(ACCESS_KEY, params.access);
    localStorage.setItem(REFRESH_KEY, params.refresh);
    localStorage.setItem(IMPERSONATOR_ID_KEY, params.impersonatorId);
    localStorage.setItem(IMPERSONATION_TENANT_ID_KEY, params.tenantId);
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, params.tenantId);
    localStorage.removeItem(WORKSPACE_MODE_STORAGE_KEY);
  } catch {
    // ignore storage failures; tokens may still be partially written
  }
}

export function writeAuthTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function restoreAdminTokenBackup(): AdminTokenBackup | null {
  const backup = readAdminTokenBackup();
  if (!backup?.access) return null;
  try {
    localStorage.setItem(ACCESS_KEY, backup.access);
    if (backup.refresh) {
      localStorage.setItem(REFRESH_KEY, backup.refresh);
    }
  } catch {
    // ignore
  }
  return backup;
}

export function impersonationReturnPath(tenantId?: string | null): string {
  if (tenantId) return `/admin/tenants/${tenantId}`;
  return '/admin';
}

const OPS_MOBILE_WEB_PORT = '8082';

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getOpsMobileWebOrigin(): string {
  const configured = String(import.meta.env.VITE_OPS_MOBILE_WEB_URL ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window === 'undefined') return `http://localhost:${OPS_MOBILE_WEB_PORT}`;
  return `${window.location.protocol}//${window.location.hostname}:${OPS_MOBILE_WEB_PORT}`;
}

export function buildOpsMobileSessionUrl(params: {
  access: string;
  refresh: string;
  tenantId?: string | null;
}): string {
  const encoded = toBase64Url(
    JSON.stringify({
      access: params.access,
      refresh: params.refresh,
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    }),
  );
  return `${getOpsMobileWebOrigin()}/?ie-session=${encodeURIComponent(encoded)}`;
}

export function redirectToOpsMobileWeb(options?: {
  access?: string | null;
  refresh?: string | null;
  tenantId?: string | null;
}) {
  if (typeof window === 'undefined') return;
  let access = options?.access ?? undefined;
  let refresh = options?.refresh ?? undefined;
  try {
    access = access || localStorage.getItem(ACCESS_KEY) || undefined;
    refresh = refresh || localStorage.getItem(REFRESH_KEY) || undefined;
  } catch {
    // ignore storage failures
  }
  if (access && refresh) {
    window.location.assign(buildOpsMobileSessionUrl({ access, refresh, tenantId: options?.tenantId }));
    return;
  }
  window.location.assign(`${getOpsMobileWebOrigin()}/`);
}

export function buildOpsMobileImpersonationUrl(params: {
  access: string;
  refresh: string;
  tenantId: string;
  impersonatorId: string;
}): string {
  const returnTo = `${getAdminAppOrigin()}/admin/tenants/${params.tenantId}`;
  const encoded = toBase64Url(
    JSON.stringify({
      access: params.access,
      refresh: params.refresh,
      tenantId: params.tenantId,
      impersonatorId: params.impersonatorId,
      returnTo,
    }),
  );
  return `${getOpsMobileWebOrigin()}/?ie-impersonate=${encodeURIComponent(encoded)}`;
}
