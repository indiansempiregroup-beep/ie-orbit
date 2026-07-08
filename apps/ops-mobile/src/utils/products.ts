export type ProductDefinition = {
  id: string;
  name: string;
  description: string;
};

export type ProductSubscriptionLike = {
  product_code: string;
  status?: string | null;
};

export const PRODUCT_CATALOG: ProductDefinition[] = [
  { id: 'appointie', name: 'AppointIE', description: 'Booking and scheduling for service businesses.' },
  { id: 'invoiceie', name: 'InvoiceIE', description: 'Invoicing and payment workflows.' },
  { id: 'crmie', name: 'CRMIE', description: 'Customer relationship management.' },
];

const ACTIVE = new Set(['trialing', 'active']);

export function getProductName(productId?: string | null) {
  return PRODUCT_CATALOG.find((p) => p.id === productId)?.name ?? productId ?? 'AppointIE';
}

export function getSubscribedProducts(subscriptions?: ProductSubscriptionLike[] | null) {
  if (!subscriptions?.length) return [];
  return subscriptions
    .filter((s) => ACTIVE.has(s.status ?? 'trialing'))
    .map((s) => PRODUCT_CATALOG.find((p) => p.id === s.product_code))
    .filter((p): p is ProductDefinition => Boolean(p));
}

export function getAvailableProducts(subscriptions?: ProductSubscriptionLike[] | null) {
  const subscribed = new Set(getSubscribedProducts(subscriptions).map((p) => p.id));
  return PRODUCT_CATALOG.filter((p) => !subscribed.has(p.id));
}
