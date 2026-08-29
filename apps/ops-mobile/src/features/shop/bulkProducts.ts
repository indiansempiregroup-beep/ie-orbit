import { Platform } from 'react-native';
import { SHOP_PRODUCT_CATEGORIES, guessShopProductCategory } from '@ie-orbit/sdk';
import type { ShopBarcodeEnrichment, ShopProductWriteInput } from '@ie-orbit/sdk';

export const BULK_SAVE_CHUNK = 200;

export const BULK_GRID_COLUMNS = [
  'name',
  'barcode',
  'sku',
  'brand',
  'pack_size',
  'category',
  'price',
  'gst_rate',
  'hsn_sac',
  'stock_on_hand',
  'status',
] as const;

export type BulkGridColumn = (typeof BULK_GRID_COLUMNS)[number];

export type BulkProductDefaults = {
  gst_rate: string;
  hsn_sac: string;
  category: string;
  currency: string;
  godown_id: string;
  status: string;
};

export type BulkProductRow = {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  brand: string;
  pack_size: string;
  category: string;
  price: string;
  gst_rate: string;
  hsn_sac: string;
  stock_on_hand: string;
  status: string;
  image_url: string;
  error: string;
  lookingUp: boolean;
};

const COLUMN_ALIASES: Record<string, BulkGridColumn> = {
  name: 'name',
  product: 'name',
  product_name: 'name',
  productname: 'name',
  barcode: 'barcode',
  ean: 'barcode',
  upc: 'barcode',
  code: 'barcode',
  sku: 'sku',
  brand: 'brand',
  pack_size: 'pack_size',
  pack: 'pack_size',
  size: 'pack_size',
  packsize: 'pack_size',
  category: 'category',
  price: 'price',
  mrp: 'price',
  selling_price: 'price',
  gst_rate: 'gst_rate',
  gst: 'gst_rate',
  tax: 'gst_rate',
  tax_rate: 'gst_rate',
  hsn_sac: 'hsn_sac',
  hsn: 'hsn_sac',
  sac: 'hsn_sac',
  stock_on_hand: 'stock_on_hand',
  stock: 'stock_on_hand',
  qty: 'stock_on_hand',
  quantity: 'stock_on_hand',
  status: 'status',
};

const STATUS_ALIASES: Record<string, string> = {
  active: 'active',
  draft: 'draft',
  inactive: 'inactive',
  archived: 'archived',
};

export function emptyBulkDefaults(): BulkProductDefaults {
  return {
    gst_rate: '0',
    hsn_sac: '',
    category: '',
    currency: 'INR',
    godown_id: '',
    status: 'active',
  };
}

export function emptyBulkRow(id: string, defaults: BulkProductDefaults): BulkProductRow {
  return {
    id,
    name: '',
    barcode: '',
    sku: '',
    brand: '',
    pack_size: '',
    category: defaults.category,
    price: '',
    gst_rate: defaults.gst_rate,
    hsn_sac: defaults.hsn_sac,
    stock_on_hand: '',
    status: defaults.status || 'active',
    image_url: '',
    error: '',
    lookingUp: false,
  };
}

export function rowHasContent(row: BulkProductRow): boolean {
  return Boolean(
    row.name.trim() ||
      row.barcode.trim() ||
      row.sku.trim() ||
      row.brand.trim() ||
      row.pack_size.trim() ||
      row.price.trim() ||
      row.stock_on_hand.trim() ||
      row.image_url.trim(),
  );
}

export function rowIsReady(row: BulkProductRow): boolean {
  return Boolean(row.name.trim());
}

export function isCatalogDuplicateError(error: string): boolean {
  return error.startsWith('Already in catalog');
}

export function isBlockingRowError(error: string): boolean {
  return Boolean(error.trim()) && error !== 'Name is required.';
}

export function copyRowWithoutBarcode(source: BulkProductRow, id: string): BulkProductRow {
  return {
    ...source,
    id,
    barcode: '',
    error: '',
    lookingUp: false,
  };
}

export function lastFilledRow(rows: BulkProductRow[]): BulkProductRow | undefined {
  return [...rows].reverse().find(rowHasContent);
}

export function markInGridDuplicateBarcodes(rows: BulkProductRow[]): BulkProductRow[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const code = row.barcode.trim();
    if (!code) return;
    counts.set(code, (counts.get(code) || 0) + 1);
  });
  return rows.map((row) => {
    const code = row.barcode.trim();
    if (code && (counts.get(code) || 0) > 1) {
      return { ...row, error: 'Duplicate in this list.' };
    }
    if (row.error === 'Duplicate in this list.') {
      return { ...row, error: '' };
    }
    return row;
  });
}

