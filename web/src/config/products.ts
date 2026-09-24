export type ProductDefinition = {
  id: string;
  name: string;
  description: string;
  highlights?: string[];
};

export type ProductSubscriptionLike = {
  product_code: string;
  status?: string | null;
  pets_pack_enabled?: boolean | null;
};

export const PRODUCT_CATALOG: ProductDefinition[] = [
  {
    id: 'appointie',
    name: 'Orbit Appoint',
    description: 'White-label customer app plus booking, scheduling, and staff operations.',
    highlights: [
      'White-label customer app under your brand',
      'Online bookings and calendar',
      'Staff schedules and availability',
    ],
  },
  {
    id: 'shopie',
    name: 'Orbit Mart',
    description: 'White-label customer app plus POS, catalog, and GST books.',
    highlights: [
      'White-label customer app under your brand',
      'POS, catalog, online orders, and returns',
      'GST books, Instant Delivery with Porter/Shiprocket, and Grow on Pro',
    ],
  },
];

export const PETS_PACK_PRICE_INR = 500;
export function getProductById(productId: string | null | undefined): ProductDefinition | undefined {
  if (!productId) return undefined;
  return PRODUCT_CATALOG.find((product) => product.id === productId);
}

export function getProductName(productId: string | null | undefined): string {
  const known = getProductById(productId);
  if (known) return known.name;
  if (productId === 'shopie') return 'Orbit Mart';
  if (!productId || productId === 'appointie') return 'Orbit Appoint';
  return productId.replace(/-/g, ' ');
}

const PAYMENT_ACTION_LABELS: Record<string, string> = {
  assistant_wallet: 'Chat Assistant',
  assistant_top_up: 'Chat Assistant',
  smart_lookup_wallet: 'Smart Fill Wallet',
  smart_lookup_top_up: 'Smart Fill Wallet',
};

export function paymentActionLabel(payment: {
  plan_code?: string | null;
  claim_intent?: string | null;
}): string | null {
  const intent = String(payment.claim_intent || '')
    .trim()
    .toLowerCase();
  const plan = String(payment.plan_code || '')
    .trim()
    .toLowerCase();
  return PAYMENT_ACTION_LABELS[intent] || PAYMENT_ACTION_LABELS[plan] || null;
}

/** Product names for subscriptions; Chat Assistant / Smart Fill Wallet for prepaid top-ups. */
export function paymentOrderLabel(payment: {
  plan_code?: string | null;
  claim_intent?: string | null;
  product_code?: string | null;
  product_codes?: Array<string | null | undefined> | null;
  line_items?: Array<{ product_code?: string | null }> | null;
}): string {
  const action = paymentActionLabel(payment);
  if (action) return action;
  const codes = payment.product_codes?.length
    ? payment.product_codes
    : payment.line_items?.map((item) => item.product_code) ?? [payment.product_code];
  return (codes.filter(Boolean) as string[]).map((code) => getProductName(code)).join(' + ') || 'Payment';
}

/** Strip the product prefix from plan names. Legacy AppointIE/ShopIE prefixes remain for stored rows. */
export function stripPlanProductPrefix(name: string): string {
  return name.replace(/^(Orbit Appoint|Orbit Mart|AppointIE|ShopIE)\s+/i, '') || name;
}

export function isRecommendedPlanCode(code?: string | null): boolean {
  const value = (code ?? '').toLowerCase();
  return value.includes('pro') && !value.includes('starter');
}

export function getRecommendedPlanCode(plans: Array<{ code?: string; plan_code?: string }>): string {
  const recommended = plans.find((plan) => isRecommendedPlanCode(plan.code ?? plan.plan_code));
  return recommended?.code ?? recommended?.plan_code ?? plans[0]?.code ?? plans[0]?.plan_code ?? '';
}

export function formatPlanDisplayName(name?: string | null, code?: string | null): string {
  if (name) {
    const stripped = stripPlanProductPrefix(name);
    if (stripped && !/appointie|shopie/i.test(stripped)) return stripped;
  }
  const value = (code ?? '').toLowerCase();
  if (value === 'assistant_wallet' || value === 'assistant_top_up') return 'Chat Assistant';
  if (value === 'smart_lookup_wallet' || value === 'smart_lookup_top_up') return 'Smart Fill Wallet';
  if (value.includes('pro')) return 'Pro';
  if (value.includes('starter')) return 'Starter';
  if (value === 'canceled') return 'Canceled';
  return strippedOrCode(name, code);
}

function strippedOrCode(name?: string | null, code?: string | null): string {
  if (name) return stripPlanProductPrefix(name);
  return (code ?? '').replace(/^(appointie|shopie)[-_]/i, '') || 'Plan';
}

export function formatInrFromPaise(paise?: number | null): string | null {
  if (paise == null) return null;
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

/** Null cap means unlimited. Grandfather current extras above the published cap. */
export function allowedExtraCount(cap: number | null | undefined, current: number): number | null {
  if (cap == null) return null;
  return Math.max(cap, current);
}

export function starterAddonCapHint(
  maxExtraStaff: number | null | undefined,
  maxExtraOffices: number | null | undefined,
): string | null {
  if (maxExtraStaff == null && maxExtraOffices == null) return null;
  if (maxExtraOffices === 0 && maxExtraStaff === 1) {
    return 'Second office and 4+ staff are on Pro.';
  }
  if (maxExtraOffices === 0) return 'A second office is on Pro.';
  if (maxExtraStaff != null) return 'Upgrade to Pro for higher staff limits.';
  return 'Upgrade to Pro for higher office limits.';
}

export function planSeatLine(plan: {
  max_staff?: number;
  max_branches?: number;
  max_extra_offices?: number | null;
}): string {
  const staff = plan.max_staff ?? 1;
  const offices = plan.max_branches ?? 1;
  if (plan.max_extra_offices === 0) {
    return `${staff} staff · 1 location`;
  }
  return `${staff} staff · ${offices} office${offices === 1 ? '' : 's'}`;
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active', 'soft_locked']);

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
