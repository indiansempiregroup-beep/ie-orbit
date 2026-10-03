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

export function summarizeWeeklyHours(hours: WeeklyHours): string {
  const groups: string[] = [];
  let index = 0;
  while (index < HOUR_DAYS.length) {
    const day = HOUR_DAYS[index];
    const current = hours[day.value];
    if (!current?.open) {
      index += 1;
      continue;
    }
    let endIndex = index;
    while (endIndex + 1 < HOUR_DAYS.length) {
      const next = HOUR_DAYS[endIndex + 1];
      const nextHours = hours[next.value];
      if (!nextHours?.open || nextHours.start !== current.start || nextHours.end !== current.end) {
        break;
      }
      endIndex += 1;
    }
    const startLabel = HOUR_DAYS[index].label.slice(0, 3);
    const endLabel = HOUR_DAYS[endIndex].label.slice(0, 3);
    const range = index === endIndex ? startLabel : `${startLabel}–${endLabel}`;
    groups.push(`${range} ${current.start}–${current.end}`);
    index = endIndex + 1;
  }
  return groups.length ? groups.join(', ') : 'Closed every day';
}

export type RegisterWizardValues = {
  businessName: string;
  businessCategory: string;
  businessCategoryOther: string;
  industry: string;
  industryOther: string;
  businessEmail: string;
  businessPhone: string;
  website: string;
  city: string;
  country: string;
  state: string;
  address: string;
  addressLine2: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  mobile: string;
  ownerOtpCode: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  timezone: string;
  currency: string;
  language: string;
  weekStartDay: 'monday' | 'sunday';
  dateFormat: string;
  timeFormat: '12h' | '24h';
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

function normalizeWebsite(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function serializeHours(values: RegisterWizardValues) {
  if (values.skipHours) {
    return { week_start_day: values.weekStartDay };
  }
  const openDay = HOUR_DAYS.map((day) => values.businessHours[day.value]).find((row) => row.open);
  return {
    week_start_day: values.weekStartDay,
    start: openDay?.start ?? '09:00',
    end: openDay?.end ?? '18:00',
    days: values.businessHours,
  };
}

function resolveCategory(values: RegisterWizardValues) {
  if (values.businessCategory === 'Other' && values.businessCategoryOther.trim()) {
    return `Other: ${values.businessCategoryOther.trim()}`;
  }
  return values.businessCategory;
}

function resolveIndustry(values: RegisterWizardValues) {
  if (values.industry === 'Other' && values.industryOther.trim()) {
    return `Other: ${values.industryOther.trim()}`;
  }
  return values.industry;
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
    google_id_token: values.googleIdToken,
    otp_code: values.googleIdToken ? undefined : values.ownerOtpCode.trim(),
    otp_verified: Boolean(values.googleIdToken),
    first_name: values.firstName,
    last_name: values.lastName,
    phone_number: values.mobile,
    slug,
    business_name: values.businessName,
    display_name: values.displayName || values.businessName,
    business_code: slug,
    business_type: resolveCategory(values),
    industry_category: resolveIndustry(values),
    business_email: values.businessEmail,
    primary_contact: values.businessPhone,
    website: normalizeWebsite(values.website),
    country: values.country,
    state: values.state,
    city: values.city,
    postal_code: values.postalCode,
    address_line1: values.address,
    address_line2: values.addressLine2.trim(),
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
        theme_mode: 'light',
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
