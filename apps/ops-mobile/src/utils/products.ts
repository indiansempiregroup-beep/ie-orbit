export type ProductDefinition = {
  id: string;
  name: string;
  description: string;
};

export type ProductSubscriptionLike = {
  product_code: string;
  status?: string | null;
  pets_pack_enabled?: boolean | null;
};

export const PRODUCT_CATALOG: ProductDefinition[] = [
  { id: 'appointie', name: 'AppointIE', description: 'Booking and scheduling for service businesses.' },
  { id: 'shopie', name: 'ShopIE', description: 'Catalog, POS, inventory, and billing.' },
  { id: 'crmie', name: 'CRMIE', description: 'Customer relationship management.' },
];

export const PETS_PACK_PRICE_INR = 500;

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

export function getSubscribedProductIds(subscriptions?: ProductSubscriptionLike[] | null) {
  return getSubscribedProducts(subscriptions).map((p) => p.id);
}

export function hasShopie(subscriptions?: ProductSubscriptionLike[] | null) {
  return getSubscribedProductIds(subscriptions).includes('shopie');
}

export function hasPetsPack(subscriptions?: ProductSubscriptionLike[] | null) {
  if (!subscriptions?.length) return false;
  return subscriptions.some(
    (subscription) =>
      subscription.product_code === 'shopie' &&
      ACTIVE.has(subscription.status ?? '') &&
      Boolean(subscription.pets_pack_enabled),
  );
}
