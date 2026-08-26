import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  BookOpenText,
  Building2,
  CalendarDays,
  ChartColumnBig,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  MapPinned,
  NotebookPen,
  Package,
  PawPrint,
  Receipt,
  RotateCcw,
  Settings,
  Scissors,
  ShieldCheck,
  ShoppingCart,
  TicketPercent,
  Truck,
  UserCog,
  Users,
  UsersRound,
  WalletCards,
  Warehouse,
} from 'lucide-react';
import { getSubscribedProductIds, hasPetsPack, type ProductSubscriptionLike } from './products';
import type { UserProfile } from '@ie-orbit/sdk';
import {
  canAccessReports,
  canManageBusinessSettings,
  hasAnyPermission,
  hasPermission,
} from '../utils/roles';

export type AppNavItem = {
  to: string;
  /** i18n key under the translation catalog (e.g. nav.dashboard). */
  labelKey: string;
  icon: LucideIcon;
  group?: 'operations' | 'settings' | 'account';
  /** When set, nav item is visible only for these product codes. Omit = platform core (always visible). */
  products?: string[];
  /** Require Orbit Mart Pets pack add-on. */
  requiresPetsPack?: boolean;
  /** Any one of these permissions allows the item. */
  anyPermissions?: string[];
  /** Custom visibility check (after product filter). */
  isVisible?: (user: UserProfile | null | undefined) => boolean;
};

/** Platform core surfaces — visible regardless of active product. */
export const navigationItems: AppNavItem[] = [
  {
    to: '/dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    group: 'operations',
    anyPermissions: ['business:read'],
  },
  {
    to: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    group: 'operations',
    products: ['appointie'],
    anyPermissions: ['booking:read'],
  },
  {
    to: '/bookings',
    labelKey: 'nav.bookings',
    icon: NotebookPen,
    group: 'operations',
    products: ['appointie'],
    anyPermissions: ['booking:read'],
  },
  {
    to: '/shop/pos',
    labelKey: 'nav.pos',
    icon: ShoppingCart,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write', 'booking:write'],
  },
  {
    to: '/shop/products',
    labelKey: 'nav.shopProducts',
    icon: Package,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'service:read'],
  },
  {
    to: '/shop/orders',
    labelKey: 'nav.shopOrders',
    icon: Receipt,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'booking:read'],
  },
  {
    to: '/shop/billing',
    labelKey: 'nav.shopBilling',
    icon: WalletCards,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write', 'booking:write'],
  },
  {
    to: '/shop/returns',
    labelKey: 'nav.shopReturns',
    icon: RotateCcw,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'booking:write'],
  },
  {
    to: '/shop/books',
    labelKey: 'nav.shopBooks',
    icon: BookOpenText,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/sale',
    labelKey: 'nav.shopSale',
    icon: ShoppingCart,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/purchase',
    labelKey: 'nav.shopPurchase',
    icon: Building2,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/expense',
    labelKey: 'nav.shopExpense',
    icon: FileSpreadsheet,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/cash',
    labelKey: 'nav.shopCashBank',
    icon: Landmark,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/parties',
    labelKey: 'nav.shopParties',
    icon: UsersRound,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/reports',
    labelKey: 'nav.shopBooksReports',
    icon: ChartColumnBig,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/delivery-challans',
    labelKey: 'nav.shopDeliveryChallans',
    icon: Truck,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/books/compliance',
    labelKey: 'nav.shopCompliance',
    icon: ShieldCheck,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/godowns',
    labelKey: 'nav.shopGodowns',
    icon: Warehouse,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/delivery-zones',
    labelKey: 'nav.shopDeliveryZones',
    icon: MapPinned,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/delivery-settings',
    labelKey: 'nav.shopInstantDelivery',
    icon: Settings,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/coupons',
    labelKey: 'nav.shopCoupons',
    icon: TicketPercent,
    group: 'operations',
    products: ['shopie'],
    anyPermissions: ['business:read', 'business:write'],
  },
  {
    to: '/shop/pets',
    labelKey: 'nav.shopPets',
    icon: PawPrint,
    group: 'operations',
    products: ['shopie'],
    requiresPetsPack: true,
    anyPermissions: ['customer:read', 'business:read'],
  },
  {
    to: '/customers',
    labelKey: 'nav.customers',
    icon: Users,
    group: 'operations',
    anyPermissions: ['customer:read'],
  },
  {
    to: '/services',
    labelKey: 'nav.services',
    icon: Scissors,
    group: 'operations',
    anyPermissions: ['service:read'],
  },
  {
    to: '/staff',
    labelKey: 'nav.staff',
    icon: UserCog,
    group: 'operations',
    anyPermissions: ['staff:read'],
  },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    icon: ChartColumnBig,
    group: 'operations',
    isVisible: canAccessReports,
  },
  {
    to: '/bi/overview',
    labelKey: 'nav.bi',
    icon: BarChart3,
    group: 'operations',
    isVisible: canAccessReports,
  },
  {
    to: '/notifications',
    labelKey: 'nav.notifications',
    icon: Bell,
    group: 'operations',
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    icon: Settings,
    group: 'settings',
    isVisible: canManageBusinessSettings,
  },
  {
    to: '/profile',
    labelKey: 'nav.profile',
    icon: BookOpenText,
    group: 'account',
  },
];