export function applyDefaultsToEmpty(row: BulkProductRow, defaults: BulkProductDefaults): BulkProductRow {
  return {
    ...row,
    category: row.category.trim() ? row.category : defaults.category,
    gst_rate: row.gst_rate.trim() ? row.gst_rate : defaults.gst_rate,
    hsn_sac: row.hsn_sac.trim() ? row.hsn_sac : defaults.hsn_sac,
    status: row.status.trim() ? row.status : defaults.status || 'active',
  };
}

export function normalizeBulkCategory(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const exact = SHOP_PRODUCT_CATEGORIES.find(
    (item) => item.value === raw || item.label.toLowerCase() === raw.toLowerCase(),
  );
  if (exact) return exact.value;
  return guessShopProductCategory(raw) || raw;
}

export function normalizeBulkStatus(value: string): string {
  const key = value.trim().toLowerCase();
  return STATUS_ALIASES[key] || key;
}

export function applyEnrichmentToRow(
  row: BulkProductRow,
  data: ShopBarcodeEnrichment,
  defaults: BulkProductDefaults,
): BulkProductRow {
  const next: BulkProductRow = {
    ...row,
    sku: data.sku || data.code || row.sku,
    name: data.name || row.name,
    brand: data.brand || row.brand,
    pack_size: data.pack_size || data.serving_size || row.pack_size,
    barcode: data.code || row.barcode,
    category: guessShopProductCategory(data.categories) || row.category,
    image_url: data.front_image_url || data.local_image_url || data.image_url || row.image_url,
    error: '',
    lookingUp: false,
  };
  return applyDefaultsToEmpty(next, defaults);
}

export function rowToWriteInput(
  row: BulkProductRow,
  defaults: BulkProductDefaults,
): Omit<ShopProductWriteInput, 'business_id'> {
  const category = normalizeBulkCategory(row.category);
  const gst = row.gst_rate.trim() || defaults.gst_rate || '0';
  return {
    name: row.name.trim(),
    sku: row.sku.trim(),
    brand: row.brand.trim(),
    pack_size: row.pack_size.trim(),
    category: category || undefined,
    price: row.price.trim() || '0',
    gst_rate: gst,
    tax_rate: gst,
    hsn_sac: row.hsn_sac.trim() || defaults.hsn_sac,
    currency: defaults.currency || 'INR',
    stock_on_hand: row.stock_on_hand.trim() || '0',
    godown_id: defaults.godown_id || null,
    status: normalizeBulkStatus(row.status || defaults.status || 'active'),
    ...(row.image_url.trim()
      ? { image_url: row.image_url.trim(), metadata: { images: { gallery: [row.image_url.trim()] } } }
      : {}),
    barcodes: row.barcode.trim()
      ? [{ code: row.barcode.trim(), barcode_type: 'manufacturer', is_primary: true }]
      : [],
  };
}

export function chunkRows<T>(items: T[], size = BULK_SAVE_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[%#]/g, '').replace(/[\s-/]+/g, '_');
}

export function parseDelimitedTable(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!source.trim()) return [];
  const delimiter = source.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (inQuotes && source[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if (char === '\n' && !inQuotes) {
      row.push(current);
      current = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    current += char;
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((cell) => COLUMN_ALIASES[normalizeHeader(cell)]);
}

export function tableToPartialRows(table: string[][]): Array<Partial<BulkProductRow>> {
  if (!table.length) return [];
  const header = table[0] ?? [];
  const useHeader = looksLikeHeader(header);
  const mapping = useHeader
    ? header.map((cell) => COLUMN_ALIASES[normalizeHeader(cell)])
    : BULK_GRID_COLUMNS.slice();
  const body = useHeader ? table.slice(1) : table;
  return body.map((cells) => {
    const partial: Partial<BulkProductRow> = {};
    cells.forEach((cell, index) => {
      const column = mapping[index];
      if (!column) return;
      const value = cell.trim();
      if (!value) return;
      if (column === 'category') partial.category = normalizeBulkCategory(value);
      else if (column === 'status') partial.status = normalizeBulkStatus(value);
      else partial[column] = value;
    });
    return partial;
  });
}

export function mergePartialRow(
  row: BulkProductRow,
  partial: Partial<BulkProductRow>,
  defaults: BulkProductDefaults,
): BulkProductRow {
  const { id: _id, lookingUp: _lookingUp, error: _error, ...fields } = partial;
  return applyDefaultsToEmpty(
    {
      ...row,
      ...fields,
      error: '',
      lookingUp: false,
    },
    defaults,
  );
}

export function csvTemplate(): string {
  return `${BULK_GRID_COLUMNS.join(',')}\nRice 5kg,8901234567890,RICE-5,India Gate,5kg,food_grocery,249,5,1006,20,active\n`;
}

export function downloadCsvTemplate() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Download the CSV template from the ops web app on a computer.');
  }
  const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'shopie-products-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function pickCsvFile(): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.reject(new Error('Import a CSV from the ops web app on a computer, or paste rows below.'));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }
      void file.text().then(resolve).catch(reject);
    };
    input.click();
  });
}
