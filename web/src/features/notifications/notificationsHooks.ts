import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type Notification,
} from '../dashboard/dashboardApi';
import { useAuth } from '../../hooks/useAuth';

export function useNotificationList() {
  const auth = useAuth();
  const { tenantId, businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<Notification[], Error>({
    queryKey: ['notifications', 'list', ...scopeKey],
    queryFn: () => listNotifications(auth.token, tenantId, businessId),
    enabled: Boolean(auth.token) && workspaceReady,
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationAsRead() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<Notification, Error, string>({
    mutationFn: async (notificationId) => {
      const response = await client.notifications.markRead(notificationId);
      return response.data;
    },
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}

export function useMarkAllNotificationsAsRead() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<{ read: boolean }, Error, void>({
    mutationFn: async () => {
      const response = await client.notifications.readAll();
      return response.data;
    },
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}