export const quickActionItems: AppNavItem[] = [
  {
    to: '/bookings',
    labelKey: 'nav.newBooking',
    icon: NotebookPen,
    group: 'operations',
    products: ['appointie'],
    anyPermissions: ['booking:write', 'booking:manage'],
  },
  {
    to: '/customers',
    labelKey: 'nav.addCustomer',
    icon: Users,
    group: 'operations',
    anyPermissions: ['customer:write', 'customer:manage'],
  },
  {
    to: '/services',
    labelKey: 'nav.addService',
    icon: Scissors,
    group: 'operations',
    anyPermissions: ['service:write', 'service:manage'],
  },
  {
    to: '/staff',
    labelKey: 'nav.addStaff',
    icon: UserCog,
    group: 'operations',
    anyPermissions: ['staff:write', 'staff:manage'],
  },
  {
    to: '/calendar',
    labelKey: 'nav.viewCalendar',
    icon: CalendarDays,
    group: 'operations',
    products: ['appointie'],
    anyPermissions: ['booking:read'],
  },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    icon: ChartColumnBig,
    group: 'operations',
    isVisible: canAccessReports,
  },
  {
    to: '/settings',
    labelKey: 'nav.businessProfile',
    icon: Settings,
    group: 'settings',
    isVisible: canManageBusinessSettings,
  },
];

/** True when item has no product gate, or any required product is in the subscription union. */
export function isProductAllowed(
  products: string[] | undefined,
  activeProduct: string | null | undefined,
  subscribedProductIds?: string[] | null,
): boolean {
  if (!products?.length) return true;
  const subscribed = subscribedProductIds?.length
    ? subscribedProductIds
    : activeProduct
      ? [activeProduct]
      : ['appointie'];
  return products.some((product) => subscribed.includes(product));
}

export function isNavItemVisibleForUser(
  item: AppNavItem,
  user: UserProfile | null | undefined,
): boolean {
  if (item.isVisible) return item.isVisible(user);
  if (item.anyPermissions?.length) return hasAnyPermission(user, item.anyPermissions);
  return true;
}

export function isNavItemVisible(
  item: AppNavItem,
  activeProduct: string | null | undefined,
  user?: UserProfile | null,
  subscribedProductIds?: string[] | null,
): boolean {
  if (!isProductAllowed(item.products, activeProduct, subscribedProductIds)) return false;
  return isNavItemVisibleForUser(item, user);
}

export function filterNavigationByProduct(
  items: AppNavItem[],
  activeProduct: string | null | undefined,
  user?: UserProfile | null,
  subscriptions?: ProductSubscriptionLike[] | null,
): AppNavItem[] {
  const subscribedIds = getSubscribedProductIds(subscriptions);
  const petsEnabled = hasPetsPack(subscriptions);
  return items.filter((item) => {
    if (!isNavItemVisible(item, activeProduct, user, subscribedIds)) return false;
    if (item.requiresPetsPack && !petsEnabled) return false;
    return true;
  });
}

/** @deprecated Prefer hasPermission from utils/roles */
export function checkPermission(user: UserProfile | null | undefined, code: string): boolean {
  return hasPermission(user, code);
}
