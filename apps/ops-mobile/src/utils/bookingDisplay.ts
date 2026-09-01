import type { Booking } from '@ie-orbit/sdk';
import { entityLabel } from './entities';
import { formatTime } from './format';

const ACTIVE_UPCOMING_STATUSES = new Set([
  'pending',
  'draft',
  'confirmed',
  'checked_in',
  'in_progress',
  'rescheduled',
]);

export type BookingTimingTone = 'done' | 'now' | 'soon' | 'later';

export function isUpcomingBookingStatus(status?: string | null): boolean {
  return ACTIVE_UPCOMING_STATUSES.has(String(status || '').toLowerCase());
}

export function sortBookingsByStart<T extends { start_at?: string | null }>(bookings: T[]): T[] {
  return [...bookings].sort((a, b) => {
    const aTime = a.start_at ? new Date(a.start_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.start_at ? new Date(b.start_at).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

export function filterUpcomingBookings(bookings: Booking[], now = new Date()): Booking[] {
  return sortBookingsByStart(
    bookings.filter((booking) => {
      if (!isUpcomingBookingStatus(booking.status)) return false;
      const endAt = booking.end_at ? new Date(booking.end_at) : null;
      const startAt = booking.start_at ? new Date(booking.start_at) : null;
      if (!startAt || Number.isNaN(startAt.getTime())) return false;
      if (endAt && !Number.isNaN(endAt.getTime())) return endAt >= now;
      return startAt >= now;
    }),
  );
}

export function bookingTimeRangeLabel(
  startAt?: string | null,
  endAt?: string | null,
): string {
  if (!startAt) return '—';
  const start = formatTime(startAt);
  if (!endAt) return start;
  const end = formatTime(endAt);
  return end !== start ? `${start} – ${end}` : start;
}

export function bookingStartsInLabel(
  startAt?: string | null,
  endAt?: string | null,
  now = new Date(),
): { label: string; tone: BookingTimingTone } {
  if (!startAt) return { label: '—', tone: 'later' };
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  if (Number.isNaN(start.getTime())) return { label: '—', tone: 'later' };

  if (end && !Number.isNaN(end.getTime()) && end <= now) {
    return { label: 'Finished', tone: 'done' };
  }
  if (start <= now && (!end || end > now)) {
    return { label: 'In progress', tone: 'now' };
  }

  const diffMinutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (diffMinutes <= 0) return { label: 'Starting now', tone: 'now' };
  if (diffMinutes < 60) return { label: `In ${diffMinutes} min`, tone: 'soon' };
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) {
    return {
      label: minutes > 0 ? `In ${hours}h ${minutes}m` : `In ${hours}h`,
      tone: hours <= 2 ? 'soon' : 'later',
    };
  }
  return { label: formatTime(startAt), tone: 'later' };
}

export function bookingServiceLabel(
  booking: Pick<Booking, 'service_label' | 'service_id' | 'line_items'>,
  serviceMap: Map<string, string>,
): string {
  if (booking.service_label?.trim()) return booking.service_label;
  if (booking.line_items?.length) {
    const names = booking.line_items
      .map((item) => item.service_name || entityLabel(serviceMap, item.service_id, ''))
      .filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length > 1) return `${names[0]} + ${names.length - 1} more`;
  }
  return entityLabel(serviceMap, booking.service_id, 'Booking');
}

export function bookingCustomerLabel(
  booking: Pick<Booking, 'customer_name' | 'customer_id'>,
  customerMap: Map<string, string>,
): string {
  if (booking.customer_name?.trim()) return booking.customer_name;
  return entityLabel(customerMap, booking.customer_id);
}

export function bookingCustomerPhone(
  booking: Pick<Booking, 'customer_phone' | 'customer_id'>,
  customersById?: Map<string, { phone_number?: string | null }>,
): string {
  if (booking.customer_phone?.trim()) return booking.customer_phone.trim();
  if (booking.customer_id && customersById) {
    return customersById.get(booking.customer_id)?.phone_number?.trim() || '';
  }
  return '';
}

export function bookingStaffLabel(
  booking: Pick<Booking, 'staff_name' | 'staff_id'>,
  staffMap: Map<string, string>,
): string {
  if (booking.staff_name?.trim()) return booking.staff_name;
  return entityLabel(staffMap, booking.staff_id, '');
}
