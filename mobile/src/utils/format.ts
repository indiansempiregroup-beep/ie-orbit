import { getActiveIntlLocale } from '@ie-orbit/i18n';
import { ApiClientError } from '@ie-orbit/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';

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

export function formatRelativeTime(isoDate?: string | null) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(getActiveIntlLocale(), withZone({}));
}

export function formatTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleTimeString(
    getActiveIntlLocale(),
    withZone({
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  );
}

export function formatDateKey(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format a service price for display; returns em dash when amount is missing or zero. */
export function formatMoney(amount?: number | null, currency?: string | null): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '—';
  const code = currency?.trim() || 'INR';
  try {
    return new Intl.NumberFormat(getActiveIntlLocale(), { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** Keep only slots that start strictly after now (hides past times for today). */
export function filterFutureSlots<T extends { start_at: string }>(
  slots: T[],
  nowMs: number = Date.now(),
): T[] {
  return slots.filter((slot) => {
    const ts = new Date(slot.start_at).getTime();
    return Number.isFinite(ts) && ts > nowMs;
  });
}

export function formatDateTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleString(
    getActiveIntlLocale(),
    withZone({
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  );
}

export function isUpcomingBooking(status: string, startAt: string) {
  const inactive = new Set(['cancelled', 'completed', 'rejected', 'no_show', 'expired']);
  return new Date(startAt) >= new Date() && !inactive.has(status);
}

export function mapBookingStatus(status: string): 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'noshow' {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
    case 'in_progress':
      return 'confirmed';
    case 'cancelled':
    case 'rejected':
      return 'cancelled';
    case 'completed':
      return 'completed';
    case 'no_show':
      return 'noshow';
    default:
      return 'pending';
  }
}

function formatErrorDetails(details: unknown): string {
  if (!details) return '';
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) {
    return details.map((item) => formatErrorDetails(item)).filter(Boolean).join(' ');
  }
  if (typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>)
      .map(([key, value]) => {
        const text = formatErrorDetails(value);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return String(details);
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timeout')
  );
}

const TECHNICAL_AUTH_MESSAGES = new Set([
  'authentication credentials were not provided or are invalid.',
  'authentication credentials were not provided.',
  'incorrect authentication credentials.',
  'invalid credentials.',
  'unable to log in with provided credentials.',
]);

export type AuthFormContext = 'login' | 'register' | 'forgot' | 'generic';

const AUTH_FORM_FALLBACKS: Record<AuthFormContext, string> = {
  login: "That email or password doesn't look right. Please try again.",
  register: "We couldn't create your account with those details. Please review and try again.",
  forgot: "We couldn't send a reset link right now. Please check the email and try again.",
  generic: 'Something went wrong with those details. Please try again.',
};

function isTechnicalAuthMessage(message: string): boolean {
  return TECHNICAL_AUTH_MESSAGES.has(message.trim().toLowerCase());
}

function humanizeAuthMessage(message: string, context: AuthFormContext = 'generic'): string {
  if (isTechnicalAuthMessage(message)) {
    return AUTH_FORM_FALLBACKS[context];
  }
  return message;
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
  context: AuthFormContext = 'generic',
): string {
  if (isNetworkFailure(error)) {
    return `Cannot reach API at ${getApiBaseUrl()}. Check Wi‑Fi / hotspot and that Windows Firewall allows TCP 8000.`;
  }
  if (error instanceof ApiClientError) {
    const details = formatErrorDetails(error.payload.error.details);
    const message = error.payload.error.message || error.message || fallback;
    if (details && message === 'One or more request fields are invalid.') {
      return details;
    }
    if (error.payload.error.code === 'AUTHENTICATION_FAILED' || isTechnicalAuthMessage(message)) {
      return humanizeAuthMessage(message, context);
    }
    return details ? `${humanizeAuthMessage(message, context)} (${details})` : humanizeAuthMessage(message, context);
  }
  if (error instanceof Error && error.message) {
    return humanizeAuthMessage(error.message, context);
  }
  return fallback;
}
