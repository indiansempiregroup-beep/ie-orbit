import { createApiClient, type AvailabilitySlot, type Booking, type Customer, type Notification, type Service, type StaffMember, type Business } from '@ie-platform/sdk';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildClient(token?: string | null) {
  const client = createApiClient({ baseUrl: '/api' });
  if (token) {
    client.setToken(token);
  }
  return client;
}

function normalizeQuery(query?: QueryParams): QueryParams | undefined {
  if (!query) return undefined;
  return Object.entries(query).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    if (typeof value === 'boolean') {
      acc[key] = value ? 'true' : 'false';
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as QueryParams);
}

export async function getBusinessMe(token?: string | null) {
  const client = buildClient(token);
  const response = await client.businesses.me();
  return response.data;
}

export async function listBookings(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.bookings.list(normalizeQuery(query));
  return response.data;
}

export async function listCustomers(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.customers.list(normalizeQuery(query));
  return response.data;
}

export async function listStaff(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.staff.list(normalizeQuery(query));
  return response.data;
}

export async function listServices(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.services.list(normalizeQuery(query));
  return response.data;
}

export async function listNotifications(token: string | null, query?: QueryParams) {
  const client = buildClient(token);
  const response = await client.notifications.list(normalizeQuery(query));
  return response.data;
}

export async function getAvailability(token: string | null, date: string) {
  const client = buildClient(token);
  const response = await client.bookings.availability({ date });
  return response.data;
}

export async function markNotificationAsRead(token: string | null, notificationId: string) {
  const client = buildClient(token);
  const response = await client.notifications.markRead(notificationId);
  return response.data;
}

export async function markAllNotificationsAsRead(token: string | null) {
  const client = buildClient(token);
  const response = await client.notifications.readAll();
  return response.data;
}

export async function searchCustomers(token: string | null, term: string) {
  const customers = await listCustomers(token);
  const lower = term.trim().toLowerCase();
  return customers.filter((customer) => {
    return [customer.full_name, customer.email, customer.phone_number, customer.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function searchStaff(token: string | null, term: string) {
  const staff = await listStaff(token);
  const lower = term.trim().toLowerCase();
  return staff.filter((item) => {
    return [item.full_name, item.email, item.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function searchServices(token: string | null, term: string) {
  const services = await listServices(token);
  const lower = term.trim().toLowerCase();
  return services.filter((item) => {
    return [item.name, item.description, item.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export async function searchBookings(token: string | null, term: string) {
  const normalized = term.trim();
  if (!normalized) {
    return [] as Booking[];
  }
  const bookings = await listBookings(token, { booking_id: normalized });
  if (bookings.length > 0) {
    return bookings;
  }
  const allBookings = await listBookings(token);
  const lower = normalized.toLowerCase();
  return allBookings.filter((booking) => {
    return [booking.booking_number, booking.customer_id, booking.staff_id, booking.service_id, booking.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lower));
  });
}

export type { AvailabilitySlot, Booking, Customer, Notification, Service, StaffMember, Business };
