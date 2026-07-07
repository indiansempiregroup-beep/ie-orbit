import { QueryClient } from '@tanstack/react-query';

export function invalidateWorkspaceData(queryClient: QueryClient) {
  const prefixes = [
    'workspace',
    'dashboard',
    'settings',
    'management',
    'bookings',
    'customers',
    'services',
    'staff',
    'notifications',
    'reports',
    'calendar',
  ];
  prefixes.forEach((prefix) => {
    queryClient.invalidateQueries({ queryKey: [prefix] });
  });
}

export function businessQueryParam(businessId?: string | null): Record<string, string> | undefined {
  if (!businessId) return undefined;
  return { business: businessId };
}

export function slugifyBusinessCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || 'business';
}
