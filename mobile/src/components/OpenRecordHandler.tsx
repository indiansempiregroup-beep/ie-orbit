import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { navigateFromNotificationData, navigationRef } from './NotificationNavigationHandler';
import { parseOpenRecordUrl } from '../utils/openRecordLinks';

function recordKey(data: Record<string, unknown>) {
  return [data.order_id, data.return_id, data.booking_id, data.pet_id].map((value) => String(value || '')).join(':');
}

export function OpenRecordHandler() {
  const { user } = useAuth();
  const { loading } = useBootstrap();
  const handledRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Record<string, unknown> | null>(null);
  const [pendingVersion, setPendingVersion] = useState(0);

  useEffect(() => {
    if (!user || loading) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (cancelled || !pendingRef.current) return;
      if (!navigationRef.isReady()) {
        timer = setTimeout(flush, 80);
        return;
      }
      const data = pendingRef.current;
      pendingRef.current = null;
      const key = recordKey(data);
      if (handledRef.current.has(key)) return;
      if (navigateFromNotificationData(data)) {
        handledRef.current.add(key);
      }
    };
    flush();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, loading, pendingVersion]);

  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url) return;
      const data = parseOpenRecordUrl(url);
      if (!data) return;
      const key = recordKey(data);
      if (handledRef.current.has(key)) return;
      if (!user || loading || !navigationRef.isReady()) {
        pendingRef.current = data;
        setPendingVersion((value) => value + 1);
        return;
      }
      if (navigateFromNotificationData(data)) {
        handledRef.current.add(key);
      }
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', ({ url }) => apply(url));
    return () => subscription.remove();
  }, [user, loading]);

  return null;
}
