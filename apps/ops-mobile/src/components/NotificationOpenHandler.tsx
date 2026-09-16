import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  capturedWebRecordUrl,
  navigateFromNotificationData,
  parseRecordUrl,
} from '../navigation/recordLinks';
import { rootNavigationRef } from '../navigation/rootNavigationRef';
import { hasOpsAccess, isPlatformAdminOnly } from '../utils/roles';

function notificationKey(data: Record<string, unknown>) {
  return [
    data.notification_id,
    data.session_id,
    data.subscription_id,
    data.event_type,
    data.order_id,
    data.booking_id,
    data.pet_id,
    data.return_id,
    data.ticket_id,
  ]
    .map((value) => String(value || ''))
    .join(':');
}

export function NotificationOpenHandler() {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const handledRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const [pendingVersion, setPendingVersion] = useState(0);
  const platformAdminOnly = isPlatformAdminOnly(user);
  const ready = Boolean(user) && (platformAdminOnly || (hasOpsAccess(user) && workspace.ready));

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (cancelled || !pendingRef.current) return;
      if (!rootNavigationRef.isReady()) {
        timer = setTimeout(flush, 80);
        return;
      }
      const data = pendingRef.current;
      pendingRef.current = null;
      const key = notificationKey(data);
      if (handledRef.current.has(key)) return;
      if (navigateFromNotificationData(data, { platformAdminOnly })) {
        handledRef.current.add(key);
      }
    };
    flush();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, platformAdminOnly, pendingVersion]);

  useEffect(() => {
    const applyData = (data: Record<string, unknown>) => {
      const key = notificationKey(data);
      if (handledRef.current.has(key)) return;
      if (!ready || !rootNavigationRef.isReady()) {
        pendingRef.current = data;
        setPendingVersion((value) => value + 1);
        return;
      }
      if (navigateFromNotificationData(data, { platformAdminOnly })) {
        handledRef.current.add(key);
      }
    };

    const applyUrl = (url: string | null) => {
      if (!url) return;
      const parsed = parseRecordUrl(url);
      if (parsed) applyData(parsed);
    };

    applyUrl(capturedWebRecordUrl());
    void Linking.getInitialURL().then(applyUrl);
    const linking = Linking.addEventListener('url', ({ url }) => applyUrl(url));

    const handlePush = (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
      applyData(data);
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handlePush(response);
    });
    const push = Notifications.addNotificationResponseReceivedListener(handlePush);

    return () => {
      linking.remove();
      push.remove();
    };
  }, [ready, platformAdminOnly]);

  return null;
}
