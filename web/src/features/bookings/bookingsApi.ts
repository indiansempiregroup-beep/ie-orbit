import type { IEPlatformClient } from '@ie-platform/sdk';
import { type AvailabilitySlot, type Booking, type BookingCreateInput } from '@ie-platform/sdk';
import { normalizeQuery, type QueryParams } from '../../lib/apiQuery';
import { businessQueryParam } from '../../lib/workspace';

type AvailabilityQuery = {
  date: string;
  business?: string;
  staff_id?: string;
  duration_minutes?: number;
  interval_minutes?: number;
  buffer_minutes?: number;
};

function scopedQuery(businessId: string | null | undefined, query?: QueryParams) {
  return normalizeQuery({ ...businessQueryParam(businessId), ...query });
}

export async function listBookings(client: IEPlatformClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.bookings.list(scopedQuery(businessId, query));
  return response.data;
}

export async function createBooking(client: IEPlatformClient, booking: BookingCreateInput) {
  const response = await client.bookings.create(booking);
  return response.data;
}

export async function getBooking(client: IEPlatformClient, bookingId: string) {
  const response = await client.bookings.get(bookingId);
  return response.data;
}

export async function confirmBooking(client: IEPlatformClient, bookingId: string, reason?: string) {
  const response = await client.bookings.confirm(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function cancelBooking(client: IEPlatformClient, bookingId: string, reason?: string) {
  const response = await client.bookings.cancel(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function checkInBooking(client: IEPlatformClient, bookingId: string, reason?: string) {
  const response = await client.bookings.checkIn(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function completeBooking(client: IEPlatformClient, bookingId: string, reason?: string) {
  const response = await client.bookings.complete(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function rescheduleBooking(
  client: IEPlatformClient,
  bookingId: string,
  input: { start_at: string; reason?: string },
) {
  const response = await client.bookings.reschedule(bookingId, input);
  return response.data;
}

export async function getAvailability(
  client: IEPlatformClient,
  businessId: string | null | undefined,
  query: AvailabilityQuery,
) {
  const response = await client.bookings.availability({
    ...query,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export type { Booking, BookingCreateInput, AvailabilitySlot };
