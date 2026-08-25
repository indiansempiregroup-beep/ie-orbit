import { useCallback, useEffect, useState } from 'react';
import {
  ApiClientError,
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

export function useBookings(date?: string) {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.bookings.list(date ? { date } : undefined);
      setBookings(asList<Booking>(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [client, ready, date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bookings, loading, error, reload };
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

export function useCustomers() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.customers.list();
      setCustomers(asList<Customer>(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { customers, loading, error, reload };
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

export function useServices() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.services.list();
      setServices(asList<Service>(response.data));
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { services, loading, reload };
}

export function useStaffMembers() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.staff.list();
      setStaff(asList<StaffMember>(response.data));
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { staff, loading, reload };
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

export function useDashboardSummary() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.analytics.dashboard.summary();
      setSummary(response.data ?? null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

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
