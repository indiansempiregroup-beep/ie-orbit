import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToNotificationStream } from '@ie-platform/sdk';
import { useAuth } from './useAuth';
import { useWorkspaceScope } from './useWorkspaceScope';
import { invalidateWorkspaceData } from '../lib/workspace';

export function useNotificationStream() {
  const auth = useAuth();
  const { tenantId, businessId, workspaceReady } = useWorkspaceScope();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auth.token || !workspaceReady) {
      return undefined;
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${auth.token}`,
    };
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }
    if (businessId) {
      headers['X-Business-ID'] = businessId;
    }

    const subscription = subscribeToNotificationStream({
      url: '/api/v1/notifications/stream',
      headers,
      onEvent: (event) => {
        if (event.type !== 'notification.created' && event.type !== 'connected') {
          return;
        }
        if (event.type === 'connected') {
          return;
        }
        const audience = event.data?.audience;
        if (audience && audience !== 'admin') {
          return;
        }
        invalidateWorkspaceData(queryClient);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'notifications'] });
      },
    });

    return () => subscription.close();
  }, [auth.token, businessId, queryClient, tenantId, workspaceReady]);
}
