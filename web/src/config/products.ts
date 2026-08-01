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
  {
    id: 'appointie',
    name: 'AppointIE',
    description: 'Booking, scheduling, and customer operations for service businesses.',
  },
  {
    id: 'shopie',
    name: 'ShopIE',
    description: 'Catalog, POS, inventory, and billing for retail businesses.',
  },
  {
    id: 'crmie',
    name: 'CRMIE',
    description: 'Customer relationship management for multi-location operations.',
  },
];

export const PETS_PACK_PRICE_INR = 500;
export function getProductById(productId: string | null | undefined): ProductDefinition | undefined {
  if (!productId) return undefined;
  return PRODUCT_CATALOG.find((product) => product.id === productId);
}

export function getProductName(productId: string | null | undefined): string {
  return getProductById(productId)?.name ?? productId?.replace(/-/g, ' ') ?? 'AppointIE';
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active']);

export function getSubscribedProducts(
  subscriptions?: ProductSubscriptionLike[] | null,
): ProductDefinition[] {
  if (!subscriptions?.length) return [];

  return subscriptions
    .filter((subscription) => ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status ?? 'trialing'))
    .map((subscription) => getProductById(subscription.product_code))
    .filter((product): product is ProductDefinition => Boolean(product));
}

export function getAvailableProducts(
  subscriptions?: ProductSubscriptionLike[] | null,
): ProductDefinition[] {
  const subscribedIds = new Set(
    getSubscribedProducts(subscriptions).map((product) => product.id),
  );
  return PRODUCT_CATALOG.filter((product) => !subscribedIds.has(product.id));
}

export function getSubscribedProductIds(
  subscriptions?: ProductSubscriptionLike[] | null,
): string[] {
  return getSubscribedProducts(subscriptions).map((product) => product.id);
}

export function hasSubscribedProduct(
  subscriptions: ProductSubscriptionLike[] | null | undefined,
  productId: string,
): boolean {
  return getSubscribedProductIds(subscriptions).includes(productId);
}

export function hasPetsPack(subscriptions?: ProductSubscriptionLike[] | null): boolean {
  if (!subscriptions?.length) return false;
  return subscriptions.some(
    (subscription) =>
      subscription.product_code === 'shopie' &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status ?? '') &&
      Boolean(subscription.pets_pack_enabled),
  );
}

export function resolveEnabledProducts(
  selectedProduct?: string | null,
  productCode?: string | null,
  featureFlags?: Record<string, unknown> | null,
  subscriptions?: ProductSubscriptionLike[] | null,
): ProductDefinition[] {
  const subscribedProducts = getSubscribedProducts(subscriptions);
  if (subscribedProducts.length > 0) {
    return subscribedProducts;
  }

  const enabledIds = featureFlags?.enabled_products;
  if (Array.isArray(enabledIds) && enabledIds.length > 0) {
    return enabledIds
      .map((id) => (typeof id === 'string' ? getProductById(id) : undefined))
      .filter((product): product is ProductDefinition => Boolean(product));
  }

  const activeId = selectedProduct ?? productCode ?? (typeof featureFlags?.selected_product === 'string' ? featureFlags.selected_product : null);
  const activeProduct = getProductById(activeId);
  return activeProduct ? [activeProduct] : [PRODUCT_CATALOG[0]];
}
