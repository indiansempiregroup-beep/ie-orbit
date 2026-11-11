/** Structural product shape used by bulk enrich (compatible with ShopProduct). */
export type BulkEnrichProduct = {
  id: string;
  name: string;
  brand?: string;
  description?: string;
  details_html?: string;
  sku?: string;
  pack_size?: string;
  hsn_sac?: string;
  gst_rate?: string | number;
  tax_rate?: string | number;
  category?: string;
  image_url?: string;
  metadata?: Record<string, unknown>;
  barcodes?: Array<{ code: string; barcode_type?: string; is_primary?: boolean }>;
};

/** Structural enrichment shape (compatible with ShopBarcodeEnrichment). */
export type BulkEnrichmentData = {
  found: boolean;
  code: string;
  sku?: string;
  name?: string;
  brand?: string;
  pack_size?: string;
  serving_size?: string;
  image_url?: string;
  local_image_url?: string;
  front_image_url?: string;
  back_image_url?: string;
  images?: { front?: string; back?: string; gallery?: string[] };
  description?: string;
  details_html?: string;
  category?: string;
  hsn_sac?: string;
  gst_rate?: string;
  existing_product_id?: string;
  existing_product_name?: string;
  charged_paise?: number;
  message?: string;
};

export type BulkEnrichPatch = {
  business_id: string;
  brand?: string;
  pack_size?: string;
  hsn_sac?: string;
  sku?: string;
  description?: string;
  details_html?: string;
  category?: string;
  gst_rate?: string;
  tax_rate?: string;
  image_url?: string;
  metadata?: Record<string, unknown>;
  barcodes?: Array<{ code: string; barcode_type?: string; is_primary?: boolean }>;
};

export type BulkEnrichMode = 'barcode' | 'name';

export const BULK_ENRICH_LIMIT = 200;

export type BulkEnrichProgress = {
  done: number;
  total: number;
};

export type BulkEnrichResult = {
  updated: number;
  skipped: number;
  failed: number;
  chargedPaise: number;
  errors: Array<{ id: string; name: string; message: string }>;
};

function blank(value: unknown): boolean {
  return !String(value ?? '').trim();
}

function usableAmount(raw?: string | null): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const n = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  return text;
}

function galleryFromMetadata(product: BulkEnrichProduct): string[] {
  const meta = (product.metadata ?? {}) as Record<string, unknown>;
  const images = (meta.images ?? {}) as Record<string, unknown>;
  const gallery = Array.isArray(images.gallery) ? images.gallery.map(String) : [];
  return gallery.map((url) => url.trim()).filter(Boolean);
}

function productHasImage(product: BulkEnrichProduct): boolean {
  if (String(product.image_url || '').trim()) return true;
  return galleryFromMetadata(product).length > 0;
}

function enrichmentImageUrls(data: BulkEnrichmentData): string[] {
  const raw = [
    data.front_image_url,
    data.back_image_url,
    ...(data.images?.gallery ?? []),
    data.local_image_url,
    data.image_url,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const url = String(item || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 5) break;
  }
  return out;
}

export function primaryShopBarcode(product: BulkEnrichProduct): string {
  const primary = product.barcodes?.find((row) => row.is_primary) || product.barcodes?.[0];
  return String(primary?.code || '').trim();
}

export function enrichmentLookupForProduct(
  product: BulkEnrichProduct,
  mode: BulkEnrichMode,
): { code?: string; query?: string } | null {
  if (mode === 'barcode') {
    // Prefer barcode; fall back to SKU when barcode is missing (common after CSV import).
    const code = primaryShopBarcode(product) || String(product.sku || '').trim();
    return code ? { code } : null;
  }
  const query = String(product.name || '').trim();
  return query ? { query } : null;
}

export type BuildEnrichmentPatchOptions = {
  /**
   * When true (bulk default), write catalog images whenever enrichment returns any,
   * even if the product already has an image_url from Excel.
   */
  refreshImages?: boolean;
  /**
   * When true (bulk default), write HSN from enrichment when present and product HSN is blank.
   * (Always fill-empty for HSN; kept explicit for callers.)
   */
  fillHsn?: boolean;
};

/**
 * Build a PATCH from enrichment.
 * Text/brand/description stay fill-empty so Excel values are kept.
 * Catalog images can refresh; HSN/GST/pack fill only when blank.
 * Keeps price, stock, and status.
 * Returns null when there is nothing safe to write.
 */
