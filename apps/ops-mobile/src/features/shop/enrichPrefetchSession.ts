import type { ShopBarcodeEnrichment } from '@ie-orbit/sdk';

type EnrichPrefetch = {
  code: string;
  businessId: string;
  promise: Promise<ShopBarcodeEnrichment>;
};

let pending: EnrichPrefetch | null = null;

/** Start (or replace) an in-flight enrich for add-product scan → form handoff. */
export function startEnrichPrefetch(
  code: string,
  businessId: string,
  promise: Promise<ShopBarcodeEnrichment>,
) {
  const normalized = code.trim();
  if (!normalized || !businessId) return;
  pending = { code: normalized, businessId, promise };
}

/** Take a matching prefetch promise once; clears the session entry. */
export function takeEnrichPrefetch(
  code: string,
  businessId: string,
): Promise<ShopBarcodeEnrichment> | null {
  const normalized = code.trim();
  if (
    !pending ||
    pending.code !== normalized ||
    pending.businessId !== businessId
  ) {
    return null;
  }
  const promise = pending.promise;
  pending = null;
  return promise;
}

export function clearEnrichPrefetch() {
  pending = null;
}
