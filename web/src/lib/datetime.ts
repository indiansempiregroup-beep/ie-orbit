type DateTimeZoneConfig = {
  userTimezone?: string | null;
  businessTimezone?: string | null;
};

let userTimezone: string | undefined;
let businessTimezone: string | undefined;

function normalizeTimezone(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Configure display zones: user profile → business → device local. */
export function configureDateTimeZones(config: DateTimeZoneConfig) {
  userTimezone = normalizeTimezone(config.userTimezone);
  businessTimezone = normalizeTimezone(config.businessTimezone);
}

export function resolveDisplayTimeZone(): string | undefined {
  return userTimezone || businessTimezone || undefined;
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

export function formatTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, withZone(TIME_OPTIONS));
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, withZone(DATE_TIME_OPTIONS));
}

/** Full timestamp for audit/created/updated fields. */
export function formatTimestamp(value?: string | Date | null) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, withZone(TIMESTAMP_OPTIONS));
}
