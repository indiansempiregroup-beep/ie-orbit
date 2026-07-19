import type { UserProfile } from '@ie-platform/sdk';

const PLATFORM_ROLES = new Set(['platform_admin', 'super_admin']);
const OWNER_ROLES = new Set(['business_owner', ...PLATFORM_ROLES]);
const MANAGER_ROLES = new Set(['manager', ...OWNER_ROLES]);

export function hasPermission(user: UserProfile | null | undefined, code: string): boolean {
  return Boolean(user?.permissions?.includes(code));
}

export function hasAnyPermission(
  user: UserProfile | null | undefined,
  codes: string[],
): boolean {
  return codes.some((code) => hasPermission(user, code));
}

export function hasRole(user: UserProfile | null | undefined, role: string): boolean {
  return Boolean(user?.roles?.includes(role));
}

export function hasAnyRole(user: UserProfile | null | undefined, roles: string[]): boolean {
  return Boolean(user?.roles?.some((role) => roles.includes(role)));
}

export function isPlatformAdmin(user: UserProfile | null | undefined): boolean {
  return hasAnyRole(user, [...PLATFORM_ROLES]);
}

export function isOwner(user: UserProfile | null | undefined): boolean {
  return hasAnyRole(user, [...OWNER_ROLES]);
}

export function isManagerOrAbove(user: UserProfile | null | undefined): boolean {
  return hasAnyRole(user, [...MANAGER_ROLES]);
}

export function canManageBusinessSettings(user: UserProfile | null | undefined): boolean {
  return (
    isManagerOrAbove(user) ||
    hasAnyPermission(user, ['business:update', 'business:write', 'business:manage'])
  );
}

export function canAccessReports(user: UserProfile | null | undefined): boolean {
  return isManagerOrAbove(user) || hasPermission(user, 'booking:manage');
}

export function formatUserRole(roles: string[] | undefined): string {
  if (!roles?.length) return 'Member';
  const priority = ['super_admin', 'platform_admin', 'business_owner', 'manager', 'staff', 'customer'];
  const match = priority.find((role) => roles.includes(role));
  const code = match ?? roles[0];
  return code.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
