/** Build a UPI deep-link for QR / intent pay (mirrors backend apps.common.upi). */
export function buildUpiPayUrl(input: {
  vpa: string;
  payeeName?: string;
  amount: number | string;
  note?: string;
  currency?: string;
}): string {
  const pa = String(input.vpa || '').trim();
  if (!pa) return '';
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const am = (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
  const params = new URLSearchParams({
    pa,
    pn: String(input.payeeName || '').trim() || 'Merchant',
    am,
    cu: input.currency || 'INR',
  });
  const note = String(input.note || '').trim().slice(0, 80);
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}
