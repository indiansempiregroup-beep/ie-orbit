import { useCallback, useEffect, useState } from 'react';
import type { Booking, Customer, Notification, Service, StaffMember } from '@ie-platform/sdk';
import { subscribeToNotificationStream } from '@ie-platform/sdk';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useOpsClient } from './useOpsClient';
import { getApiBaseUrl } from '../config/apiBaseUrl';

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
      setBooking(response.data);
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

export function useNotifications() {
  const client = useOpsClient();
  const { token } = useAuth();
  const { tenantId, businessId, ready } = useWorkspace();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.notifications.list();
      setNotifications(response.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!token || !ready) return undefined;

    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    if (tenantId) headers['X-Tenant-ID'] = tenantId;
    if (businessId) headers['X-Business-ID'] = businessId;

    const subscription = subscribeToNotificationStream({
      url: `${getApiBaseUrl()}/notifications/stream`,
      headers,
      onEvent: (event) => {
        if (event.type === 'notification.created') {
          const audience = event.data?.audience;
          if (!audience || audience === 'admin') void reload();
        }
      },
    });

    return () => subscription.close();
  }, [token, tenantId, businessId, ready, reload]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, loading, unreadCount, reload };
}

export function useDashboardSummary() {
  const client = useOpsClient();
  const { ready } = useWorkspace();
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!client || !ready) return;
    setLoading(true);
    try {
      const response = await client.analytics.dashboard.summary();
      setTodayCount(response.data?.today_count ?? 0);
    } catch {
      setTodayCount(0);
    } finally {
      setLoading(false);
    }
  }, [client, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { todayCount, loading, reload };
}
