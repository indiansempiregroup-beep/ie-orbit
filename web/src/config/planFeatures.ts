import type { BillingPlanCatalogItem } from '@ie-orbit/sdk';

export type PlanProductCode = 'appointie' | 'shopie';

export type PlanFeatureDef = {
  code: string;
  group: string;
  products: PlanProductCode[];
  label: string;
  detail: string;
  adminLabel?: string;
};

export type DisplayFeatureItem = {
  code: string;
  label: string;
  detail?: string;
};

export type DisplayFeatureGroup = {
  title: string;
  items: DisplayFeatureItem[];
};

export const PLAN_FEATURE_GROUP_ORDER = [
  'Orbit Appoint',
  'Commerce',
  'Books',
  'Grow',
  'Marketing',
  'Loyalty',
] as const;

const BOTH: PlanProductCode[] = ['appointie', 'shopie'];

export const PLAN_FEATURE_CATALOG: PlanFeatureDef[] = [
  {
    code: 'appointie_bookings',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Bookings',
    detail: 'Customers book a slot online instead of calling or messaging back and forth.',
  },
  {
    code: 'appointie_calendar',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Calendar',
    detail: 'See the day’s appointments in one calendar so staff know who is next.',
  },
  {
    code: 'appointie_customers',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Customers',
    detail: 'Keep a shared customer list with visit history in your workspace.',
  },
  {
    code: 'appointie_reviews',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Reviews',
    detail: 'Collect ratings after a visit so new customers can trust the booking.',
  },
  {
    code: 'appointie_services',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Services',
    detail: 'Publish what you offer, with duration and price, in the customer app.',
  },
  {
    code: 'appointie_staff',
    group: 'Orbit Appoint',
    products: ['appointie'],
    label: 'Staff',
    detail: 'Assign bookable people and their working hours to each service.',
  },
  {
    code: 'shopie_pos',
    group: 'Commerce',
    products: ['shopie'],
    label: 'POS / counter sale',
    detail: 'Ring up walk-in sales at the counter in the same workspace as online orders.',
  },
  {
    code: 'shopie_products',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Products / catalog',
    detail: 'Manage SKUs, prices, and photos that appear in your storefront.',
  },
  {
    code: 'shopie_orders',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Online orders',
    detail: 'Customers place orders in your branded app; you fulfil them from one queue.',
  },
  {
    code: 'shopie_returns',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Returns',
    detail: 'Accept and track product returns without a separate spreadsheet.',
  },
  {
    code: 'shopie_delivery_zones',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Delivery zones',
    detail: 'Set which areas you deliver to and what each zone costs.',
  },
  {
    code: 'shopie_instant_delivery',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Instant Delivery with Porter/Shiprocket',
    adminLabel: 'Instant delivery (Porter / Shiprocket)',
    detail: 'Hand off last-mile delivery to Porter or Shiprocket from the order.',
  },
  {
    code: 'shopie_coupons',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Online order coupons',
    detail: 'Create discount codes customers can apply at checkout.',
  },
  {
    code: 'shopie_loyalty',
    group: 'Commerce',
    products: ['shopie'],
    label: 'Shop loyalty rules',
    detail: 'Set how shoppers earn and redeem store loyalty on orders.',
  },
  {
    code: 'shopie_books_sale',
    group: 'Books',
    products: ['shopie'],
    label: 'Sales',
    detail: 'Record sales bills and keep a day-book of what went out.',
  },
  {
    code: 'shopie_books_purchase',
    group: 'Books',
    products: ['shopie'],
    label: 'Purchases',
    detail: 'Enter supplier bills so stock and payables stay in one place.',
  },
  {
    code: 'shopie_books_cash',
    group: 'Books',
    products: ['shopie'],
    label: 'Cash & bank',
    detail: 'Track cash, bank, and money in/out against the books.',
  },
  {
    code: 'shopie_books_expense',
    group: 'Books',
    products: ['shopie'],
    label: 'Expenses',
    detail: 'Log shop expenses without a separate accounts tool.',
  },
  {
    code: 'shopie_books_quotations',
    group: 'Books',
    products: ['shopie'],
    label: 'Quotations / estimates',
    detail: 'Send estimates that can convert into a sale later.',
  },
  {
    code: 'shopie_books_notes',
    group: 'Books',
    products: ['shopie'],
    label: 'Credit / debit notes',
    detail: 'Issue credit and debit notes when a bill needs a correction.',
  },
  {
    code: 'shopie_books_stock',
    group: 'Books',
    products: ['shopie'],
    label: 'Stock adjust',
    detail: 'Correct stock counts when items are damaged, lost, or found.',
  },
  {
    code: 'shopie_books_parties',
    group: 'Books',
    products: ['shopie'],
    label: 'Parties / suppliers',
    detail: 'Keep customer and supplier ledgers next to the catalog.',
  },
  {
    code: 'shopie_books_sale_order',
    group: 'Books',
    products: ['shopie'],
    label: 'Sale orders',
    detail: 'Take confirmed orders before you raise the tax invoice.',
  },
  {
    code: 'shopie_books_purchase_order',
    group: 'Books',
    products: ['shopie'],
    label: 'Purchase orders',
    detail: 'Raise POs to suppliers and match them when goods arrive.',
  },
  {
    code: 'shopie_books_challan',
    group: 'Books',
    products: ['shopie'],
    label: 'Delivery challan',
    detail: 'Move goods with a challan before or without a tax invoice.',
  },
  {
    code: 'shopie_books_godowns',
    group: 'Books',
    products: ['shopie'],
    label: 'Godowns / transfers',
    detail: 'Track stock across warehouses and transfer between them.',
  },
  {
    code: 'shopie_books_cheques',
    group: 'Books',
    products: ['shopie'],
    label: 'Cheques',
    detail: 'Record cheques issued and received against parties.',
  },
  {
    code: 'shopie_books_loans',
    group: 'Books',
    products: ['shopie'],
    label: 'Loans',
    detail: 'Keep loan accounts and repayments in the same books.',
  },
  {
    code: 'shopie_books_job_work',
    group: 'Books',
    products: ['shopie'],
    label: 'Job work',
    detail: 'Send items out for job work and track them until they return.',
  },
  {
    code: 'shopie_gst_reports',
    group: 'Books',
    products: ['shopie'],
    label: 'GST reports',
    detail: 'Pull GST summaries from the books instead of rebuilding them in Excel.',
  },
  {
    code: 'shopie_einvoice',
    group: 'Books',
    products: ['shopie'],
    label: 'GST e-invoice (IRN)',
    detail: 'Generate IRN e-invoices for B2B sales from the bill itself.',
  },
  {
    code: 'shopie_eway',
    group: 'Books',
    products: ['shopie'],
    label: 'GST e-way bill',
    detail: 'Create e-way bills when goods move above the GST threshold.',
  },
  {
    code: 'shopie_grow_whatsapp',
    group: 'Grow',
    products: ['shopie'],
    label: 'WhatsApp',
    adminLabel: 'WhatsApp',
    detail: 'Share catalogs, bills, and offers with customers on WhatsApp.',
  },
  {
    code: 'shopie_grow_google',
    group: 'Grow',
    products: ['shopie'],
    label: 'Google Profile',
    detail: 'Helpers for keeping your Google Business Profile listing fresh.',
  },
  {
    code: 'shopie_grow_sync',
    group: 'Grow',
    products: ['shopie'],
    label: 'Sync & share',
    detail: 'Push updates and share store content without leaving Orbit Mart.',
  },
  {
    code: 'shopie_grow_utilities',
    group: 'Grow',
    products: ['shopie'],
    label: 'Utilities',
    detail: 'GST, margin, discount, and EMI calculators for counter conversations.',
  },
  {
    code: 'shopie_grow_ads',
    group: 'Marketing',
    products: BOTH,
    label: 'Your ads in the customer app',
    adminLabel: 'Customer app ads (max 5)',
    detail: 'Show up to 5 of your own promotions in the customer app.',
  },
  {
    code: 'ad_free',
    group: 'Marketing',
    products: BOTH,
    label: 'Ad-free customer app',
    adminLabel: 'Ad-free apps (hide Google Ads)',
    detail: 'Hide Google Ads so the branded app only shows your business.',
  },
  {
    code: 'razorpay_payments',
    group: 'Marketing',
    products: BOTH,
    label: 'Razorpay customer payments',
    detail: 'Collect card, UPI, and net-banking payments on your Razorpay account.',
  },
  {
    code: 'cashfree_payments',
    group: 'Marketing',
    products: BOTH,
    label: 'Cashfree customer payments',
    detail: 'Collect customer payments on your Cashfree account at checkout.',
  },
  {
    code: 'notifications_whatsapp',
    group: 'Marketing',
    products: BOTH,
    label: 'WhatsApp customer notifications',
    detail: 'Send booking or order updates to customers on WhatsApp.',
  },
  {
    code: 'reward_points',
    group: 'Loyalty',
    products: BOTH,
    label: 'Reward points',
    detail: 'Let customers earn and redeem points so they come back.',
  },
  {
    code: 'shopie_customer_referral',
    group: 'Loyalty',
    products: BOTH,
    label: 'Customer referral points',
    detail: 'Reward customers who bring a friend to your store or bookings.',
  },
];

