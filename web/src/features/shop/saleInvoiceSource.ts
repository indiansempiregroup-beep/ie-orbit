import type { ShopBooksVoucher } from '@ie-orbit/sdk';

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Shelf amount for an invoice line (qty × rate).
 * Discounts / loyalty stay in the bill summary — stored `total` may already net them out.
 */
export function voucherLineGrossAmount(line: Record<string, unknown>): number {
  const gross = Number(line.gross);
  if (Number.isFinite(gross) && gross > 0) return money(gross);
  const qty = Number(line.qty ?? line.quantity ?? 0);
  const rate = Number(line.rate ?? line.unit_price ?? 0);
  const q = Number.isFinite(qty) ? qty : 0;
  const r = Number.isFinite(rate) ? rate : 0;
  return money(q * r);
}

/** Where this sale invoice came from — POS counter, online shop, or booking. */
export function saleInvoiceSourceLabel(
  voucher: ShopBooksVoucher,
  order?: { fulfillment_mode?: string | null } | null,
): string {
  const meta =
    voucher.metadata && typeof voucher.metadata === 'object'
      ? (voucher.metadata as Record<string, unknown>)
      : {};
  const source = String(meta.source || '').trim().toLowerCase();
  if (source === 'booking' || meta.source_booking_id) return 'Booking';

  const mode = String(order?.fulfillment_mode || meta.fulfillment_mode || meta.channel || '')
    .trim()
    .toLowerCase();
  if (mode === 'pos') return 'POS';
  if (mode === 'pickup' || mode === 'online_pickup') return 'Online order · Pickup';
  if (mode === 'delivery' || mode === 'online_delivery') return 'Online order · Delivery';
  if (voucher.linked_order && !order) return 'Shop sale';
  if (voucher.linked_order) return 'Online order';
  return 'Books sale';
}
