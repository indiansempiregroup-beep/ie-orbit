import { getActiveIntlLocale } from '@ie-orbit/i18n';

type DateTimeZoneConfig = {
  userTimezone?: string | null;
  businessTimezone?: string | null;
};

let userTimezone: string | undefined;
let businessTimezone: string | undefined;

/** Common non-IANA labels → IANA zones (Intl rejects bare "IST"). */
const TIMEZONE_ALIASES: Record<string, string> = {
  IST: 'Asia/Kolkata',
};

function normalizeTimezone(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return TIMEZONE_ALIASES[trimmed.toUpperCase()] ?? trimmed;
}

/** Configure display zones: business (venue) → user profile → device local. */
export function configureDateTimeZones(config: DateTimeZoneConfig) {
  userTimezone = normalizeTimezone(config.userTimezone);
  businessTimezone = normalizeTimezone(config.businessTimezone);
}

/**
 * Prefer business timezone so booking slots show venue wall-clock time.
 * Auth users default to "UTC", which previously overrode Asia/Kolkata and
 * made 3:30 PM IST slots render as 10:00 AM.
 */
export function resolveDisplayTimeZone(): string | undefined {
  return businessTimezone || userTimezone || undefined;
}

function withZone(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const timeZone = resolveDisplayTimeZone();
  return timeZone ? { ...options, timeZone } : options;
}

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

function localeTag() {
  return getActiveIntlLocale();
}

export function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(localeTag(), withZone(TIME_OPTIONS));
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(localeTag(), withZone(DATE_TIME_OPTIONS));
}

/** Full timestamp for audit/created/updated fields. */
export function formatTimestamp(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(localeTag(), withZone(TIMESTAMP_OPTIONS));
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/** Date-only labels for plan trial/renewal fields. */
export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(localeTag(), withZone(DATE_OPTIONS));
}
