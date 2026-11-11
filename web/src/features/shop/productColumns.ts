export type ProductColumnId =
  | 'image'
  | 'status'
  | 'category'
  | 'brand'
  | 'sku'
  | 'barcode'
  | 'hsn'
  | 'gst'
  | 'pack_size'
  | 'stock'
  | 'price'
  | 'margin'
  | 'photos'
  | 'description';

export const PRODUCT_COLUMN_IDS: ProductColumnId[] = [
  'image',
  'status',
  'category',
  'brand',
  'sku',
  'barcode',
  'hsn',
  'gst',
  'pack_size',
  'stock',
  'price',
  'margin',
  'photos',
  'description',
];

export const DEFAULT_PRODUCT_COLUMNS: ProductColumnId[] = [
  'image',
  'status',
  'category',
  'brand',
  'sku',
  'barcode',
  'stock',
  'price',
];

const STORAGE_PREFIX = 'shop.products.columns.';

export function loadProductColumns(businessId: string | null | undefined): ProductColumnId[] {
  if (!businessId || typeof window === 'undefined') return [...DEFAULT_PRODUCT_COLUMNS];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${businessId}`);
    if (!raw) return [...DEFAULT_PRODUCT_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCT_COLUMNS];
    const allowed = new Set(PRODUCT_COLUMN_IDS);
    const cols = parsed.filter((item): item is ProductColumnId => allowed.has(item as ProductColumnId));
    return cols.length ? cols : [...DEFAULT_PRODUCT_COLUMNS];
  } catch {
    return [...DEFAULT_PRODUCT_COLUMNS];
  }
}

export function saveProductColumns(businessId: string | null | undefined, columns: ProductColumnId[]) {
  if (!businessId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${businessId}`, JSON.stringify(columns));
  } catch {
    // ignore quota / private mode
  }
}

export type MissingFieldFilter = '' | 'barcode' | 'image' | 'hsn' | 'sku';

export function missingFieldQuery(missing: MissingFieldFilter): {
  missing_barcode?: boolean;
  missing_image?: boolean;
  missing_hsn?: boolean;
  missing_sku?: boolean;
} {
  if (missing === 'barcode') return { missing_barcode: true };
  if (missing === 'image') return { missing_image: true };
  if (missing === 'hsn') return { missing_hsn: true };
  if (missing === 'sku') return { missing_sku: true };
  return {};
}
