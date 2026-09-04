import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MobileNotificationItem } from '@ie-orbit/sdk';
import { mobileClient } from '../api/client';
import { useBusinessContext } from './BootstrapContext';
import { useNotificationStream } from '../hooks/useNotificationStream';

type NotificationsContextValue = {
  notifications: MobileNotificationItem[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  reload: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function dedupeInAppNotifications(items: MobileNotificationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.channel && item.channel !== 'in_app') return false;
    const key = [
      item.notification_type || '',
      item.order_id || '',
      item.booking_id || '',
      item.return_id || '',
      item.pet_id || '',
      item.subject || '',
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { tenantSlug, businessCode } = useBusinessContext();
  const [notifications, setNotifications] = useState<MobileNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!tenantSlug || !businessCode) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.listNotifications({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setNotifications(dedupeInAppNotifications(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useNotificationStream({ onNotification: reload });

  const markAllRead = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    try {
      await mobileClient.mobile.readAllNotifications({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
    } catch {
      await reload();
    }
  }, [tenantSlug, businessCode, reload]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!tenantSlug || !businessCode) return;
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)),
      );
      try {
        await mobileClient.mobile.markNotificationRead(notificationId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
      } catch {
        await reload();
      }
    },
    [tenantSlug, businessCode, reload],
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications],
  );

  const value = useMemo(
    () => ({
      notifications,
      loading,
      error,
      unreadCount,
      reload,
      markAllRead,
      markRead,
    }),
    [notifications, loading, error, unreadCount, reload, markAllRead, markRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useMobileNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useMobileNotifications must be used within NotificationsProvider');
  return ctx;
}
