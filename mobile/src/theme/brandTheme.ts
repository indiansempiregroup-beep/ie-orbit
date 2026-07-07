import type { MobileBootstrapResponse } from '@ie-platform/sdk';
import { colors } from './tokens';

export type BrandTheme = {
  primaryColor: string;
  secondaryColor: string;
  appName: string;
  logo: string | null;
  tenantSlug: string;
  businessCode: string;
};

export function applyMobileBranding(bootstrap: MobileBootstrapResponse): BrandTheme {
  const rawLogo = bootstrap.branding.logo || bootstrap.business.logo || null;
  return {
    primaryColor: bootstrap.branding.primary_color || colors.primary,
    secondaryColor: bootstrap.branding.secondary_color || colors.secondaryForeground,
    appName: bootstrap.business.display_name || bootstrap.app_name,
    logo: rawLogo || null,
    tenantSlug: bootstrap.tenant_slug,
    businessCode: bootstrap.business_code,
  };
}
