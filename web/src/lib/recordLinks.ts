const RECORD_KINDS = new Set(['booking', 'order', 'return', 'pet', 'ticket']);

export function staffRecordPath(
  kind: string,
  id: string,
  extra?: { orderId?: string },
): string {
  if (kind === 'booking') return `/bookings/${id}`;
  if (kind === 'order') return `/shop/orders/${id}`;
  if (kind === 'return') return `/shop/orders/${extra?.orderId || id}`;
  if (kind === 'pet') return `/shop/pets?petId=${encodeURIComponent(id)}`;
  if (kind === 'ticket') return `/settings/support?ticket=${encodeURIComponent(id)}`;
  return '';
}

export function isRecordKind(kind: string | undefined): boolean {
  return Boolean(kind && RECORD_KINDS.has(kind));
}
