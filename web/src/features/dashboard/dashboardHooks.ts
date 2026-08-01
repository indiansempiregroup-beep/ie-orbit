import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type TenantSettingsResponse } from '@ie-platform/sdk';
import {
  AvailabilitySlot,
  Booking,
  Business,
  Customer,
  Notification,
  Service,
  StaffMember,
  getAvailability,
  getBusinessById,
  getBusinessMe,
  listBookings,
  listBusinesses,
  listCustomers,
  listNotifications,
  listServices,
  listStaff,
  searchBookings,
} from './dashboardApi';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveBusiness } from '../../hooks/useActiveBusiness';
import { useBusinessProfileUpdate } from '../settings/businessSettingsHooks';

const KPI_REFRESH_INTERVALS = [0, 30000, 60000, 300000] as const;
const STORAGE_KEY = 'ie:dashboard:settings';

type DashboardPreferences = {
  refreshInterval: number;
  layout: 'grid' | 'compact';
};

const defaultPreferences: DashboardPreferences = {
  refreshInterval: 60000,
  layout: 'grid',
};

function persistPreferences(preferences: DashboardPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // ignore
  }
}

function loadPreferences(): DashboardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>;
    return {
      ...defaultPreferences,
      ...parsed,
    };
  } catch {
    return defaultPreferences;
  }
}

function parseServerPreferences(settings?: Record<string, unknown> | null): DashboardPreferences | null {
  const raw = settings?.dashboard_preferences;
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<DashboardPreferences>;
  return {
    ...defaultPreferences,
    ...parsed,
  };
}

export function useDashboardSettings() {
  const business = useActiveBusiness();
  const updateBusiness = useBusinessProfileUpdate();
  const [preferences, setPreferences] = useState<DashboardPreferences>(() => loadPreferences());

  useEffect(() => {
    const settings = business.data?.settings as Record<string, unknown> | undefined;
    const serverPreferences = parseServerPreferences(settings);
    if (serverPreferences) {
      setPreferences(serverPreferences);
      persistPreferences(serverPreferences);
    }
  }, [business.data?.settings]);

  const persistToServer = useCallback(
    (next: DashboardPreferences) => {
      updateBusiness.mutate({
        settings: {
          dashboard_preferences: next,
        },
      });
    },
    [updateBusiness],
  );

  const setRefreshInterval = (refreshInterval: number) => {
    const next = { ...preferences, refreshInterval };
    setPreferences(next);
    persistPreferences(next);
    persistToServer(next);
  };

  const setLayout = (layout: DashboardPreferences['layout']) => {
    const next = { ...preferences, layout };
    setPreferences(next);
    persistPreferences(next);
    persistToServer(next);
  };

  return {
    preferences,
    refreshIntervalOptions: KPI_REFRESH_INTERVALS,
    setRefreshInterval,
    setLayout,
  };
}

export { useActiveBusiness as useBusinessProfile } from '../../hooks/useActiveBusiness';

export function useBusinessOptions() {
  const auth = useAuth();
  const workspace = useWorkspace();
  return useQuery<Business[], Error>({
    queryKey: ['dashboard', 'businesses', auth.user?.id ?? 'anonymous', workspace.tenantId ?? 'default'],
    queryFn: async () => {
      const businesses = await listBusinesses(auth.token, workspace.tenantId);
      if (Array.isArray(businesses) && businesses.length > 0) {
        return businesses;
      }
      const fallbackBusiness = await getBusinessMe(auth.token, workspace.tenantId);
      return fallbackBusiness ? [fallbackBusiness] : [];
    },
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useTenantSettings() {
  const auth = useAuth();
  const workspace = useWorkspace();
  return useQuery<TenantSettingsResponse, Error>({
    queryKey: ['dashboard', 'tenant-settings', workspace.tenantId ?? 'default'],
    queryFn: async () => {
      const client = createAuthenticatedClient(auth.token, workspace.tenantId);
      const response = await client.tenants.getSettings();
      return response.data;
    },
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBookingLists(date: string, range?: { from: string; to: string }) {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.businessId;
  const tenantId = workspace.tenantId;

  const todayQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'today', tenantId, businessId, date],
    queryFn: () => listBookings(auth.token, tenantId, businessId, { date }),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  const rangeQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'range', tenantId, businessId, range?.from, range?.to],
    queryFn: () => listBookings(auth.token, tenantId, businessId, { date_from: range?.from, date_to: range?.to }),
    enabled: Boolean(auth.token) && Boolean(businessId) && Boolean(range),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  const upcomingQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'upcoming', tenantId, businessId, range?.from, range?.to],
    queryFn: () => listBookings(auth.token, tenantId, businessId, { date_from: range?.from, date_to: range?.to }),
    enabled: Boolean(auth.token) && Boolean(businessId) && Boolean(range),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'bookings'] });
  };

  return {
    todayBookings: todayQuery,
    rangeBookings: rangeQuery,
    upcomingBookings: upcomingQuery,
    refresh,
  };
}

