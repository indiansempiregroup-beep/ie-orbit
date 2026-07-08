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
  return hasPermission(user, 'iam:role:assign') || Boolean(user?.roles?.includes('business_owner'));
}

export function canWriteBookings(user: UserProfile | null | undefined): boolean {
  return (
    hasPermission(user, 'booking:write') ||
    hasPermission(user, 'booking:manage') ||
    Boolean(user?.roles?.some((r) => ['business_owner', 'manager', 'staff'].includes(r)))
  );
}

export function formatUserRole(roles: string[] | undefined): string {
  if (!roles?.length) return 'Member';
  const priority = ['business_owner', 'manager', 'staff', 'platform_admin'];
  const match = priority.find((role) => roles.includes(role));
  if (!match) return roles[0].replace(/_/g, ' ');
  return match.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
