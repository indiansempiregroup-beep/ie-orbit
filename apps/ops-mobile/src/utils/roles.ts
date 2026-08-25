import type { UserProfile } from '@ie-orbit/sdk';

const OPS_ROLES = new Set(['business_owner', 'manager', 'staff', 'platform_admin', 'super_admin']);
const MANAGER_OR_ABOVE = new Set(['business_owner', 'manager', 'platform_admin', 'super_admin']);
const PLATFORM_ROLES = new Set(['platform_admin', 'super_admin']);
const TENANT_OPS_ROLES = new Set(['business_owner', 'manager', 'staff']);

export function hasOpsAccess(user: UserProfile | null | undefined): boolean {
  if (!user?.roles?.length) return false;
  return user.roles.some((role) => OPS_ROLES.has(role));
}

export function isPlatformAdmin(user: UserProfile | null | undefined): boolean {
  return Boolean(user?.roles?.some((role) => PLATFORM_ROLES.has(role)));
}

/** Tenant business roles — not platform-only accounts. */
export function hasTenantOpsRole(user: UserProfile | null | undefined): boolean {
  return Boolean(user?.roles?.some((role) => TENANT_OPS_ROLES.has(role)));
}

/** Platform management only — no tenant business_owner/manager/staff role. */
export function isPlatformAdminOnly(user: UserProfile | null | undefined): boolean {
  return isPlatformAdmin(user) && !hasTenantOpsRole(user);
}

export function hasPermission(user: UserProfile | null | undefined, code: string): boolean {
  return Boolean(user?.permissions?.includes(code));
}

export function isManagerOrAbove(user: UserProfile | null | undefined): boolean {
  return Boolean(user?.roles?.some((role) => MANAGER_OR_ABOVE.has(role)));
}

/** Team invitations + IAM role changes — managers and owners. */
export function canManageTeam(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'iam:role:assign') ||
    hasPermission(user, 'staff:manage') ||
    isManagerOrAbove(user)
  );
}

/** Staff directory / schedules of teammates — not visible to staff-only accounts. */
export function canAccessStaffDirectory(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'staff:read') ||
    hasPermission(user, 'staff:write') ||
    hasPermission(user, 'staff:manage') ||
    isManagerOrAbove(user)
  );
}

/** Settings / workspace config — managers and owners, not staff-only accounts. */
export function canAccessSettings(user: UserProfile | null | undefined): boolean {
  if (isManagerOrAbove(user)) return true;
  return (
    hasPermission(user, 'business:update') ||
    hasPermission(user, 'business:write') ||
    hasPermission(user, 'business:manage')
  );
}

export function canAccessReports(user: UserProfile | null | undefined): boolean {
  return isManagerOrAbove(user) || hasPermission(user, 'booking:manage');
}

export function canWriteBookings(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'booking:write') ||
    hasPermission(user, 'booking:manage') ||
    Boolean(user?.roles?.some((r) => ['business_owner', 'manager', 'staff'].includes(r)))
  );
}

export function canWriteServices(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'service:write') ||
    hasPermission(user, 'service:manage') ||
    hasPermission(user, 'business:manage') ||
    isManagerOrAbove(user)
  );
}

function roleCode(role: unknown): string {
  if (typeof role === 'string') return role;
  if (role && typeof role === 'object' && 'code' in role) {
    const code = (role as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

export function formatUserRole(roles: Array<string | { code?: string }> | undefined): string {
  const codes = (roles ?? []).map(roleCode).filter(Boolean);
  if (!codes.length) return 'Member';
  const priority = ['super_admin', 'platform_admin', 'business_owner', 'manager', 'staff', 'customer'];
  const match = priority.find((role) => codes.includes(role));
  const label = match ?? codes[0];
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
