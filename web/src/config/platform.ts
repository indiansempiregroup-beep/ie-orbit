/**
 * Platform domain registry — logical grouping for multi-product architecture.
 * Maps existing Django apps / frontend features to Platform Core vs Application domains.
 * No runtime behavior; used for navigation, documentation, and future feature guards.
 */

export type PlatformDomainLayer = 'foundation' | 'platform_core' | 'application' | 'client';

export type PlatformDomain = {
  id: string;
  label: string;
  layer: PlatformDomainLayer;
  backendApps?: string[];
  frontendFeatures?: string[];
  owns?: string[];
  consumes?: string[];
};

/** Shared master data owned by Platform Core — single source of truth across products. */
export const PLATFORM_CORE_DOMAINS: PlatformDomain[] = [
  {
    id: 'business',
    label: 'Business',
    layer: 'platform_core',
    backendApps: ['businesses', 'tenancy'],
    frontendFeatures: ['settings'],
    owns: ['business profile', 'branding', 'working hours', 'localization', 'currency', 'timezone', 'branches (future)'],
  },
  {
    id: 'customer',
    label: 'Customer',
    layer: 'platform_core',
    backendApps: ['customers'],
    frontendFeatures: ['customers'],
    owns: ['customer profile', 'addresses', 'tags', 'preferences', 'notes'],
    consumes: [],
  },
  {
    id: 'staff',
    label: 'Staff',
    layer: 'platform_core',
    backendApps: ['staff', 'authentication'],
    frontendFeatures: ['staff', 'profile'],
    owns: ['staff profile', 'employment', 'business roles', 'skills', 'service assignments'],
  },
  {
    id: 'service_catalog',
    label: 'Service Catalog',
    layer: 'platform_core',
    backendApps: ['services'],
    frontendFeatures: ['services'],
    owns: ['services', 'categories', 'variants', 'pricing', 'duration'],
  },
  {
    id: 'identity',
    label: 'Identity & Access',
    layer: 'foundation',
    backendApps: ['authentication'],
    owns: ['users', 'platform roles', 'permissions', 'sessions'],
  },
  {
    id: 'media',
    label: 'Media',
    layer: 'platform_core',
    backendApps: ['platform_media'],
    owns: ['files', 'folders', 'uploads'],
  },
  {
    id: 'notifications_prefs',
    label: 'Notification Preferences',
    layer: 'platform_core',
    backendApps: ['notifications'],
    owns: ['notification templates', 'preferences'],
  },
];

/** Product-specific operational domains — reference Platform Core entities by ID. */
export const APPLICATION_DOMAINS: Record<string, PlatformDomain[]> = {
  appointie: [
    {
      id: 'bookings',
      label: 'Bookings',
      layer: 'application',
      backendApps: ['bookings'],
      frontendFeatures: ['bookings', 'calendar'],
      owns: ['bookings', 'availability', 'schedules', 'appointments', 'waiting list (future)'],
      consumes: ['customer', 'staff', 'service_catalog', 'business'],
    },
    {
      id: 'calendar_integration',
      label: 'Calendar Integration',
      layer: 'application',
      backendApps: ['calendar'],
      owns: ['external calendar connections'],
    },
  ],
  shopie: [
    {
      id: 'shop_commerce',
      label: 'ShopIE Commerce',
      layer: 'application',
      backendApps: ['shopie'],
      owns: ['products', 'barcodes', 'orders', 'stock', 'invoices', 'quotations'],
      consumes: ['customer', 'business', 'media'],
    },
  ],
  hrie: [
    {
      id: 'hr',
      label: 'Human Resources',
      layer: 'application',
      owns: ['attendance', 'payroll', 'leave'],
      consumes: ['staff', 'business'],
    },
  ],
};

export const PRODUCT_CODES = ['appointie', 'shopie', 'hrie'] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];

export function getApplicationDomains(productCode: string): PlatformDomain[] {
  return APPLICATION_DOMAINS[productCode] ?? [];
}

export function isPlatformCoreBackendApp(appLabel: string): boolean {
  return PLATFORM_CORE_DOMAINS.some((domain) => domain.backendApps?.includes(appLabel));
}
