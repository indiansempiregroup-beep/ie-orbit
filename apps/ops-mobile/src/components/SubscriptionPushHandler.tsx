import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { navigateRoot, rootNavigationRef } from '../navigation/rootNavigationRef';
import { isPlatformAdminOnly } from '../utils/roles';

function notificationKey(data: Record<string, unknown>) {
  return [data.notification_id, data.session_id, data.subscription_id, data.event_type]
    .map((value) => String(value || ''))
    .join(':');
}

function openFromPush(data: Record<string, unknown>, platformAdminOnly: boolean) {
  if (!rootNavigationRef.isReady()) return false;
  const screen = String(data.screen || '').trim();
  const eventType = String(data.event_type || '').trim();
  const tenantId = String(data.tenant_id || '').trim();
  const billingEvent = eventType.startsWith('billing.');
  if (!billingEvent && screen !== 'ProductSettings' && screen !== 'PlatformAdminTenantDetail') {
    return false;
  }

  if (platformAdminOnly) {
    if (tenantId) {
      navigateRoot('PlatformAdminTenantDetail', { tenantId });
      return true;
    }
    navigateRoot('PlatformAdmin');
    return true;
  }
  navigateRoot('ProductSettings');
  return true;
}

export function SubscriptionPushHandler() {
  const { user } = useAuth();
  const handledRef = useRef<Set<string>>(new Set());
  const platformAdminOnly = isPlatformAdminOnly(user);

  useEffect(() => {
    const handle = (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
      const key = notificationKey(data);
      if (handledRef.current.has(key)) return;
      if (openFromPush(data, platformAdminOnly)) {
        handledRef.current.add(key);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [platformAdminOnly]);

  return null;
}
