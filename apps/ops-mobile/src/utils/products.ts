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
    description: 'Booking, scheduling, and customer operations for service businesses.',
    highlights: ['Online bookings and calendar', 'Staff schedules and availability', 'Customers, reminders, and visits'],
  },
  {
    id: 'shopie',
    name: 'Orbit Mart',
    description: 'Catalog, POS, inventory, and billing for retail businesses.',
    highlights: ['POS, catalog, and inventory', 'GST books, e-invoice, and reports', 'WhatsApp, ads, and online orders'],
  },
];

export const PETS_PACK_PRICE_INR = 500;

const ACTIVE = new Set(['trialing', 'active', 'soft_locked']);

export function getProductName(productId?: string | null) {
  const known = PRODUCT_CATALOG.find((p) => p.id === productId);
  if (known) return known.name;
  if (productId === 'shopie') return 'Orbit Mart';
  if (!productId || productId === 'appointie') return 'Orbit Appoint';
  return productId.replace(/-/g, ' ');
}

export function stripPlanProductPrefix(name: string) {
  return name.replace(/^(Orbit Appoint|Orbit Mart|AppointIE|ShopIE)\s+/i, '') || name;
}

export function isRecommendedPlanCode(code?: string | null) {
  const value = (code ?? '').toLowerCase();
  return value.includes('pro') && !value.includes('starter');
}

export function getRecommendedPlanCode(plans: Array<{ code?: string; plan_code?: string }>) {
  const recommended = plans.find((plan) => isRecommendedPlanCode(plan.code ?? plan.plan_code));
  return recommended?.code ?? recommended?.plan_code ?? plans[0]?.code ?? plans[0]?.plan_code ?? '';
}

export function formatPlanDisplayName(name?: string | null, code?: string | null) {
  if (name) {
    const stripped = stripPlanProductPrefix(name);
    if (stripped && !/appointie|shopie/i.test(stripped)) return stripped;
  }
  const value = (code ?? '').toLowerCase();
  if (value.includes('pro')) return 'Pro';
  if (value.includes('starter')) return 'Starter';
  if (value === 'canceled') return 'Canceled';
  if (name) return stripPlanProductPrefix(name);
  return (code ?? '').replace(/^(appointie|shopie)[-_]/i, '') || 'Plan';
}

export function formatInrFromPaise(paise?: number | null) {
  if (paise == null) return null;
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
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
