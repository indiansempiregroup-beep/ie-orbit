import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AvailabilitySlot,
  Booking,
  Business,
  Customer,
  Notification,
  Service,
  StaffMember,
  getAvailability,
  getBusinessMe,
  listBookings,
  listCustomers,
  listNotifications,
  listServices,
  listStaff,
  searchBookings,
  searchCustomers,
  searchServices,
  searchStaff,
} from './dashboardApi';
import { useAuth } from '../../hooks/useAuth';

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

export function useDashboardSettings() {
  const [preferences, setPreferences] = useState<DashboardPreferences>(() => loadPreferences());

  const setRefreshInterval = (refreshInterval: number) => {
    const next = { ...preferences, refreshInterval };
    setPreferences(next);
    persistPreferences(next);
  };

  const setLayout = (layout: DashboardPreferences['layout']) => {
    const next = { ...preferences, layout };
    setPreferences(next);
    persistPreferences(next);
  };

  return {
    preferences,
    refreshIntervalOptions: KPI_REFRESH_INTERVALS,
    setRefreshInterval,
    setLayout,
  };
}

export function useBusinessProfile() {
  const auth = useAuth();
  return useQuery<Business, Error>({
    queryKey: ['dashboard', 'business'],
    queryFn: () => getBusinessMe(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBookingLists(date: string, range?: { from: string; to: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const todayQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'today', date],
    queryFn: () => listBookings(auth.token, { date }),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  const rangeQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'range', range?.from, range?.to],
    queryFn: () => listBookings(auth.token, { date_from: range?.from, date_to: range?.to }),
    enabled: Boolean(auth.token) && Boolean(range),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  const upcomingQuery = useQuery<Booking[], Error>({
    queryKey: ['dashboard', 'bookings', 'upcoming', range?.from, range?.to],
    queryFn: () => listBookings(auth.token, { date_from: range?.from, date_to: range?.to }),
    enabled: Boolean(auth.token) && Boolean(range),
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

  const customers = useQuery<Customer[], Error>({
    queryKey: ['dashboard', 'customers'],
    queryFn: () => listCustomers(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });

  const staff = useQuery<StaffMember[], Error>({
    queryKey: ['dashboard', 'staff'],
    queryFn: () => listStaff(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });

  const services = useQuery<Service[], Error>({
    queryKey: ['dashboard', 'services'],
    queryFn: () => listServices(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });

  const notifications = useQuery<Notification[], Error>({
    queryKey: ['dashboard', 'notifications'],
    queryFn: () => listNotifications(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });

  const availability = useQuery<AvailabilitySlot[], Error>({
    queryKey: ['dashboard', 'availability', new Date().toISOString().slice(0, 10)],
    queryFn: () => getAvailability(auth.token, new Date().toISOString().slice(0, 10)),
    enabled: Boolean(auth.token),
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
  const queryClient = useQueryClient();

  return useQuery<{
    bookings: Booking[];
    customers: Customer[];
    staff: StaffMember[];
    services: Service[];
  }, Error>({
    queryKey: ['dashboard', 'search', term],
    queryFn: async () => {
      if (!term.trim()) {
        return {
          bookings: [] as Booking[],
          customers: [] as Customer[],
          staff: [] as StaffMember[],
          services: [] as Service[],
        };
      }
      const [bookings, customers, staff, services] = await Promise.all([
        searchBookings(auth.token, term),
        searchCustomers(auth.token, term),
        searchStaff(auth.token, term),
        searchServices(auth.token, term),
      ]);
      return { bookings, customers, staff, services };
    },
    enabled: Boolean(auth.token),
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
