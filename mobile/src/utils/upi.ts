export function buildUpiPayUrl(args: {
  vpa: string;
  payeeName: string;
  amount: number | string;
  note?: string;
  currency?: string;
}): string {
  const pa = String(args.vpa || '').trim();
  if (!pa) return '';
  const amount = Number(args.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const params = new URLSearchParams({
    pa,
    pn: String(args.payeeName || 'Shop').trim() || 'Shop',
    am: amount.toFixed(2),
    cu: args.currency || 'INR',
  });
  if (args.note) params.set('tn', String(args.note).slice(0, 80));
  return `upi://pay?${params.toString()}`;
}
