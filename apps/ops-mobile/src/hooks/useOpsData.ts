import { useCallback, useEffect, useState } from 'react';
import type { Booking, BookingReview, Customer, DashboardSummary, Service, StaffMember } from '@ie-platform/sdk';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useOpsClient } from './useOpsClient';

export { useNotifications } from '../contexts/NotificationsContext';

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
      setBookings(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [client, ready, date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bookings, loading, error, reload };
}

export function useBooking(bookingId: string) {
  const client = useOpsClient();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client || !bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.bookings.get(bookingId);
      let next: Booking = { ...response.data };
      if (!next.review) {
        try {
          const reviews = await client.bookings.listReviews({ booking: bookingId });
          const existing = reviews.data?.[0];
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
      setBooking(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [client, bookingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { booking, loading, error, reload };
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
      setCustomers(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
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
    if (!client || !customerId) return;
    setLoading(true);
    try {
      const response = await client.customers.get(customerId);
      setCustomer(response.data);
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
      setServices(response.data ?? []);
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
      setStaff(response.data ?? []);
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
      setReviews(response.data ?? []);
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
