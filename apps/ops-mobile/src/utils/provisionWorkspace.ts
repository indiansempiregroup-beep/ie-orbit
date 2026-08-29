import type { ImagePickerAsset } from 'expo-image-picker';
import type { RegisterBusinessInput, WorkspaceProvisionResponse } from '@ie-orbit/sdk';
import { opsClient } from '../api/client';
import { uploadBrandingLogo } from '../api/media';

export const HOUR_DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const;

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
};

export type WeeklyHours = Record<(typeof HOUR_DAYS)[number]['value'], DayHours>;

export function defaultWeeklyHours(): WeeklyHours {
  return {
    monday: { open: true, start: '09:00', end: '18:00' },
    tuesday: { open: true, start: '09:00', end: '18:00' },
    wednesday: { open: true, start: '09:00', end: '18:00' },
    thursday: { open: true, start: '09:00', end: '18:00' },
    friday: { open: true, start: '09:00', end: '18:00' },
    saturday: { open: true, start: '09:00', end: '18:00' },
    sunday: { open: false, start: '09:00', end: '18:00' },
  };
}

export type RegisterWizardValues = {
  businessName: string;
  displayName: string;
  businessEmail: string;
  businessPhone: string;
  city: string;
  country: string;
  state: string;
  address: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  timezone: string;
  currency: string;
  language: string;
  selectedProducts: string[];
  planCodes: Record<string, string>;
  skipHours: boolean;
  businessHours: WeeklyHours;
  primaryColor: string;
  secondaryColor: string;
  logoAsset?: ImagePickerAsset | null;
  affiliateCode?: string;
  googleIdToken?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function normalizeAffiliateCode(value: string | undefined): string | undefined {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);
  return normalized || undefined;
}

function serializeHours(values: RegisterWizardValues) {
  if (values.skipHours) {
    return { week_start_day: 'monday' };
  }
  const openDay = HOUR_DAYS.map((day) => values.businessHours[day.value]).find((row) => row.open);
  return {
    week_start_day: 'monday',
    start: openDay?.start ?? '09:00',
    end: openDay?.end ?? '18:00',
    days: values.businessHours,
  };
}

export async function provisionWorkspace(values: RegisterWizardValues): Promise<WorkspaceProvisionResponse> {
  const slug = slugify(values.businessName);
  if (!slug) throw new Error('Business name must contain valid characters for a workspace code.');

  const slugCheck = await opsClient.tenants.checkSlug(slug);
  if (!slugCheck.data.available) {
    throw new Error('This workspace code is already taken. Choose a different business name.');
  }

  const body: RegisterBusinessInput = {
    email: values.email,
    password: values.googleIdToken ? undefined : values.password,
    google_id_token: values.googleIdToken,
    first_name: values.firstName,
    last_name: values.lastName,
    phone_number: values.mobile,
    slug,
    business_name: values.businessName,
    display_name: values.displayName || values.businessName,
    business_code: slug,
    business_email: values.businessEmail,
    primary_contact: values.businessPhone,
    country: values.country,
    state: values.state,
    city: values.city,
    postal_code: values.postalCode,
    address_line1: values.address,
    latitude: values.latitude,
    longitude: values.longitude,
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
    affiliate_code: normalizeAffiliateCode(values.affiliateCode),
    settings: {
      business_hours: serializeHours(values),
      localization: {
        timezone: values.timezone,
        currency: values.currency,
        language: values.language,
      },
    },
  };

  const response = await opsClient.auth.registerBusiness(body);
  const payload = response.data;
  const tenantId = payload.tenant?.id;
  const businessId = payload.business?.id;

  if (!tenantId || !businessId) {
    throw new Error('Workspace provisioning failed.');
  }

  if (values.logoAsset) {
    try {
      const uploaded = await uploadBrandingLogo({
        token: payload.access,
        tenantId,
        businessId,
        asset: values.logoAsset,
        displayName: values.displayName || values.businessName,
      });
      const logoUrl = uploaded.public_url || uploaded.private_url;
      if (logoUrl) {
        const scoped = opsClient;
        scoped.setToken(payload.access);
        await scoped.businesses.patch(businessId, { logo: logoUrl });
      }
    } catch {
      // Workspace already exists; branding can be updated later in settings.
    }
  }

  return payload;
}
