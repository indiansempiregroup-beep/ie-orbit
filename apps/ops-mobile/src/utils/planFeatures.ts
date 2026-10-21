export const PlanFeature = {
  appointieBookings: 'appointie_bookings',
  appointieCalendar: 'appointie_calendar',
  appointieCustomers: 'appointie_customers',
  appointieReviews: 'appointie_reviews',
  appointieServices: 'appointie_services',
  appointieStaff: 'appointie_staff',
  appointieAiAssistant: 'appointie_ai_assistant',
  appointieServiceBgRemove: 'appointie_service_bg_remove',
  shopiePos: 'shopie_pos',
  shopieProducts: 'shopie_products',
  shopieOrders: 'shopie_orders',
  shopieReturns: 'shopie_returns',
  shopieDeliveryZones: 'shopie_delivery_zones',
  shopieInstantDelivery: 'shopie_instant_delivery',
  shopieCoupons: 'shopie_coupons',
  shopieLoyalty: 'shopie_loyalty',
  shopieSmartLookup: 'shopie_smart_lookup',
  shopieProductBgRemove: 'shopie_product_bg_remove',
  shopieAiAssistant: 'shopie_ai_assistant',
  shopieBooksSale: 'shopie_books_sale',
  shopieBooksPurchase: 'shopie_books_purchase',
  shopieInvoiceScan: 'shopie_invoice_scan',
  shopieBooksCash: 'shopie_books_cash',
  shopieBooksExpense: 'shopie_books_expense',
  shopieBooksQuotations: 'shopie_books_quotations',
  shopieBooksNotes: 'shopie_books_notes',
  shopieBooksStock: 'shopie_books_stock',
  shopieBooksParties: 'shopie_books_parties',
  shopieBooksSaleOrder: 'shopie_books_sale_order',
  shopieBooksPurchaseOrder: 'shopie_books_purchase_order',
  shopieBooksChallan: 'shopie_books_challan',
  shopieBooksGodowns: 'shopie_books_godowns',
  shopieBooksCheques: 'shopie_books_cheques',
  shopieBooksLoans: 'shopie_books_loans',
  shopieBooksJobWork: 'shopie_books_job_work',
  shopieGstReports: 'shopie_gst_reports',
  shopieEinvoice: 'shopie_einvoice',
  shopieEway: 'shopie_eway',
  shopieGrowWhatsapp: 'shopie_grow_whatsapp',
  shopieGrowGoogle: 'shopie_grow_google',
  shopieGrowSync: 'shopie_grow_sync',
  shopieGrowUtilities: 'shopie_grow_utilities',
  shopieGrowAds: 'shopie_grow_ads',
  shopieCustomerReferral: 'shopie_customer_referral',
  rewardPoints: 'reward_points',
  adFree: 'ad_free',
  razorpayPayments: 'razorpay_payments',
  cashfreePayments: 'cashfree_payments',
  notificationsWhatsapp: 'notifications_whatsapp',
  automations: 'automations',
} as const;

export const SHOPIE_BOOKS_FEATURES = [
  PlanFeature.shopieBooksSale,
  PlanFeature.shopieBooksPurchase,
  PlanFeature.shopieInvoiceScan,
  PlanFeature.shopieBooksCash,
  PlanFeature.shopieBooksExpense,
  PlanFeature.shopieBooksQuotations,
  PlanFeature.shopieBooksNotes,
  PlanFeature.shopieBooksStock,
  PlanFeature.shopieBooksParties,
  PlanFeature.shopieBooksSaleOrder,
  PlanFeature.shopieBooksPurchaseOrder,
  PlanFeature.shopieBooksChallan,
  PlanFeature.shopieBooksGodowns,
  PlanFeature.shopieBooksCheques,
  PlanFeature.shopieBooksLoans,
  PlanFeature.shopieGstReports,
  PlanFeature.shopieEinvoice,
  PlanFeature.shopieEway,
  PlanFeature.shopieLoyalty,
];

export function entitledFeatureList(billing?: {
  entitled_features?: string[] | null;
  features?: string[] | null;
} | null): string[] | null {
  if (!billing) return null;
  if (billing.entitled_features?.length) return billing.entitled_features;
  if (billing.features) return billing.features;
  return [];
}

export function hasPlanFeature(features: string[] | null | undefined, feature: string): boolean {
  if (features == null) return true;
  return features.includes(feature);
}

export function hasAnyPlanFeature(features: string[] | null | undefined, keys: string[]): boolean {
  if (features == null) return true;
  return keys.some((key) => features.includes(key));
}

export type BiBillingSnapshot = {
  entitled_bi_features?: string[] | null;
  bi_features?: string[] | null;
  bi_features_by_product?: Record<string, string[]> | null;
  product_code?: string | null;
};

const BI_FEATURE_DATA_PRODUCTS: Record<string, string[]> = {
  overview: ['appointie', 'shopie'],
  profit: ['appointie', 'shopie'],
  growth: ['appointie', 'shopie'],
  revenue: ['appointie', 'shopie'],
  forecast: ['appointie', 'shopie'],
  reports: ['appointie', 'shopie'],
};

export function entitledBiFeatures(billing?: BiBillingSnapshot | null): string[] {
  if (!billing) return [];
  if (billing.entitled_bi_features != null) return billing.entitled_bi_features;
  return billing.bi_features ?? [];
}

export function biFeaturesByProduct(billing?: BiBillingSnapshot | null): Record<string, string[]> {
  if (!billing) return {};
  if (billing.bi_features_by_product && Object.keys(billing.bi_features_by_product).length) {
    return billing.bi_features_by_product;
  }
  const features = entitledBiFeatures(billing);
  const product = billing.product_code || 'appointie';
  return features.length ? { [product]: features } : {};
}

export function productsWithBiFeature(
  billing: BiBillingSnapshot | null | undefined,
  feature: string,
  subscribedIds?: string[],
): string[] {
  const byProduct = biFeaturesByProduct(billing);
  const dataProducts = BI_FEATURE_DATA_PRODUCTS[feature] ?? ['appointie', 'shopie'];
  const subscribed = new Set(subscribedIds?.length ? subscribedIds : Object.keys(byProduct));
  return dataProducts.filter(
    (product) => subscribed.has(product) && (byProduct[product] ?? []).includes(feature),
  );
}

export function hasBiFeature(
  billing: BiBillingSnapshot | null | undefined,
  feature: string,
  product?: string,
): boolean {
  if (product) return productsWithBiFeature(billing, feature).includes(product);
  return productsWithBiFeature(billing, feature).length > 0;
}
