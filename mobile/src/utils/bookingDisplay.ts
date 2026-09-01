import type { MobileBooking, MobileBookingBranch } from '@ie-orbit/sdk';
import { formatTime } from './format';

export type BookingTimingTone = 'done' | 'now' | 'soon' | 'later';

export function bookingServiceLabel(
  booking: Pick<MobileBooking, 'service_name' | 'items'>,
): string {
  if (booking.service_name?.trim()) return booking.service_name.trim();
  const names = (booking.items ?? [])
    .map((item) => item.service_name?.trim())
    .filter(Boolean) as string[];
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} + ${names.length - 1} more`;
  return 'Appointment';
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

export function bookingDirectionsUrl(branch?: MobileBookingBranch | null): string | null {
  if (!branch) return null;
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${branch.latitude},${branch.longitude}`;
  }
  if (branch.formatted_address?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(branch.formatted_address)}`;
  }
  if (branch.display_name?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(branch.display_name)}`;
  }
  return null;
}

export function bookingStaffNames(
  booking: Pick<MobileBooking, 'staff_name' | 'items'>,
): string[] {
  const fromItems = (booking.items ?? [])
    .map((item) => item.staff_name?.trim())
    .filter(Boolean) as string[];
  const unique = [...new Set(fromItems)];
  if (unique.length) return unique;
  if (booking.staff_name?.trim()) return [booking.staff_name.trim()];
  return [];
}

export function bookingStaffLabel(
  booking: Pick<MobileBooking, 'staff_name' | 'items'>,
): string {
  const names = bookingStaffNames(booking);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
