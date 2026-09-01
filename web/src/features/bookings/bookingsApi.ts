import type { IEOrbitClient, BookingLineItemStaffInput, BookingReassignableStaffResponse } from '@ie-orbit/sdk';
import { type AvailabilitySlot, type Booking, type BookingCreateInput } from '@ie-orbit/sdk';
import { normalizeQuery, type QueryParams } from '../../lib/apiQuery';
import { businessQueryParam } from '../../lib/workspace';

type AvailabilityQuery = {
  date: string;
  business?: string;
  staff_id?: string;
  service_id?: string;
  service_ids?: string[];
  items?: Array<{ service_id: string; duration_minutes?: number; sort_order?: number }>;
  duration_minutes?: number;
  interval_minutes?: number;
  buffer_minutes?: number;
};

function scopedQuery(businessId: string | null | undefined, query?: QueryParams) {
  return normalizeQuery({ ...businessQueryParam(businessId), ...query });
}

export async function listBookings(client: IEOrbitClient, businessId?: string | null, query?: QueryParams) {
  const response = await client.bookings.list(scopedQuery(businessId, query));
  return response.data;
}

export async function createBooking(client: IEOrbitClient, booking: BookingCreateInput) {
  const response = await client.bookings.create(booking);
  return response.data;
}

export async function getBooking(client: IEOrbitClient, bookingId: string) {
  const response = await client.bookings.get(bookingId);
  return response.data;
}

export async function confirmBooking(client: IEOrbitClient, bookingId: string, reason?: string) {
  const response = await client.bookings.confirm(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function cancelBooking(client: IEOrbitClient, bookingId: string, reason?: string) {
  const response = await client.bookings.cancel(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function checkInBooking(client: IEOrbitClient, bookingId: string, reason?: string) {
  const response = await client.bookings.checkIn(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function completeBooking(client: IEOrbitClient, bookingId: string, reason?: string) {
  const response = await client.bookings.complete(bookingId, reason ? { reason } : undefined);
  return response.data;
}

export async function rescheduleBooking(
  client: IEOrbitClient,
  bookingId: string,
  input: { start_at: string; reason?: string },
) {
  const response = await client.bookings.reschedule(bookingId, input);
  return response.data;
}

export async function updateBookingStaff(
  client: IEOrbitClient,
  bookingId: string,
  staff_id: string | null,
) {
  const response = await client.bookings.patch(bookingId, { staff_id });
  return response.data;
}

export async function updateBookingLineItemStaff(
  client: IEOrbitClient,
  bookingId: string,
  line_item_staff: BookingLineItemStaffInput[],
) {
  const response = await client.bookings.patch(bookingId, { line_item_staff });
  return response.data;
}

export async function getReassignableStaff(client: IEOrbitClient, bookingId: string) {
  const response = await client.bookings.reassignableStaff(bookingId);
  return response.data;
}

export async function getAvailability(
  client: IEOrbitClient,
  businessId: string | null | undefined,
  query: AvailabilityQuery,
) {
  const response = await client.bookings.availability({
    ...query,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export type { Booking, BookingCreateInput, AvailabilitySlot, BookingReassignableStaffResponse };
