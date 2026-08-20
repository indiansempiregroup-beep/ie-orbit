import type { ShopOrder } from '@ie-platform/sdk';

type PosMeta = {
  payment_method?: string;
  payment_status?: string;
  amount_due?: string | number;
  amount_paid?: string | number;
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

