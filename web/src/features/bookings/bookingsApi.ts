import { createApiClient, type AvailabilitySlot, type Booking, type BookingCreateInput } from '@ie-platform/sdk';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

type AvailabilityQuery = {
  date: string;
  business?: string;
  staff_id?: string;
  duration_minutes?: number;
  interval_minutes?: number;
  buffer_minutes?: number;
};

function buildClient(token?: string | null) {
  const client = createApiClient({ baseUrl: '/api' });
  if (token) client.setToken(token);
  return client;
}

function normalizeQuery(query?: QueryParams): QueryParams | undefined {
  if (!query) return undefined;
  return Object.entries(query).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    return acc;
  }, {} as QueryParams);
}

export async function listBookings(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.bookings.list(normalizeQuery(query));
  return response.data;
}

export async function createBooking(token: string | null, booking: BookingCreateInput) {
  const client = buildClient(token);
  const response = await client.bookings.create(booking);
  return response.data;
}

export async function getAvailability(token: string | null, query: AvailabilityQuery) {
  const client = buildClient(token);
  const response = await client.bookings.availability(query);
  return response.data;
}

export type { Booking, BookingCreateInput, AvailabilitySlot };
