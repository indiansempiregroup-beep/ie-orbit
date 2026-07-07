import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ChartColumnBig,
  LayoutDashboard,
  NotebookPen,
  Settings,
  Scissors,
  UserCog,
  Users,
} from 'lucide-react';

export type AppNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  group?: 'operations' | 'settings' | 'account';
  /** When set, nav item is visible only for these product codes. Omit = platform core (always visible). */
  products?: string[];
};

/** Platform core surfaces — visible regardless of active product. */
export const navigationItems: AppNavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'operations' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, group: 'operations', products: ['appointie'] },
  { to: '/bookings', label: 'Bookings', icon: NotebookPen, group: 'operations', products: ['appointie'] },
  { to: '/customers', label: 'Customers', icon: Users, group: 'operations' },
  { to: '/services', label: 'Services', icon: Scissors, group: 'operations' },
  { to: '/staff', label: 'Staff', icon: UserCog, group: 'operations' },
  { to: '/reports', label: 'Reports', icon: ChartColumnBig, group: 'operations' },
  { to: '/notifications', label: 'Notifications', icon: Bell, group: 'operations' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'settings' },
  { to: '/profile', label: 'Profile', icon: BookOpenText, group: 'account' },
];

export const quickActionItems: AppNavItem[] = [
  { to: '/bookings', label: 'New Booking', icon: NotebookPen, group: 'operations', products: ['appointie'] },
  { to: '/customers', label: 'Add Customer', icon: Users, group: 'operations' },
  { to: '/services', label: 'Add Service', icon: Scissors, group: 'operations' },
  { to: '/staff', label: 'Add Staff', icon: UserCog, group: 'operations' },
  { to: '/calendar', label: 'View Calendar', icon: CalendarDays, group: 'operations', products: ['appointie'] },
  { to: '/reports', label: 'Reports', icon: ChartColumnBig, group: 'operations' },
  { to: '/settings', label: 'Business Profile', icon: Settings, group: 'settings' },
];

export function isNavItemVisible(item: AppNavItem, activeProduct: string | null | undefined): boolean {
  return isProductAllowed(item.products, activeProduct);
}

export function isProductAllowed(
  products: string[] | undefined,
  activeProduct: string | null | undefined,
): boolean {
  if (!products?.length) return true;
  const product = activeProduct ?? 'appointie';
  return products.includes(product);
}

export function filterNavigationByProduct(
  items: AppNavItem[],
  activeProduct: string | null | undefined,
): AppNavItem[] {
  return items.filter((item) => isNavItemVisible(item, activeProduct));
}
