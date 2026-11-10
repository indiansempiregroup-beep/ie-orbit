import type { Business, BusinessUpdateInput } from '@ie-orbit/sdk';
import type { TFunction } from 'i18next';
import { getProductName } from '../../config/products';
import {
  createDefaultWeeklyHours,
  serializeWeeklyHours,
  summarizeWeeklyHours,
  weeklyHoursFromSettings,
  type WeeklyHours,
} from '../../lib/businessHours';

export type BusinessProfileFormState = {
  business_name: string;
  display_name: string;
  business_type: string;
  industry_category: string;
  email: string;
  primary_contact: string;
  website: string;
  country: string;
  state: string;
  city: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  currency: string;
  timezone: string;
  language: string;
  week_start_day: string;
  business_hours: WeeklyHours;
  appointment_interval: number;
  default_duration: number;
  buffer_time: number;
  date_format: string;
  time_format: string;
  selected_product: string;
  primary_color: string;
  secondary_color: string;
  theme_mode: string;
  logo: string;
  upi_vpa: string;
  payment_qr_url: string;
};

type BusinessRecord = Business & {
  industry_category?: string | null;
  primary_contact?: string | null;
  website?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  language?: string | null;
};

type TenantBrandingSource = {
  primary_color?: string | null;
  secondary_color?: string | null;
  theme_mode?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createEmptyBusinessProfileFormState(): BusinessProfileFormState {
  return {
    business_name: '',
    display_name: '',
    business_type: '',
    industry_category: '',
    email: '',
    primary_contact: '',
    website: '',
    country: '',
    state: '',
    city: '',
    address_line1: '',
    address_line2: '',
    postal_code: '',
    latitude: null,
    longitude: null,
    currency: 'USD',
    timezone: 'UTC',
    language: 'en',
    week_start_day: 'monday',
    business_hours: createDefaultWeeklyHours(),
    appointment_interval: 15,
    default_duration: 30,
    buffer_time: 0,
    date_format: 'DD/MM/YYYY',
    time_format: '12h',
    selected_product: 'appointie',
    primary_color: '#1A56DB',
    secondary_color: '#111827',
    theme_mode: 'light',
    logo: '',
    upi_vpa: '',
    payment_qr_url: '',
  };
}

function resolveBusinessCategory(business: BusinessRecord, settings: Record<string, unknown>): string {
  const fromSettings = asString(settings.business_category);
  if (fromSettings) return fromSettings;
  const businessType = business.business_type ?? '';
  if (businessType && businessType !== 'service-business') return businessType;
  return '';
}

export function businessToFormState(
  business: BusinessRecord,
  tenantBranding?: TenantBrandingSource | null,
): BusinessProfileFormState {
  const settings = asRecord(business.settings);
  const localization = asRecord(settings.localization);
  const businessHours = asRecord(settings.business_hours);
  const durationDefaults = asRecord(settings.appointment_duration_defaults);
  const themeOverrides = asRecord(settings.theme_overrides);
  const businessCategory = resolveBusinessCategory(business, settings);

  return {
    business_name: business.business_name ?? '',
    display_name: business.display_name ?? '',
    business_type: businessCategory,
    industry_category: business.industry_category ?? '',
    email: business.email ?? '',
    primary_contact: business.primary_contact ?? '',
    website: business.website ?? '',
    country: business.country ?? '',
    state: business.state ?? '',
    city: business.city ?? '',
    address_line1: business.address_line1 ?? '',
    address_line2: business.address_line2 ?? '',
    postal_code: business.postal_code ?? '',
    latitude: business.latitude != null ? Number(business.latitude) : null,
    longitude: business.longitude != null ? Number(business.longitude) : null,
    currency: business.currency ?? 'USD',
    timezone: business.timezone ?? 'UTC',
    language: business.language ?? localization.language?.toString() ?? 'en',
    week_start_day: asString(businessHours.week_start_day, 'monday'),
    business_hours: weeklyHoursFromSettings(businessHours),
    appointment_interval: asNumber(settings.time_slot_interval, 15),
    default_duration: asNumber(durationDefaults.default_minutes, 30),
    buffer_time: asNumber(settings.buffer_time, 0),
    date_format: asString(localization.date_format, 'DD/MM/YYYY'),
    time_format: asString(localization.time_format, '12h'),
    selected_product: business.selected_product ?? 'appointie',
    primary_color: tenantBranding?.primary_color ?? asString(themeOverrides.primary_color, '#1A56DB'),
    secondary_color: tenantBranding?.secondary_color ?? asString(themeOverrides.secondary_color, '#111827'),
    theme_mode: 'light',
    logo: business.logo ?? '',
    upi_vpa: business.upi_vpa ?? '',
    payment_qr_url: business.payment_qr_url ?? '',
  };
}

export function formStateToBusinessUpdate(
  formState: BusinessProfileFormState,
  existingSettings?: Record<string, unknown>,
): BusinessUpdateInput {
  const settings = {
    ...(existingSettings ?? {}),
    business_category: formState.business_type,
    time_slot_interval: formState.appointment_interval,
    buffer_time: formState.buffer_time,
    business_hours: serializeWeeklyHours(formState.business_hours, formState.week_start_day),
    appointment_duration_defaults: {
      default_minutes: formState.default_duration,
    },
    localization: {
      timezone: formState.timezone,
      currency: formState.currency,
      language: formState.language,
      date_format: formState.date_format,
      time_format: formState.time_format,
    },
    theme_overrides: {
      primary_color: formState.primary_color,
      secondary_color: formState.secondary_color,
      theme_mode: 'light',
    },
  };

  return {
    business_name: formState.business_name,
    display_name: formState.display_name,
    business_type: formState.business_type || 'service-business',
    industry_category: formState.industry_category,
    email: formState.email,
    primary_contact: formState.primary_contact,
    website: formState.website || undefined,
    country: formState.country,
    state: formState.state,
    city: formState.city,
    address_line1: formState.address_line1,
    address_line2: formState.address_line2,
    postal_code: formState.postal_code,
    latitude: formState.latitude,
    longitude: formState.longitude,
    currency: formState.currency,
    timezone: formState.timezone,
    language: formState.language,
    selected_product: formState.selected_product,
    upi_vpa: formState.upi_vpa,
    payment_qr_url: formState.payment_qr_url,
    settings,
  };
}

export type BusinessProfileSection = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

export function buildBusinessProfileSections(
  formState: BusinessProfileFormState,
  t: TFunction,
): BusinessProfileSection[] {
  const address = [
    formState.address_line2,
    formState.address_line1,
    formState.city,
    formState.state,
    formState.country,
    formState.postal_code,
  ]
    .filter(Boolean)
    .join(', ');
  const notProvided = t('settings.businessView.notProvided');
  const minutes = (value: number) => t('settings.businessEdit.minutesValue', { value });

  return [
    {
      title: t('settings.businessEdit.sectionDetails'),
      items: [
        { label: t('settings.businessView.businessName'), value: formState.business_name || notProvided },
        { label: t('settings.businessEdit.displayName'), value: formState.display_name || notProvided },
        { label: t('settings.businessView.category'), value: formState.business_type || notProvided },
        { label: t('settings.businessView.industry'), value: formState.industry_category || notProvided },
        { label: t('settings.businessView.email'), value: formState.email || notProvided },
        { label: t('settings.businessView.phone'), value: formState.primary_contact || notProvided },
        { label: t('settings.businessView.website'), value: formState.website || notProvided },
      ],
    },
    {
      title: t('settings.businessView.sectionLocation'),
      items: [
        { label: t('settings.businessView.address'), value: address || notProvided },
      ],
    },
    {
      title: t('settings.businessEdit.sectionRegional'),
      items: [
        { label: t('common.currency'), value: formState.currency || notProvided },
        { label: t('common.timezone'), value: formState.timezone || notProvided },
        { label: t('common.language'), value: formState.language || notProvided },
        { label: t('settings.businessView.dateFormat'), value: formState.date_format || notProvided },
        { label: t('settings.businessView.timeFormat'), value: formState.time_format || notProvided },
      ],
    },
    {
      title: t('settings.businessEdit.sectionOperations'),
      items: [
        { label: t('settings.businessView.weekStart'), value: formState.week_start_day || notProvided },
        { label: t('settings.businessView.businessHours'), value: summarizeWeeklyHours(formState.business_hours) },
        ...(formState.selected_product === 'appointie'
          ? [
              { label: t('settings.businessView.appointmentInterval'), value: minutes(formState.appointment_interval) },
              { label: t('settings.businessView.defaultDuration'), value: minutes(formState.default_duration) },
              { label: t('settings.businessView.bufferTime'), value: minutes(formState.buffer_time) },
            ]
          : []),
      ],
    },
    {
      title: t('settings.businessEdit.sectionProduct'),
      items: [
        { label: t('settings.businessView.selectedProduct'), value: getProductName(formState.selected_product) },
      ],
    },
    {
      title: t('settings.businessEdit.sectionBranding'),
      items: [
        { label: t('settings.businessView.primaryColor'), value: formState.primary_color || notProvided },
        { label: t('settings.businessView.secondaryColor'), value: formState.secondary_color || notProvided },
        {
          label: t('settings.businessView.logo'),
          value: formState.logo ? t('settings.businessView.uploaded') : t('settings.businessView.notUploaded'),
        },
      ],
    },
  ];
}

export function formStatesEqual(a: BusinessProfileFormState, b: BusinessProfileFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
