import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Notification } from '@ie-orbit/sdk';
import { subscribeToNotificationStream } from '@ie-orbit/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { useOpsClient } from '../hooks/useOpsClient';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';

type NotificationsContextValue = {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  reload: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
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
      const seen = new Set<string>();
      setNotifications(
        (response.data ?? []).filter((item) => {
          if (item.channel && item.channel !== 'in_app') return false;
          const key = [
            item.notification_type || '',
            item.booking_id || '',
            item.pet_id || '',
            item.subject || '',
            item.id,
          ].join(':');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      );
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

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!client) return;
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)),
      );
      try {
        await client.notifications.markRead(notificationId);
      } catch {
        await reload();
      }
    },
    [client, reload],
  );

  const markAllRead = useCallback(async () => {
    if (!client) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    try {
      await client.notifications.readAll();
    } catch {
      await reload();
    }
  }, [client, reload]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  const value = useMemo(
    () => ({
      notifications,
      loading,
      unreadCount,
      reload,
      markRead,
      markAllRead,
    }),
    [notifications, loading, unreadCount, reload, markRead, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
