import type { TFunction } from 'i18next';

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
  /platform_gtin|gemini_text|gemini_vision|gemini_name_expand|open_food|open_pet|open_product|open_beauty|openmrp|datakick|barcode_lookup|shop_catalog|image_hint|public_go_upc|commercial_|_barcode|_search/i;

function formatInrFromPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function billingNote(chargedPaise: number, options: { isSmart: boolean }, t: TFunction): string {
  if (chargedPaise > 0) {
    return t('opsApp.shop.enrich.billDeducted', { amount: formatInrFromPaise(chargedPaise) });
  }
  if (options.isSmart) {
    return t('opsApp.shop.enrich.billNoCharge');
  }
  return t('opsApp.shop.enrich.billFree');
}

export function enrichSourceLabel(source: string | null | undefined, t: TFunction): string {
  const key = (source || '').trim();
  switch (key) {
    case 'platform_gtin':
      return t('opsApp.shop.enrich.src.platformGtin');
    case 'shop_catalog':
      return t('opsApp.shop.enrich.src.shopCatalog');
    case 'shop_shared':
      return t('opsApp.shop.enrich.src.shopShared');
    case 'gemini_vision':
      return t('opsApp.shop.enrich.src.geminiVision');
    case 'gemini_text':
      return t('opsApp.shop.enrich.src.geminiText');
    case 'gemini_name_expand':
      return t('opsApp.shop.enrich.src.geminiNameExpand');
    case 'openmrp':
      return t('opsApp.shop.enrich.src.openmrp');
    case 'barcode_lookup':
    case 'catalog_search':
    case 'image_hint':
      return t('opsApp.shop.enrich.src.lookup');
    default:
      if (key.startsWith('open_') || key.endsWith('_barcode') || key.endsWith('_search')) {
        return t('opsApp.shop.enrich.src.onlineDb');
      }
      if (key === 'public_go_upc' || key === 'datakick' || key.startsWith('commercial_')) {
        return t('opsApp.shop.enrich.src.onlineDb');
      }
      return t('opsApp.shop.enrich.src.lookup');
  }
}

export function enrichSuccessMessage(
  data: EnrichMessageInput,
  t: TFunction,
  options?: { editing?: boolean; filledName?: string },
): string {
  const charged = Math.max(0, Number(data.charged_paise || 0) || 0);
  const sourceKey = (data.source || '').trim();
  const isSmart =
    sourceKey === 'gemini_text' || sourceKey === 'gemini_vision' || sourceKey === 'gemini_name_expand';
  const billing = billingNote(charged, { isSmart }, t);
  const source = enrichSourceLabel(data.source, t);

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
    return t('opsApp.shop.enrich.msgEditing', { source, billing });
  }
  if (sourceKey === 'shop_catalog' || data.existing_product_name) {
    return t('opsApp.shop.enrich.msgInCatalog', {
      name: data.existing_product_name || data.name || t('opsApp.shop.enrich.thisProduct'),
    });
  }
  if (sourceKey === 'gemini_vision') {
    return t('opsApp.shop.enrich.msgVision', { billing });
  }
  if (sourceKey === 'gemini_text') {
    if (data.needs_pack_photo) {
      return t('opsApp.shop.enrich.msgTextUnverified', { billing });
    }
    return t('opsApp.shop.enrich.msgText', { billing });
  }
  if (sourceKey === 'platform_gtin') {
    return t('opsApp.shop.enrich.msgPlatform', { billing });
  }
  const name = (options?.filledName || data.name || '').trim();
  if (name) {
    return t('opsApp.shop.enrich.msgFilledName', { name, source, billing });
  }
  return t('opsApp.shop.enrich.msgFilledGeneric', { source, billing });
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
    case 'gemini_name_expand':
      return 'Name expand';
    case 'gemini_invoice':
      return 'Invoice scan';
    case 'gemini_invoice_error':
      return 'Invoice scan (failed)';
    case 'gemini_automation':
      return 'Automation draft';
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
