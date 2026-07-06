import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { createBooking, getAvailability, listBookings, type AvailabilitySlot, type Booking, type BookingCreateInput } from './bookingsApi';

export function useBookingList(date?: string) {
  const auth = useAuth();
  return useQuery<Booking[], Error>({
    queryKey: ['bookings', 'list', date],
    queryFn: () => listBookings(auth.token, date ? { date } : undefined),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60,
  });
}

export function useBookingCreation() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Booking, Error, BookingCreateInput>({
    mutationFn: (booking) => createBooking(auth.token, booking),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'bookings'] });
    },
  });
}

export function useAvailability(date: string, staffId?: string, durationMinutes?: number) {
  const auth = useAuth();
  const queryKey = ['bookings', 'availability', date, staffId, durationMinutes];
  return useQuery<AvailabilitySlot[], Error>({
    queryKey,
    queryFn: () =>
      getAvailability(auth.token, {
        date,
        staff_id: staffId,
        duration_minutes: durationMinutes,
        interval_minutes: 30,
        buffer_minutes: 0,
      }),
    enabled: Boolean(auth.token) && Boolean(date),
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
