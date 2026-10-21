import {
  ALWAYS_ON_ROLE_MENUS,
  DEFAULT_HIDDEN_ROLE_MENUS,
  ROLE_MENU_KEYS,
  STAFF_DEFAULT_HIDDEN_ROLE_MENUS,
  type RoleMenuCatalogItem,
} from '@ie-orbit/sdk';

const ALWAYS_ON = new Set<string>(ALWAYS_ON_ROLE_MENUS);
const DEFAULT_HIDDEN = new Set<string>(DEFAULT_HIDDEN_ROLE_MENUS);
const STAFF_DEFAULT_HIDDEN = new Set<string>(STAFF_DEFAULT_HIDDEN_ROLE_MENUS);
const KNOWN = new Set<string>(ROLE_MENU_KEYS);

const PATH_MENU_KEYS: Record<string, string> = {
  '/dashboard': 'home',
  '/calendar': 'calendar',
  '/bookings': 'bookings',
  '/shop/pos': 'pos',
  '/shop/products': 'products',
  '/shop/loyalty': 'books',
  '/shop/master': 'masterFiles',
  '/shop/orders': 'orders',
  '/shop/billing': 'books',
  '/shop/returns': 'returns',
  '/shop/books': 'books',
  '/shop/godowns': 'books',
  '/shop/delivery-zones': 'zones',
  '/shop/delivery-settings': 'instantDelivery',
  '/shop/coupons': 'coupons',
  '/automations': 'automations',
  '/shop/pets': 'pets',
  '/customers': 'customers',
  '/services': 'services',
  '/staff': 'staff',
  '/reports': 'bi',
  '/bi/overview': 'bi',
  '/notifications': 'alerts',
  '/settings': 'settings',
  '/profile': 'profile',
};

const BOOKS_PATH_MENU: Array<[string, string]> = [
  ['/shop/books/purchase/scan', 'booksInvoiceScan'],
  ['/shop/books/sale-orders', 'booksSaleOrders'],
  ['/shop/books/purchase-orders', 'booksPurchaseOrders'],
  ['/shop/books/delivery-challans', 'booksChallans'],
  ['/shop/books/sale', 'booksSale'],
  ['/shop/books/purchase', 'booksPurchase'],
  ['/shop/books/expense', 'booksExpense'],
  ['/shop/books/cash', 'booksCash'],
  ['/shop/books/parties', 'booksParties'],
  ['/shop/books/reports', 'booksReports'],
  ['/shop/books/compliance', 'booksCompliance'],
  ['/shop/books/vouchers', 'books'],
];

export function menuKeyForPath(to: string): string | undefined {
  const path = to.split('?')[0] ?? to;
  for (const [prefix, key] of BOOKS_PATH_MENU) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  if (path === '/shop/books' || path.startsWith('/shop/books/')) return 'books';
  if (path === '/shop/billing' || path.startsWith('/shop/billing/')) return 'booksQuotations';
  if (path === '/shop/godowns' || path.startsWith('/shop/godowns/')) return 'booksGodowns';
  if (path === '/shop/loyalty' || path.startsWith('/shop/loyalty/')) return 'booksLoyalty';
  if (path.startsWith('/bi/')) return 'bi';
  if (path.startsWith('/shop/master')) return 'masterFiles';
  return PATH_MENU_KEYS[path];
}

type MenuToggleItem = Pick<RoleMenuCatalogItem, 'key' | 'parent'>;

/** Turning Books on grants every section. Turning the last section off turns Books off. */
export function applyRoleMenuToggle(
  selected: Iterable<string>,
  key: string,
  next: boolean,
  catalog: MenuToggleItem[],
): string[] {
  const current = new Set(selected);
  const childrenOf = (parent: string) => catalog.filter((item) => item.parent === parent).map((item) => item.key);
  const parent = catalog.find((item) => item.key === key)?.parent;
  const children = childrenOf(key);
  if (next) current.add(key);
  else current.delete(key);
  for (const child of children) {
    if (next) current.add(child);
    else current.delete(child);
  }
  if (next && parent) current.add(parent);
  if (!next && parent && !childrenOf(parent).some((child) => current.has(child))) {
    current.delete(parent);
  }
  return Array.from(current);
}

export function isMenuEnabled(
  enabledMenus: string[] | null | undefined,
  key: string | undefined,
  options?: { skip?: boolean; defaultOn?: boolean },
): boolean {
  if (options?.skip || options?.defaultOn) return true;
  if (!key) return true;
  if (ALWAYS_ON.has(key) || !KNOWN.has(key)) return true;
  if (!enabledMenus) return !DEFAULT_HIDDEN.has(key) && !STAFF_DEFAULT_HIDDEN.has(key);
  return enabledMenus.includes(key);
}