const FEATURE_BY_CODE = new Map(PLAN_FEATURE_CATALOG.map((item) => [item.code, item]));

export const BI_FEATURE_OPTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'growth', label: 'Growth' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'reports', label: 'Reports' },
];

export function adminFeatureGroups(): Array<{
  title: string;
  products: string[];
  options: Array<{ value: string; label: string }>;
}> {
  const grouped = new Map<
    string,
    { title: string; products: Set<string>; options: Array<{ value: string; label: string }> }
  >();

  for (const item of PLAN_FEATURE_CATALOG) {
    let group = grouped.get(item.group);
    if (!group) {
      group = { title: item.group, products: new Set(), options: [] };
      grouped.set(item.group, group);
    }
    item.products.forEach((product) => group.products.add(product));
    group.options.push({ value: item.code, label: item.adminLabel ?? item.label });
  }

  return PLAN_FEATURE_GROUP_ORDER.flatMap((title) => {
    const group = grouped.get(title);
    if (!group) return [];
    return [
      {
        title,
        products: Array.from(group.products),
        options: group.options,
      },
    ];
  });
}

function humanizeFeatureCode(code: string) {
  return code
    .replace(/^(shopie_|appointie_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function describePlanFeature(code: string): DisplayFeatureItem & { group: string } {
  const known = FEATURE_BY_CODE.get(code);
  if (known) {
    return { code, label: known.label, detail: known.detail, group: known.group };
  }
  return {
    code,
    label: humanizeFeatureCode(code),
    detail: 'Included in this plan.',
    group: 'More',
  };
}

export function groupPlanFeatures(codes: string[]): DisplayFeatureGroup[] {
  const grouped = new Map<string, DisplayFeatureItem[]>();
  for (const code of codes) {
    const item = describePlanFeature(code);
    const list = grouped.get(item.group) ?? [];
    list.push({ code: item.code, label: item.label, detail: item.detail });
    grouped.set(item.group, list);
  }

  const knownOrder = [...PLAN_FEATURE_GROUP_ORDER, 'More'];
  return knownOrder.flatMap((title) => {
    const items = grouped.get(title);
    return items?.length ? [{ title, items }] : [];
  });
}

function officeWord(count: number) {
  return count === 1 ? 'office' : 'offices';
}

function staffLine(plan: BillingPlanCatalogItem): DisplayFeatureItem {
  const staff = plan.max_staff ?? 1;
  const offices = plan.max_branches ?? 1;
  const isShopie = plan.product_code === 'shopie';
  return {
    code: 'included-seats',
    label: isShopie
      ? `${staff} staff and ${offices} ${officeWord(offices)} included`
      : `${staff} bookable staff and ${offices} ${officeWord(offices)} included`,
    detail: isShopie
      ? 'These seats come with the plan. Extra people and locations are add-ons where the plan allows it.'
      : 'These bookable people and locations come with the plan. Extra seats are add-ons where allowed.',
  };
}

function extraCapsLine(plan: BillingPlanCatalogItem): DisplayFeatureItem | null {
  const extraStaffCap = plan.max_extra_staff;
  const extraOfficeCap = plan.max_extra_offices;
  if (extraStaffCap == null && extraOfficeCap == null) {
    return {
      code: 'extra-caps',
      label: 'Unlimited extra staff and offices',
      detail: 'Add more people and locations as you grow; they bill monthly.',
    };
  }
  if (extraStaffCap === 1 && extraOfficeCap === 0) {
    return {
      code: 'extra-caps',
      label: 'Add 1 extra staff; second office is Pro',
      detail: 'Starter can add one more person. A second location needs Pro.',
    };
  }
  if (extraOfficeCap === 0) {
    return {
      code: 'extra-caps',
      label: 'Second office is Pro',
      detail: 'This plan is one location. Upgrade to add another office.',
    };
  }
  return {
    code: 'extra-caps',
    label: 'Self-serve staff and office add-ons',
    detail: 'Buy extra seats and locations from billing when you need them.',
  };
}

function biLine(plan: BillingPlanCatalogItem): DisplayFeatureItem {
  const bi = plan.bi_features ?? [];
  if (bi.length > 1) {
    return {
      code: 'bi',
      label: 'Full business intelligence',
      detail: 'Growth, Revenue, Forecast, and Reports dashboards — not only Overview.',
    };
  }
  return {
    code: 'bi',
    label: 'BI Overview',
    detail: 'A simple snapshot of today’s numbers. Full BI is on Pro.',
  };
}

export function isProPlan(plan: BillingPlanCatalogItem) {
  return plan.plan_code.toLowerCase().includes('pro');
}

export function planFeatureDisplay(
  plan: BillingPlanCatalogItem,
  productPlans: BillingPlanCatalogItem[] = [],
): DisplayFeatureGroup[] {
  const starter = productPlans.find((item) => item.plan_code.toLowerCase().includes('starter'));
  const pro = isProPlan(plan);
  const enabled = plan.features ?? [];
  const starterKeys = new Set(starter?.features ?? []);
  const keysToShow =
    pro && starter ? enabled.filter((code) => !starterKeys.has(code)) : enabled;

  const included: DisplayFeatureItem[] = [];
  if (pro) {
    included.push({
      code: 'everything-starter',
      label: 'Everything in Starter',
      detail: 'All Starter functions stay included when you upgrade.',
    });
  }
  included.push(staffLine(plan));
  included.push({
    code: 'white-label',
    label: 'White-label customer app',
    detail: 'Customers install your brand on iOS and Android — not a generic IE Orbit listing.',
  });
  included.push(biLine(plan));
  if (!enabled.includes('ad_free')) {
    included.push({
      code: 'google-ads',
      label: 'Customer app may show Google Ads',
      detail: 'A plan with ad-free apps hides them so only your brand shows.',
    });
  }
  const extras = extraCapsLine(plan);
  if (extras) included.push(extras);

  return [{ title: 'Included', items: included }, ...groupPlanFeatures(keysToShow)];
}