export function buildEnrichmentPatch(
  product: BulkEnrichProduct,
  data: BulkEnrichmentData,
  businessId: string,
  options?: BuildEnrichmentPatchOptions,
): BulkEnrichPatch | null {
  if (!data.found) return null;
  if (data.existing_product_id && data.existing_product_id !== product.id) return null;

  const refreshImages = options?.refreshImages !== false;
  const fillHsn = options?.fillHsn !== false;

  const patch: BulkEnrichPatch = { business_id: businessId };
  let changed = false;

  const fillText = (key: keyof BulkEnrichPatch, next: string | undefined, current: unknown) => {
    const value = String(next || '').trim();
    if (!value || !blank(current)) return;
    (patch as Record<string, unknown>)[key] = value;
    changed = true;
  };

  fillText('brand', data.brand, product.brand);
  fillText('pack_size', data.pack_size || data.serving_size, product.pack_size);
  if (fillHsn) {
    fillText('hsn_sac', data.hsn_sac, product.hsn_sac);
  }
  fillText('sku', data.sku || data.code, product.sku);
  fillText('description', data.description, product.description);
  fillText('details_html', data.details_html, product.details_html);

  const category = String(data.category || '').trim();
  if (category && blank(product.category)) {
    patch.category = category;
    changed = true;
  }

  const gst = usableAmount(data.gst_rate);
  const currentGst = String(product.gst_rate ?? product.tax_rate ?? '').trim();
  if (gst && (!currentGst || Number(currentGst.replace(/,/g, '')) === 0)) {
    patch.gst_rate = gst;
    patch.tax_rate = gst;
    changed = true;
  }

  const images = enrichmentImageUrls(data);
  if (images.length && (refreshImages || !productHasImage(product))) {
    patch.image_url = images[0];
    patch.metadata = {
      ...(product.metadata || {}),
      images: {
        gallery: images,
        front: images[0] || '',
        back: images[1] || '',
      },
    };
    changed = true;
  }

  const enrichCode = String(data.code || '').trim();
  if (enrichCode && !(product.barcodes || []).some((row) => String(row.code || '').trim())) {
    patch.barcodes = [{ code: enrichCode, barcode_type: 'manufacturer', is_primary: true }];
    changed = true;
  }

  return changed ? patch : null;
}

export async function runBulkProductEnrich(options: {
  productsById: Map<string, BulkEnrichProduct>;
  ids: string[];
  mode: BulkEnrichMode;
  businessId: string;
  enrich: (payload: {
    product_id?: string;
    code?: string;
    query?: string;
    use_smart_lookup?: boolean;
  }) => Promise<BulkEnrichmentData>;
  patch: (productId: string, body: BulkEnrichPatch) => Promise<unknown>;
  onProgress?: (progress: BulkEnrichProgress) => void;
  limit?: number;
  /** Defaults: refresh catalog images + fill blank HSN. */
  patchOptions?: BuildEnrichmentPatchOptions;
}): Promise<BulkEnrichResult> {
  const limit = options.limit ?? BULK_ENRICH_LIMIT;
  const ids = options.ids.slice(0, limit);
  const patchOptions: BuildEnrichmentPatchOptions = {
    refreshImages: true,
    fillHsn: true,
    ...options.patchOptions,
  };
  const result: BulkEnrichResult = {
    updated: 0,
    skipped: 0,
    failed: 0,
    chargedPaise: 0,
    errors: [],
  };

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    options.onProgress?.({ done: index + 1, total: ids.length });
    const product = options.productsById.get(id);
    if (!product) {
      result.failed += 1;
      result.errors.push({ id, name: id, message: 'Product not found in the current list.' });
      continue;
    }

    const lookup = enrichmentLookupForProduct(product, options.mode);
    if (!lookup) {
      result.skipped += 1;
      continue;
    }

    try {
      const data = await options.enrich({
        ...lookup,
        product_id: product.id,
        use_smart_lookup: true,
      });
      result.chargedPaise += Number(data.charged_paise || 0);

      if (data.existing_product_id && data.existing_product_id !== product.id) {
        result.failed += 1;
        result.errors.push({
          id,
          name: product.name,
          message: data.existing_product_name
            ? `Already in catalog as ${data.existing_product_name}.`
            : 'Barcode already assigned to another product.',
        });
        continue;
      }

      if (!data.found) {
        result.skipped += 1;
        continue;
      }

      const body = buildEnrichmentPatch(product, data, options.businessId, patchOptions);
      if (!body) {
        result.skipped += 1;
        continue;
      }

      await options.patch(id, body);
      result.updated += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        id,
        name: product.name,
        message: error instanceof Error ? error.message : 'Lookup failed.',
      });
    }
  }

  options.onProgress?.({ done: ids.length, total: ids.length });
  return result;
}
