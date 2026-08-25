import { APP_LANGUAGES, languageSelectOptions as sharedLanguageSelectOptions } from '@ie-orbit/i18n';

export const BUSINESS_CATEGORIES = [
  'Salon & Spa',
  'Clinic & Healthcare',
  'Fitness & Wellness',
  'Professional Services',
  'Retail',
  'Education & Training',
  'Home Services',
  'Other',
] as const;

export const INDUSTRIES = [
  'Beauty',
  'Healthcare',
  'Fitness',
  'Consulting',
  'Retail',
  'Education',
  'Automotive',
  'Hospitality',
  'Other',
] as const;

export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'CAD', label: 'Canadian Dollar (CAD)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
] as const;

export const LANGUAGES = APP_LANGUAGES;

export const WEEK_START_DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
] as const;

export const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
] as const;

export const TIME_FORMATS = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
] as const;

export const APPOINTMENT_INTERVALS = [5, 10, 15, 20, 30, 45, 60] as const;

export const DEFAULT_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export const BUFFER_TIMES = [0, 5, 10, 15, 30] as const;

export const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
] as const;

export const REGISTER_WIZARD_STEPS = [
  { id: 'business', label: 'Business' },
  { id: 'owner', label: 'Owner' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'branding', label: 'Branding' },
  { id: 'review', label: 'Review' },
  { id: 'provision', label: 'Provision' },
] as const;

export type RegisterWizardStepId = (typeof REGISTER_WIZARD_STEPS)[number]['id'];

export const GETTING_STARTED_ITEMS = [
  { id: 'profile', label: 'Complete business profile', path: '/settings/business' },
  { id: 'hours', label: 'Set weekly business hours', path: '/settings/business' },
  { id: 'logo', label: 'Upload logo', path: '/settings/business' },
  { id: 'service', label: 'Add first service', path: '/services' },
  { id: 'staff', label: 'Add first staff member', path: '/staff' },
  { id: 'team', label: 'Invite team', path: '/staff' },
  { id: 'customer', label: 'Create first customer', path: '/customers' },
  { id: 'booking', label: 'Create first booking', path: '/bookings' },
  { id: 'dashboard', label: 'View dashboard', path: '/dashboard' },
] as const;

export const ONBOARDING_DRAFT_KEY = 'ie:onboarding:register-draft';
export const GETTING_STARTED_KEY = 'ie:onboarding:getting-started';

export const currencySelectOptions = CURRENCIES.map((currency) => ({
  value: currency.code,
  label: currency.label,
}));

export const timezoneSelectOptions = TIMEZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
}));

export const languageSelectOptions = sharedLanguageSelectOptions();

export function ensureSelectOption(
  options: Array<{ value: string; label: string }>,
  current?: string | null,
) {
  const value = current?.trim();
  if (!value || options.some((option) => option.value === value)) {
    return options;
  }
  return [{ value, label: value }, ...options];
}

export function detectDefaultCurrency(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale.toUpperCase().includes('IN')) return 'INR';
    if (locale.toUpperCase().includes('GB')) return 'GBP';
    if (locale.toUpperCase().includes('AU')) return 'AUD';
    if (locale.toUpperCase().includes('CA')) return 'CAD';
    if (locale.toUpperCase().includes('AE')) return 'AED';
    if (locale.toUpperCase().includes('SG')) return 'SGD';
  } catch {
    // ignore
  }
  return 'USD';
}

export function detectDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
