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
  return date.toLocaleDateString(undefined, withZone({}));
}

export function formatTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleTimeString(
    undefined,
    withZone({
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  );
}

export function formatDateTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleString(
    undefined,
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
