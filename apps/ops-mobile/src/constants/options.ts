import { languageSelectOptions } from '@ie-orbit/i18n';

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

export const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
];

export const LANGUAGES = languageSelectOptions();

export const CURRENCIES = [
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'AUD', label: 'Australian Dollar (AUD)' },
  { value: 'CAD', label: 'Canadian Dollar (CAD)' },
  { value: 'SGD', label: 'Singapore Dollar (SGD)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
];

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
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (TIMEZONES.some((tz) => tz.value === detected)) return detected;
  } catch {
    // ignore
  }
  return 'UTC';
}

/** Duration options in 15-minute steps (15–240 minutes). */
export const DURATION_OPTIONS = Array.from({ length: 16 }, (_, i) => {
  const minutes = (i + 1) * 15;
  return { value: String(minutes), label: `${minutes} min` };
});

/** Clock times in 15-minute steps (00:00–23:45). */
export const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4);
  const minutes = (i % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const label = `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  return { value, label };
});
