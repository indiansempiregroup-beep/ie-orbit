export const PlanFeature = {
  appointieBookings: 'appointie_bookings',
  appointieCalendar: 'appointie_calendar',
  appointieCustomers: 'appointie_customers',
  appointieReviews: 'appointie_reviews',
  appointieServices: 'appointie_services',
  appointieStaff: 'appointie_staff',
  shopiePos: 'shopie_pos',
  shopieProducts: 'shopie_products',
  shopieOrders: 'shopie_orders',
  shopieReturns: 'shopie_returns',
  shopieDeliveryZones: 'shopie_delivery_zones',
  shopieCoupons: 'shopie_coupons',
  shopieLoyalty: 'shopie_loyalty',
  shopieBooksSale: 'shopie_books_sale',
  shopieBooksPurchase: 'shopie_books_purchase',
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
} as const;

export const SHOPIE_BOOKS_FEATURES = [
  PlanFeature.shopieBooksSale,
  PlanFeature.shopieBooksPurchase,
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
