import type { UserProfile } from '@ie-platform/sdk';

const OPS_ROLES = new Set(['business_owner', 'manager', 'staff', 'platform_admin', 'super_admin']);

export function hasOpsAccess(user: UserProfile | null | undefined): boolean {
  if (!user?.roles?.length) return false;
  return user.roles.some((role) => OPS_ROLES.has(role));
}

export function hasPermission(user: UserProfile | null | undefined, code: string): boolean {
  return Boolean(user?.permissions?.includes(code));
}

export function canManageTeam(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'iam:role:assign') ||
    Boolean(user?.roles?.some((role) => ['business_owner', 'manager', 'platform_admin', 'super_admin'].includes(role)))
  );
}

/** Settings / workspace config — managers and owners, not staff-only accounts. */
export function canAccessSettings(user: UserProfile | null | undefined): boolean {
  if (!user?.roles?.length) return false;
  if (user.roles.some((role) => ['business_owner', 'manager', 'platform_admin', 'super_admin'].includes(role))) {
    return true;
  }
  return hasPermission(user, 'business:write') || hasPermission(user, 'business:manage');
}

export function canWriteBookings(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'booking:write') ||
    hasPermission(user, 'booking:manage') ||
    Boolean(user?.roles?.some((r) => ['business_owner', 'manager', 'staff'].includes(r)))
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
  const priority = ['business_owner', 'manager', 'staff', 'platform_admin'];
  const match = priority.find((role) => codes.includes(role));
  const label = match ?? codes[0];
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
