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

export function isMenuEnabled(
  enabledMenus: string[] | null | undefined,
  key: string | undefined,
  options?: { skip?: boolean; defaultOn?: boolean },
): boolean {
  if (options?.skip || options?.defaultOn) return true;
  if (!key) return true;
  if (ALWAYS_ON.has(key) || !KNOWN.has(key)) return true;
  if (!enabledMenus) {
    return !DEFAULT_HIDDEN.has(key) && !STAFF_DEFAULT_HIDDEN.has(key);
  }
  return enabledMenus.includes(key);
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

const BOOKS_ROUTE_MENU: Record<string, string> = {
  Books: 'books',
  ShopBooks: 'books',
  ShopBooksSale: 'booksSale',
  ShopBooksQuotations: 'booksQuotations',
  ShopBooksNotes: 'booksNotes',
  ShopBooksPurchase: 'booksPurchase',
  ShopInvoiceScan: 'booksInvoiceScan',
  ShopBooksExpense: 'booksExpense',
  ShopStockAdjust: 'booksStock',
  ShopBooksCash: 'booksCash',
  ShopBooksParties: 'booksParties',
  ShopBooksReports: 'booksReports',
  ShopBooksCompliance: 'booksCompliance',
  ShopGodowns: 'booksGodowns',
  ShopBooksCheques: 'booksCheques',
  ShopBooksLoans: 'booksLoans',
  ShopLoyalty: 'booksLoyalty',
};

export function booksMenuKeyForRoute(
  name: string | undefined,
  params?: { docType?: string } | null,
): string | undefined {
  if (!name) return undefined;
  if (name === 'ShopBooksDocuments') {
    if (params?.docType === 'purchase_order') return 'booksPurchaseOrders';
    if (params?.docType === 'delivery_challan') return 'booksChallans';
    return 'booksSaleOrders';
  }
  return BOOKS_ROUTE_MENU[name];
}
