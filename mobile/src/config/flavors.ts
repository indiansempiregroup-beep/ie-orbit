import type { BrandTheme } from '../theme/brandTheme';
import { colors } from '../theme/tokens';

export type MobileFlavorConfig = {
  flavorKey: string;
  appName: string;
  slug: string;
};

type FlavorManifestEntry = {
  key: string;
  appName: string;
  appSlug: string;
  tenantSlug: string;
  businessCode: string;
  primaryColor: string;
  secondaryColor: string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('../../flavors/manifest.json') as { flavors: FlavorManifestEntry[] };

const flavorKey = process.env.EXPO_PUBLIC_FLAVOR_KEY ?? '';
const selectedFlavor = manifest.flavors.find((row) => row.key === flavorKey);
const isDevMode = process.env.EXPO_PUBLIC_MOBILE_DEV_MODE === 'true';

export const mobileRuntime = {
  flavorKey,
  appSlug: process.env.EXPO_PUBLIC_APP_SLUG ?? selectedFlavor?.appSlug ?? 'ie-platform-mobile',
  isDevMode,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  referralLinkBaseUrl: process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL ?? '',
  appDownloadUrl: process.env.EXPO_PUBLIC_APP_DOWNLOAD_URL ?? '',
};

export function resolveBootstrapQuery(): {
  flavor_key?: string;
  tenant_slug?: string;
  business_code?: string;
} {
  if (mobileRuntime.flavorKey) {
    return { flavor_key: mobileRuntime.flavorKey };
  }
  if (mobileRuntime.isDevMode) {
    return {
      tenant_slug: process.env.EXPO_PUBLIC_TENANT_SLUG ?? 'demo',
      business_code: process.env.EXPO_PUBLIC_BUSINESS_CODE ?? 'MAIN',
    };
  }
  throw new Error('Missing EXPO_PUBLIC_FLAVOR_KEY for production mobile build.');
}

/** Local flavor defaults shown before bootstrap API responds. */
export function resolveFlavorBranding(): BrandTheme {
  const entry = manifest.flavors.find((row) => row.key === flavorKey);
  return {
    appName: process.env.EXPO_PUBLIC_APP_NAME ?? entry?.appName ?? 'AppointIE',
    primaryColor: entry?.primaryColor ?? colors.primary,
    secondaryColor: entry?.secondaryColor ?? colors.secondaryForeground,
    logo: null,
    tenantSlug: entry?.tenantSlug ?? process.env.EXPO_PUBLIC_TENANT_SLUG ?? '',
    businessCode: entry?.businessCode ?? process.env.EXPO_PUBLIC_BUSINESS_CODE ?? '',
  };
}
