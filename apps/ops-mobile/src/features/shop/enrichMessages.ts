/** Shop-owner-facing copy for barcode / Smart lookup results. Never show raw API source keys. */

type EnrichMessageInput = {
  message?: string;
  source?: string | null;
  found?: boolean;
  charged_paise?: number | null;
  existing_product_name?: string | null;
  name?: string | null;
  needs_pack_photo?: boolean;
};

const TECHNICAL_SOURCE_RE =
  /platform_gtin|gemini_text|gemini_vision|open_food|open_pet|open_product|open_beauty|openmrp|datakick|barcode_lookup|shop_catalog|image_hint|public_go_upc|commercial_|_barcode|_search/i;

function formatInrFromPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function billingNote(chargedPaise: number, options: { isSmart: boolean }): string {
  if (chargedPaise > 0) {
    return ` ${formatInrFromPaise(chargedPaise)} deducted from Smart Fill wallet.`;
  }
  if (options.isSmart) {
    return ' No wallet charge.';
  }
  return ' Free — no wallet charge.';
}

export function enrichSourceLabel(source?: string | null): string {
  const key = (source || '').trim();
  switch (key) {
    case 'platform_gtin':
      return 'our product catalog';
    case 'shop_catalog':
      return 'your catalog';
    case 'shop_shared':
      return 'shared shop catalog';
    case 'gemini_vision':
      return 'pack photo';
    case 'gemini_text':
      return 'Smart lookup';
    case 'openmrp':
      return 'India product registry';
    case 'barcode_lookup':
    case 'catalog_search':
    case 'image_hint':
      return 'lookup';
    default:
      if (key.startsWith('open_') || key.endsWith('_barcode') || key.endsWith('_search')) {
        return 'online product database';
      }
      if (key === 'public_go_upc' || key === 'datakick' || key.startsWith('commercial_')) {
        return 'online product database';
      }
      return 'lookup';
  }
}

export function enrichSuccessMessage(
  data: EnrichMessageInput,
  options?: { editing?: boolean; filledName?: string },
): string {
  const charged = Math.max(0, Number(data.charged_paise || 0) || 0);
  const sourceKey = (data.source || '').trim();
  const isSmart = sourceKey === 'gemini_text' || sourceKey === 'gemini_vision';
  const billing = billingNote(charged, { isSmart });
  const source = enrichSourceLabel(data.source);

  // Prefer API message when it already explains free vs wallet debit.
  const apiMessage = (data.message || '').trim();
  if (
    apiMessage &&
    !TECHNICAL_SOURCE_RE.test(apiMessage) &&
    (/free — no wallet charge|no wallet charge|deducted from smart fill wallet/i.test(apiMessage) ||
      sourceKey === 'shop_catalog' ||
      Boolean(data.existing_product_name))
  ) {
    return apiMessage;
  }

  if (options?.editing) {
    return `Barcode updated from ${source}.${billing} Catalog details replaced; price and stock kept.`;
  }
  if (sourceKey === 'shop_catalog' || data.existing_product_name) {
    return `Already in your catalog as ${data.existing_product_name || data.name || 'this product'}.`;
  }
  if (sourceKey === 'gemini_vision') {
    return `Filled from pack photo.${billing} Review carefully, then save.`;
  }
  if (sourceKey === 'gemini_text') {
    if (data.needs_pack_photo) {
      return `Possible match from Smart lookup (not verified).${billing} Review carefully, or capture a pack photo to confirm.`;
    }
    return `Filled by Smart lookup.${billing} Review carefully — a pack photo improves accuracy.`;
  }
  if (sourceKey === 'platform_gtin') {
    return `Filled from our product catalog.${billing} Review price and stock, then save.`;
  }
  const name = (options?.filledName || data.name || '').trim();
  if (name) {
    return `Filled “${name}” from ${source}.${billing} Review price and stock, then save.`;
  }
  return `Details filled from ${source}.${billing} Review price and stock, then save.`;
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
      if (key.startsWith('commercial_') || key === 'public_go_upc' || key === 'datakick' || key === 'openmrp') {
        return 'Barcode provider';
      }
      if (key.startsWith('open_') || key.endsWith('_barcode') || key.endsWith('_search')) {
        return 'Online database';
      }
      return 'Lookup';
  }
}
