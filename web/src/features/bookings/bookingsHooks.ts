import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  createBooking,
  getAvailability,
  listBookings,
  type AvailabilitySlot,
  type Booking,
  type BookingCreateInput,
} from './bookingsApi';

export function useBookingList(date?: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Booking[], Error>({
    queryKey: ['bookings', 'list', date ?? 'all', ...scopeKey],
    queryFn: () => listBookings(client, businessId, date ? { date } : undefined),
    enabled: workspaceReady,
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

export function useAvailability(date: string, staffId?: string, durationMinutes?: number) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<AvailabilitySlot[], Error>({
    queryKey: ['bookings', 'availability', date, staffId, durationMinutes, ...scopeKey],
    queryFn: () =>
      getAvailability(client, businessId, {
        date,
        staff_id: staffId,
        duration_minutes: durationMinutes,
        interval_minutes: 30,
        buffer_minutes: 0,
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
