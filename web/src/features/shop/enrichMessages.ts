/** Shop-owner-facing copy for barcode / Smart lookup results. Never show raw API source keys. */

type EnrichMessageInput = {
  message?: string;
  source?: string | null;
  found?: boolean;
  charged_paise?: number | null;
  existing_product_name?: string | null;
  name?: string | null;
};

const TECHNICAL_SOURCE_RE =
  /platform_gtin|gemini_text|gemini_vision|open_food|open_pet|open_product|open_beauty|barcode_lookup|shop_catalog|image_hint|_barcode|_search/i;

export function enrichSourceLabel(source?: string | null): string {
  const key = (source || '').trim();
  switch (key) {
    case 'platform_gtin':
      return 'product catalog';
    case 'shop_catalog':
      return 'your catalog';
    case 'gemini_vision':
      return 'pack photo';
    case 'gemini_text':
      return 'Smart lookup';
    case 'barcode_lookup':
    case 'catalog_search':
    case 'image_hint':
      return 'lookup';
    default:
      if (key.startsWith('open_') || key.endsWith('_barcode') || key.endsWith('_search')) {
        return 'online product database';
      }
      return 'lookup';
  }
}

export function enrichSuccessMessage(
  data: EnrichMessageInput,
  options?: { editing?: boolean; filledName?: string },
): string {
  const apiMessage = (data.message || '').trim();
  if (apiMessage && !TECHNICAL_SOURCE_RE.test(apiMessage)) {
    return apiMessage;
  }

  const charged = Number(data.charged_paise || 0);
  const chargeNote = charged > 0 ? ` (₹${(charged / 100).toFixed(2)})` : '';
  const source = enrichSourceLabel(data.source);

  if (options?.editing) {
    return `Barcode updated from ${source}. Catalog details replaced; price and stock kept.`;
  }
  if (data.source === 'shop_catalog' || data.existing_product_name) {
    return `Already in your catalog as ${data.existing_product_name || data.name || 'this product'}.`;
  }
  if (data.source === 'gemini_vision') {
    return `Filled from pack photo${chargeNote}. Review carefully, then save.`;
  }
  if (data.source === 'gemini_text') {
    return `Filled by Smart lookup${chargeNote}. Review carefully — a pack photo improves accuracy.`;
  }
  if (data.source === 'platform_gtin') {
    return 'Filled from our product catalog. Review price and stock, then save.';
  }
  const name = (options?.filledName || data.name || '').trim();
  if (name) {
    return `Filled “${name}” from ${source}. Review price and stock, then save.`;
  }
  return `Details filled from ${source}. Review price and stock, then save.`;
}

export function enrichLedgerSourceLabel(source?: string | null): string {
  const key = (source || '').trim();
  switch (key) {
    case 'wallet_top_up':
      return 'Wallet top-up';
    case 'gemini_vision':
      return 'Pack photo fill';
    case 'gemini_text':
      return 'Smart fill';
    case 'gemini_text_error':
    case 'gemini_vision_error':
      return 'Smart fill (failed)';
    case 'platform_gtin':
      return 'Product catalog';
    case 'shop_shared':
      return 'Shared shop catalog';
    case 'barcode_lookup':
      return 'Barcode lookup';
    case 'catalog_search':
      return 'Name search';
    default:
      if (!key) return 'Lookup';
      if (key.startsWith('commercial_')) return 'Barcode provider';
      if (key.startsWith('open_') || key.endsWith('_barcode') || key.endsWith('_search')) {
        return 'Online database';
      }
      return 'Lookup';
  }
}
