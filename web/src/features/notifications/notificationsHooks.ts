import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
} from '../dashboard/dashboardApi';

export function useNotificationList() {
  const auth = useAuth();
  return useQuery<Notification[], Error>({
    queryKey: ['notifications', 'list'],
    queryFn: () => listNotifications(auth.token),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationAsRead() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  return useMutation<Notification, Error, string>({
    mutationFn: (notificationId) => markNotificationAsRead(auth.token, notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  return useMutation<{ read: boolean }, Error, void>({
    mutationFn: () => markAllNotificationsAsRead(auth.token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'notifications'] });
    },
  });
}