export function useBusinessLists() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const businessId = workspace.businessId;
  const tenantId = workspace.tenantId;

  const customers = useQuery<Customer[], Error>({
    queryKey: ['dashboard', 'customers', tenantId, businessId],
    queryFn: () => listCustomers(auth.token, tenantId, businessId),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60 * 5,
  });

  const staff = useQuery<StaffMember[], Error>({
    queryKey: ['dashboard', 'staff', tenantId, businessId],
    queryFn: () => listStaff(auth.token, tenantId, businessId),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60 * 5,
  });

  const services = useQuery<Service[], Error>({
    queryKey: ['dashboard', 'services', tenantId, businessId],
    queryFn: () => listServices(auth.token, tenantId, businessId),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60 * 5,
  });

  const notifications = useQuery<Notification[], Error>({
    queryKey: ['dashboard', 'notifications', tenantId, businessId],
    queryFn: () => listNotifications(auth.token, tenantId, businessId),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });

  const availability = useQuery<AvailabilitySlot[], Error>({
    queryKey: ['dashboard', 'availability', tenantId, businessId, new Date().toISOString().slice(0, 10)],
    queryFn: () => getAvailability(auth.token, tenantId, businessId, new Date().toISOString().slice(0, 10)),
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60 * 5,
  });

  return {
    customers,
    staff,
    services,
    notifications,
    availability,
  };
}

export function useSearchResults(term: string) {
  const auth = useAuth();
  const workspace = useWorkspace();
  const client = useApiClient();
  const businessId = workspace.businessId;
  const tenantId = workspace.tenantId;
  const normalized = term.trim();

  return useQuery<{
    bookings: Booking[];
    customers: Customer[];
    staff: StaffMember[];
    services: Service[];
  }, Error>({
    queryKey: ['dashboard', 'search', tenantId, businessId, normalized],
    queryFn: async () => {
      if (!normalized) {
        return {
          bookings: [] as Booking[],
          customers: [] as Customer[],
          staff: [] as StaffMember[],
          services: [] as Service[],
        };
      }
      const [bookings, operations] = await Promise.all([
        searchBookings(auth.token, tenantId, businessId, normalized),
        client.operations.search({ q: normalized }),
      ]);
      return {
        bookings,
        customers: operations.data.customers,
        staff: operations.data.staff,
        services: operations.data.services,
      };
    },
    enabled: Boolean(auth.token) && Boolean(businessId) && normalized.length > 0,
    staleTime: 1000 * 10,
  });
}

export function deriveDashboardKpis(
  bookings: Array<{ status?: string; service_id?: string }>,
  monthlyBookings: Array<{ status?: string; service_id?: string }>,
  customers: Array<{ status?: string | null; created_at?: string }>,
  staff: Array<{ status?: string | null }>,
  services: Array<{ id?: string; price?: number | null }>,
  availability: Array<{ capacity: number }>,
) {
  const serviceMap = services.reduce((acc, service) => {
    if (service.id) acc[service.id] = service.price ?? 0;
    return acc;
  }, {} as Record<string, number>);

  const calculateRevenue = (items: typeof bookings | typeof monthlyBookings) => {
    return items.reduce((sum, booking) => sum + (booking.service_id ? serviceMap[booking.service_id] ?? 0 : 0), 0);
  };

  const todayCompleted = bookings.filter((booking) => booking.status === 'completed').length;
  const todayCancelled = bookings.filter((booking) => booking.status === 'cancelled').length;
  const activeCustomers = customers.filter((customer) => customer.status === 'active').length || customers.length;
  const newCustomers = customers.filter((customer) => {
    if (!customer.created_at) return false;
    return customer.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
  }).length;
  const revenueToday = calculateRevenue(bookings);
  const revenueMonth = calculateRevenue(monthlyBookings);
  const staffOnDuty = staff.filter((member) => member.status === 'active').length || staff.length;
  const totalCapacity = availability.reduce((sum, slot) => sum + (slot.capacity ?? 0), 0) || Math.max(1, bookings.length);
  const occupancyRate = totalCapacity ? Math.min(100, Math.round((bookings.length / totalCapacity) * 100)) : 0;

  return {
    todayCount: bookings.length,
    todayCompleted,
    todayCancelled,
    revenueToday,
    revenueMonth,
    activeCustomers,
    newCustomers,
    staffOnDuty,
    occupancyRate,
  };
}

export function useDashboardSummary() {
  const client = useApiClient();
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['dashboard', 'summary', workspace.tenantId, workspace.businessId],
    queryFn: async () => (await client.analytics.dashboard.summary()).data,
    enabled: Boolean(workspace.businessId),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: true,
  });
}
