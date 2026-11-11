import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiClientError,
  clampPageSize,
  type Booking,
  type BookingReview,
  type Customer,
  type DashboardSummary,
  type Service,
  type StaffMember,
} from '@ie-orbit/sdk';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../utils/format';
import { useOpsClient } from './useOpsClient';

export { useNotifications } from '../contexts/NotificationsContext';

/** Normalize list payloads whether the API returns an array or `{ results: [] }`. */
function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}

export type UseBookingsOptions = {
  date?: string;
  staffId?: string | null;
  status?: string;
  /** Server booking-number filter (`booking_id` query param). */
  q?: string;
  pageSize?: number;
  cursor?: string | null;
};

function resolveBookingsOptions(
  dateOrOptions?: string | UseBookingsOptions,
  legacyStaffId?: string | null,
): UseBookingsOptions {
  if (typeof dateOrOptions === 'string') {
    return { date: dateOrOptions, staffId: legacyStaffId };
  }
  return dateOrOptions ?? {};
}

export function useBookings(dateOrOptions?: string | UseBookingsOptions, legacyStaffId?: string | null) {
  const client = useOpsClient();
  const { ready, businessId } = useWorkspace();
  const { date, staffId, status, q, pageSize = 25, cursor } = resolveBookingsOptions(dateOrOptions, legacyStaffId);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const bookingsRef = useRef(bookings);
  const requestIdRef = useRef(0);
  bookingsRef.current = bookings;

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!client || !ready) return;
    const requestId = ++requestIdRef.current;
    const silent = opts?.silent ?? bookingsRef.current.length > 0;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await client.bookings.list({
        business: businessId || undefined,
        ...(date ? { date } : {}),
        ...(staffId ? { staff: staffId } : {}),
        ...(status ? { status } : {}),
        ...(q ? { booking_id: q } : {}),
        page_size: clampPageSize(pageSize),
        cursor: cursor || undefined,
      });
      if (requestId !== requestIdRef.current) return;
      setBookings(asList<Booking>(response.data));
      setNextCursor(response.meta?.pagination?.next_cursor ? String(response.meta.pagination.next_cursor) : null);
      setPreviousCursor(
        response.meta?.pagination?.previous_cursor ? String(response.meta.pagination.previous_cursor) : null,
      );
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
      // Keep existing rows on refresh failure so returning to the tab isn't blank.
      if (!bookingsRef.current.length) setBookings([]);
      setNextCursor(null);
      setPreviousCursor(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [client, ready, businessId, date, staffId, status, q, pageSize, cursor]);

  useEffect(() => {
    void reload({ silent: false });
  }, [reload]);

  return { bookings, loading, error, reload, nextCursor, previousCursor, pageSize };
}

export function useBooking(bookingId: string, initialBooking?: Booking | null) {
  const client = useOpsClient();
  const [booking, setBooking] = useState<Booking | null>(initialBooking ?? null);
  const [loading, setLoading] = useState(!initialBooking);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client || !bookingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let lastError: unknown;
    let fetched: Booking | null = null;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          }
          const response = await client.bookings.get(bookingId);
          let next: Booking = { ...response.data };
          if (!next.review) {
            try {
              const reviews = await client.bookings.listReviews({ booking: bookingId });
              const existing = asList<BookingReview>(reviews.data)[0];
              if (existing) {
                next = {
                  ...next,
                  review: {
                    id: existing.id,
                    rating: existing.rating,
                    comment: existing.comment,
                    created_at: existing.created_at,
                  },
                };
              }
            } catch {
              // Review lookup is best-effort; booking detail should still render.
            }
          }
          fetched = next;
          break;
        } catch (err) {
          lastError = err;
          const status = err instanceof ApiClientError ? err.status : 0;
          if (status !== 429) break;
        }
      }

      if (fetched) {
        setBooking(fetched);
        setError(null);
      } else if (lastError) {
        setError(getApiErrorMessage(lastError, 'Failed to load booking'));
      }
    } finally {
      setLoading(false);
    }
  }, [client, bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { booking, loading: loading && !booking, error: booking ? null : error, reload };
}

