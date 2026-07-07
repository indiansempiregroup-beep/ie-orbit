import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  confirmBooking,
  getBooking,
  rescheduleBooking,
  type BookingCreateInput,
} from './bookingsApi';

export function useBookingDetail(bookingId: string | undefined) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();

  return useQuery<Booking, Error>({
    queryKey: ['bookings', 'detail', bookingId ?? 'none', ...scopeKey],
    queryFn: () => {
      if (!bookingId) {
        throw new Error('Booking id is required.');
      }
      return getBooking(client, bookingId);
    },
    enabled: workspaceReady && Boolean(bookingId),
    staleTime: 1000 * 30,
  });
}

export function useBookingActions(bookingId: string | undefined) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = () => {
    invalidateWorkspaceData(queryClient);
    if (bookingId) {
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'detail', bookingId] });
    }
  };

  const confirm = useMutation({
    mutationFn: (reason?: string) => {
      if (!bookingId) throw new Error('Booking id is required.');
      return confirmBooking(client, bookingId, reason);
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (reason?: string) => {
      if (!bookingId) throw new Error('Booking id is required.');
      return cancelBooking(client, bookingId, reason);
    },
    onSuccess: invalidate,
  });

  const checkIn = useMutation({
    mutationFn: (reason?: string) => {
      if (!bookingId) throw new Error('Booking id is required.');
      return checkInBooking(client, bookingId, reason);
    },
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: (reason?: string) => {
      if (!bookingId) throw new Error('Booking id is required.');
      return completeBooking(client, bookingId, reason);
    },
    onSuccess: invalidate,
  });

  const reschedule = useMutation({
    mutationFn: (input: { start_at: string; reason?: string }) => {
      if (!bookingId) throw new Error('Booking id is required.');
      return rescheduleBooking(client, bookingId, input);
    },
    onSuccess: invalidate,
  });

  return { confirm, cancel, checkIn, complete, reschedule };
}

export type { BookingCreateInput };
