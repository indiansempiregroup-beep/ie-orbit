import type { ShopBarcodeEnrichment } from '@ie-orbit/sdk';

export type BulkScanItem = {
  code: string;
  enrichment: ShopBarcodeEnrichment;
};

let items: BulkScanItem[] = [];

export function resetBulkScanSession() {
  items = [];
}

export function readBulkScanSession(): BulkScanItem[] {
  return items.slice();
}

export function hasBulkScanCode(code: string): boolean {
  const normalized = code.trim();
  return items.some((item) => item.code === normalized);
}

export function addBulkScanItem(item: BulkScanItem): { added: boolean; count: number } {
  const code = item.code.trim();
  if (!code || hasBulkScanCode(code)) {
    return { added: false, count: items.length };
  }
  items = [...items, { ...item, code }];
  return { added: true, count: items.length };
}

export function takeBulkScanSession(): BulkScanItem[] {
  const snapshot = items.slice();
  items = [];
  return snapshot;
}
