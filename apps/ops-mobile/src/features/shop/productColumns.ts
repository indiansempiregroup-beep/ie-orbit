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

export const PRODUCT_COLUMNS_STORAGE_KEY = 'shop.products.columns';

export type MissingFieldFilter = '' | 'barcode' | 'image' | 'hsn' | 'sku';

export function parseProductColumns(raw: string | null | undefined): ProductColumnId[] {
  if (!raw) return [...DEFAULT_PRODUCT_COLUMNS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_PRODUCT_COLUMNS];
    const allowed = new Set(PRODUCT_COLUMN_IDS);
    const cols = parsed.filter((item): item is ProductColumnId => allowed.has(item as ProductColumnId));
    return cols.length ? cols : [...DEFAULT_PRODUCT_COLUMNS];
  } catch {
    return [...DEFAULT_PRODUCT_COLUMNS];
  }
}

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

export const COLUMN_LABEL_KEY: Record<ProductColumnId, string> = {
  image: 'shop.products.colImage',
  status: 'shop.products.colStatus',
  category: 'shop.products.colCategory',
  brand: 'shop.products.colBrand',
  sku: 'shop.products.colSku',
  barcode: 'shop.products.colBarcode',
  hsn: 'shop.products.colHsn',
  gst: 'shop.products.colGst',
  pack_size: 'shop.products.colPackSize',
  stock: 'shop.products.colStock',
  price: 'shop.products.colPrice',
  margin: 'shop.products.colMargin',
  photos: 'shop.products.colPhotos',
  description: 'shop.products.colDescription',
};
