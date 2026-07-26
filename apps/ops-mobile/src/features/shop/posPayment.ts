import type { ShopOrder } from '@ie-platform/sdk';

export type PosMeta = {
  payment_method?: string;
  payment_status?: string;
  amount_due?: string | number;
  amount_paid?: string | number;
  bill_discount_type?: string;
  bill_discount_value?: string | number;
  bill_discount_amount?: string | number;
  line_discount_total?: string | number;
};

export function getShopOrderPosMeta(order: ShopOrder): PosMeta {
  const pos = order.metadata?.pos;
  if (!pos || typeof pos !== 'object') return {};
  return pos as PosMeta;
}

export function formatShopOrderPayment(order: ShopOrder): string {
  const pos = getShopOrderPosMeta(order);
  const method = String(pos.payment_method || '').toLowerCase();
  if (!method) return '';
  if (method === 'borrow') {
    const due = Number(pos.amount_due ?? order.total ?? 0);
    if (due > 0) return `Borrow · Due ${due.toFixed(2)}`;
    return 'Borrow · Settled';
  }
  return method.toUpperCase();
}

export function isShopOrderBorrowDue(order: ShopOrder): boolean {
  const pos = getShopOrderPosMeta(order);
  return (
    String(pos.payment_method || '').toLowerCase() === 'borrow' &&
    Number(pos.amount_due ?? order.total ?? 0) > 0
  );
}

export function formatMoney(value: string | number | undefined | null, fallback = '0.00'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(2);
}
