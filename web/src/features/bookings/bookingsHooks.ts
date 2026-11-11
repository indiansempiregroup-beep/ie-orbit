import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PagedResult } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  createBooking,
  getAvailability,
  listAllBookings,
  listBookingsPage,
  confirmBooking,
  cancelBooking,
  type AvailabilitySlot,
  type Booking,
  type BookingCreateInput,
} from './bookingsApi';

export type BookingListOptions = {
  /** Exact appointment date (YYYY-MM-DD). */
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  /** Server search on booking number (`booking_id`). */
  q?: string;
  staffId?: string;
  customerId?: string;
  serviceId?: string;
  pageSize?: number;
  cursor?: string | null;
  /** Fetch every cursor page for a bounded filter (calendar day). Requires date/range. */
  all?: boolean;
  enabled?: boolean;
};

export function useBookingList(options?: BookingListOptions) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  const pageSize = options?.pageSize ?? 25;
  const cursor = options?.cursor || undefined;
  const q = options?.q?.trim() || undefined;
  const filters = {
    date: options?.date || undefined,
    date_from: options?.dateFrom || undefined,
    date_to: options?.dateTo || undefined,
    status: options?.status || undefined,
    booking_id: q,
    staff: options?.staffId || undefined,
    customer: options?.customerId || undefined,
    service: options?.serviceId || undefined,
  };
  const fetchAll = Boolean(options?.all);
  return useQuery<PagedResult<Booking>, Error>({
    queryKey: [
      'bookings',
      'list',
      ...scopeKey,
      JSON.stringify(filters),
      fetchAll ? 'all' : pageSize,
      fetchAll ? 'all' : cursor || '',
    ],
    queryFn: () =>
      fetchAll
        ? listAllBookings(client, businessId, filters)
        : listBookingsPage(client, businessId, { ...filters, cursor }, pageSize),
    enabled: workspaceReady && options?.enabled !== false,
    staleTime: 1000 * 60,
  });
}

export function useBookingCreation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Booking, Error, BookingCreateInput>({
    mutationFn: (booking) => createBooking(client, booking),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useConfirmBooking() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Booking, Error, string>({
    mutationFn: (bookingId) => confirmBooking(client, bookingId),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useCancelBooking() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<Booking, Error, string>({
    mutationFn: (bookingId) => cancelBooking(client, bookingId),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useAvailability(
  date: string,
  staffId?: string,
  durationMinutes?: number,
  serviceId?: string,
  serviceIds?: string[],
) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  const multiService = Boolean(serviceIds && serviceIds.length > 1);
  return useQuery<AvailabilitySlot[], Error>({
    queryKey: ['bookings', 'availability', date, staffId, durationMinutes, serviceId, serviceIds, ...scopeKey],
    queryFn: () =>
      getAvailability(client, businessId, {
        date,
        staff_id: staffId,
        service_id: multiService ? undefined : serviceId,
        service_ids: multiService ? serviceIds : undefined,
        duration_minutes: multiService ? undefined : durationMinutes,
        interval_minutes: 30,
      }),
    enabled: workspaceReady && Boolean(date),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
}

export function useAvailabilitySummary(date: string) {
  const availability = useAvailability(date);
  return useMemo(() => {
    const slots = availability.data ?? [];
    return {
      totalSlots: slots.length,
      totalCapacity: slots.reduce((sum, slot) => sum + slot.capacity, 0),
      firstSlot: slots[0],
    };
  }, [availability.data]);
}

export type { Booking, AvailabilitySlot, BookingCreateInput };
