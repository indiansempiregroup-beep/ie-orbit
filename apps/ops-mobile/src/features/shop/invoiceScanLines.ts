import { guessShopProductCategory, type ShopBarcodeEnrichment, type ShopInvoiceScanLine, type ShopProduct } from '@ie-orbit/sdk';

export function looksLikeBarcode(value: string) {
  return /^\d{8}$|^\d{12,14}$/.test(value.trim());
}

export function applyShopProductToScanLine(line: ShopInvoiceScanLine, product: ShopProduct, code = ''): ShopInvoiceScanLine {
  const image = String(product.image_url || '').trim();
  return {
    ...line,
    product_id: product.id,
    name: line.name || product.name,
    sku: line.sku || product.sku || '',
    barcode: code || line.barcode || '',
    brand: line.brand || product.brand || '',
    pack_size: line.pack_size || product.pack_size || '',
    status: line.status || product.status || 'active',
    category: line.category || product.category || '',
    currency: line.currency || product.currency || line.currency,
    tax_inclusive: line.tax_inclusive ?? Boolean(product.tax_inclusive),
    stock_on_hand: String(product.stock_on_hand ?? line.stock_on_hand ?? '0'),
    description: line.description || product.description || '',
    details_html: line.details_html || product.details_html || '',
    hsn_sac: line.hsn_sac || product.hsn_sac || '',
    gst_rate: line.gst_rate || String(product.gst_rate || ''),
    price: line.price || String(product.price || line.rate),
    image_url: line.image_url || image,
    image_source: line.image_url ? line.image_source : image ? 'product' : line.image_source,
    use_image: Boolean(line.image_url || image),
    match: 'barcode',
    create: false,
  };
}

export function applyEnrichmentToScanLine(line: ShopInvoiceScanLine, data: ShopBarcodeEnrichment): ShopInvoiceScanLine {
  const code = String(data.code || data.barcode_candidates?.[0] || '').trim();
  const image = String(data.front_image_url || data.local_image_url || data.image_url || '').trim();
  const mrp = String(data.mrp || '').replace(/[₹,]/g, '').trim();
  const mrpAmount = Number(mrp);
  return {
    ...line,
    barcode: line.barcode || code,
    sku: line.sku || data.sku || code || '',
    name: line.name || data.name || '',
    brand: line.brand || data.brand || '',
    pack_size: line.pack_size || data.pack_size || '',
    category: line.category || data.category || guessShopProductCategory(data.categories) || '',
    currency: line.currency,
    description: line.description || data.description || '',
    details_html: line.details_html || data.details_html || '',
    hsn_sac: line.hsn_sac || data.hsn_sac || '',
    gst_rate: line.gst_rate || data.gst_rate || '',
    price: line.price || (Number.isFinite(mrpAmount) && mrpAmount > 0 ? mrp : '') || line.price,
    image_url: line.image_url || image,
    image_source: line.image_url ? line.image_source : image ? data.source || 'catalog' : line.image_source,
    use_image: Boolean(line.image_url || image),
  };
}