export function useCustomers(options?: { q?: string; pageSize?: number; cursor?: string | null }) {
  const client = useOpsClient();
  const { ready, businessId } = useWorkspace();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const pageSize = options?.pageSize ?? 50;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.customers.list({
        business: businessId || undefined,
        q,
        page_size: pageSize,
        cursor,
      });
      setCustomers(asList<Customer>(response.data));
      setNextCursor(response.meta?.pagination?.next_cursor ? String(response.meta.pagination.next_cursor) : null);
      setPreviousCursor(
        response.meta?.pagination?.previous_cursor ? String(response.meta.pagination.previous_cursor) : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
      setCustomers([]);
      setNextCursor(null);
      setPreviousCursor(null);
    } finally {
      setLoading(false);
    }
  }, [client, ready, businessId, q, pageSize, cursor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { customers, loading, error, reload, nextCursor, previousCursor, pageSize };
}

export function useCustomer(customerId: string) {
  const client = useOpsClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!client || !customerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await client.customers.get(customerId);
      setCustomer(response.data);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [client, customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { customer, loading, reload };
}

export function useServices(options?: { q?: string; pageSize?: number; cursor?: string | null }) {
  const client = useOpsClient();
  const { ready, businessId } = useWorkspace();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const pageSize = options?.pageSize ?? 50;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.services.list({
        business: businessId || undefined,
        q,
        page_size: pageSize,
        cursor,
      });
      setServices(asList<Service>(response.data));
      setNextCursor(response.meta?.pagination?.next_cursor ? String(response.meta.pagination.next_cursor) : null);
      setPreviousCursor(
        response.meta?.pagination?.previous_cursor ? String(response.meta.pagination.previous_cursor) : null,
      );
    } catch {
      setServices([]);
      setNextCursor(null);
      setPreviousCursor(null);
    } finally {
      setLoading(false);
    }
  }, [client, ready, businessId, q, pageSize, cursor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { services, loading, reload, nextCursor, previousCursor, pageSize };
}

export function useStaffMembers(options?: {
  q?: string;
  pageSize?: number;
  cursor?: string | null;
  status?: string;
}) {
  const client = useOpsClient();
  const { ready, businessId } = useWorkspace();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);
  const pageSize = options?.pageSize ?? 50;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;
  const status = options?.status;

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.staff.list({
        business: businessId ?? undefined,
        status: status || undefined,
        q,
        page_size: pageSize,
        cursor,
      });
      setStaff(asList<StaffMember>(response.data));
      setNextCursor(response.meta?.pagination?.next_cursor ? String(response.meta.pagination.next_cursor) : null);
      setPreviousCursor(
        response.meta?.pagination?.previous_cursor ? String(response.meta.pagination.previous_cursor) : null,
      );
    } catch {
      setStaff([]);
      setNextCursor(null);
      setPreviousCursor(null);
    } finally {
      setLoading(false);
    }
  }, [client, ready, businessId, status, q, pageSize, cursor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { staff, loading, reload, nextCursor, previousCursor, pageSize };
}

export function useReviews(customerId?: string) {
  const client = useOpsClient();
  const { ready, businessId } = useWorkspace();
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.bookings.listReviews({
        business: businessId ?? undefined,
        customer: customerId,
      });
      setReviews(asList<BookingReview>(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [client, ready, businessId, customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { reviews, loading, error, reload };
}

export function useDashboardSummary(staffId?: string | null) {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.analytics.dashboard.summary(staffId ? { staff_id: staffId } : undefined);
      setSummary(response.data ?? null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [client, ready, staffId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    summary,
    todayCount: summary?.today_count ?? summary?.appointie?.today_bookings ?? 0,
    loading,
    reload,
  };
}
