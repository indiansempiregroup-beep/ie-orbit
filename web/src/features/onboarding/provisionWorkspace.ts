import type { RegisterWizardFormValues } from './schemas/registerWizardSchema';
import type { WorkspaceProvisionResponse } from '@ie-platform/sdk';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { uploadBrandingLogo } from './uploadBrandingLogo';
import { normalizeAffiliateCode } from './affiliateCode';
import { serializeWeeklyHours } from '../../lib/businessHours';
import {
  ACTIVE_BUSINESS_STORAGE_KEY,
  ACTIVE_TENANT_STORAGE_KEY,
} from '../../contexts/WorkspaceContext';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function normalizeWebsite(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type ProvisionArgs = {
  values: RegisterWizardFormValues;
  logoFile?: File | null;
  affiliateCode?: string;
};

export async function provisionWorkspace({
  values,
  logoFile,
  affiliateCode,
}: ProvisionArgs): Promise<WorkspaceProvisionResponse> {
  const slug = slugify(values.businessName);
  if (!slug) {
    throw new Error('Business name must contain valid characters for a workspace code.');
  }

  const publicClient = createAuthenticatedClient();
  const slugCheck = await publicClient.tenants.checkSlug(slug);
  if (!slugCheck.data.available) {
    throw new Error('This workspace code is already taken. Choose a different business name.');
  }

  const response = await publicClient.auth.registerBusiness({
    email: values.email,
    password: values.password,
    first_name: values.firstName,
    last_name: values.lastName,
    phone_number: values.mobile,
    slug,
    business_name: values.businessName,
    display_name: values.displayName || values.businessName,
    business_code: slug,
    business_type: values.businessCategory,
    industry_category: values.industry,
    business_email: values.businessEmail,
    primary_contact: values.businessPhone,
    website: normalizeWebsite(values.website),
    country: values.country,
    state: values.state,
    city: values.city,
    postal_code: values.postalCode,
    address_line1: values.address,
    timezone: values.timezone,
    currency: values.currency,
    language: values.language,
    selected_product: values.selectedProducts.includes('appointie') ? 'appointie' : values.selectedProducts[0],
    selected_products: values.selectedProducts,
    plan_code: values.planCodes[values.selectedProducts.includes('appointie') ? 'appointie' : values.selectedProducts[0]],
    plan_codes: Object.fromEntries(
      values.selectedProducts.map((product) => [product, values.planCodes[product]]).filter((entry) => entry[1]),
    ),
    primary_color: values.primaryColor,
    secondary_color: values.secondaryColor,
    affiliate_code: normalizeAffiliateCode(affiliateCode) || undefined,
    settings: {
      business_hours: values.skipHours
        ? { week_start_day: values.weekStartDay }
        : serializeWeeklyHours(values.businessHours, values.weekStartDay),
      localization: {
        timezone: values.timezone,
        currency: values.currency,
        language: values.language,
        date_format: values.dateFormat,
        time_format: values.timeFormat,
      },
      notification_preferences: {
        email: true,
        sms: false,
      },
      theme_overrides: {
        primary_color: values.primaryColor,
        secondary_color: values.secondaryColor,
        theme_mode: values.theme,
      },
    },
  });

  const payload = response.data;
  const tenantId = payload.tenant?.id;
  const businessId = payload.business?.id;
  if (!tenantId || !businessId) {
    throw new Error('Workspace provisioning failed.');
  }

  localStorage.setItem('ie:auth:access', payload.access);
  localStorage.setItem('ie:auth:refresh', payload.refresh);
  localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
  localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
  localStorage.setItem('ie:onboarding:show-welcome', 'true');

  if (logoFile) {
    try {
      await uploadBrandingLogo({
        accessToken: payload.access,
        tenantId,
        businessId,
        logoFile,
        displayName: values.displayName || values.businessName,
      });
    } catch {
      // Workspace already exists; branding can be updated later in settings.
    }
  }

  return payload;
}
