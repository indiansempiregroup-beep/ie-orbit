import { useCallback, useEffect, useState } from 'react';
import type { MobileNotificationItem } from '@ie-platform/sdk';
import { mobileClient } from '../api/client';
import { useBusinessContext } from '../contexts/BootstrapContext';

export function useMobileNotifications() {
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
      setNotifications(response.data);
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

  const markAllRead = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    await mobileClient.mobile.readAllNotifications({
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    await reload();
  }, [tenantSlug, businessCode, reload]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!tenantSlug || !businessCode) return;
      await mobileClient.mobile.markNotificationRead(notificationId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      await reload();
    },
    [tenantSlug, businessCode, reload],
  );

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return { notifications, loading, error, reload, markAllRead, markRead, unreadCount };
}
