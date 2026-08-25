import type { ShopProduct } from '@ie-orbit/sdk';

export const MAX_PRODUCT_IMAGES = 5;

export function emptyProductImageSlots(): string[] {
  return Array.from({ length: MAX_PRODUCT_IMAGES }, () => '');
}

export function ensureProductImageSlots(urls: Array<string | null | undefined>): string[] {
  const next = urls.map((url) => String(url || '').trim()).slice(0, MAX_PRODUCT_IMAGES);
  while (next.length < MAX_PRODUCT_IMAGES) next.push('');
  return next;
}

export function normalizeProductGallery(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_PRODUCT_IMAGES) break;
  }
  return out;
}

/** Prefer relative /media paths so images reload reliably across clients. */
export function toStoredProductImageUrl(url: string | null | undefined): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).pathname || trimmed;
    }
  } catch {
    // keep original
  }
  return trimmed;
}

export function galleryFromProduct(product: ShopProduct): string[] {
  const meta = (product.metadata ?? {}) as Record<string, unknown>;
  const images = (meta.images ?? {}) as Record<string, unknown>;
  const gallery = Array.isArray(images.gallery) ? images.gallery.map(String) : [];
  const fromGallery = normalizeProductGallery(gallery);
  // Gallery is the source of truth for edit/display — do not prepend a possibly truncated image_url.
  if (fromGallery.length) {
    return ensureProductImageSlots(fromGallery);
  }
  return ensureProductImageSlots(
    normalizeProductGallery([
      product.image_url,
      typeof images.front === 'string' ? images.front : '',
      typeof images.back === 'string' ? images.back : '',
    ]),
  );
}

/** First gallery photo — used as the product card thumbnail. */
export function primaryProductImageUrl(product: ShopProduct): string {
  const gallery = normalizeProductGallery(galleryFromProduct(product));
  return gallery[0] || String(product.image_url || '').trim();
}

export function buildProductImageMetadata(gallery: string[]) {
  const clean = normalizeProductGallery(gallery.map(toStoredProductImageUrl));
  return {
    gallery: clean,
    front: clean[0] || '',
    back: clean[1] || '',
  };
}

export function productImageSlotLabel(index: number): string {
  if (index === 0) return 'Primary image';
  if (index === 1) return 'Photo 2 (back)';
  return `Photo ${index + 1}`;
}
