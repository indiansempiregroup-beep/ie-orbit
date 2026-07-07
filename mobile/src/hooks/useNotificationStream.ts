import { useEffect, useRef } from 'react';
import { subscribeToNotificationStream } from '@ie-platform/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { useBusinessContext } from '../contexts/BootstrapContext';
import { useAuth } from '../contexts/AuthContext';

type UseNotificationStreamOptions = {
  enabled?: boolean;
  onNotification?: () => void;
};

export function useNotificationStream({ enabled = true, onNotification }: UseNotificationStreamOptions = {}) {
  const { token, user } = useAuth();
  const { tenantSlug, businessCode } = useBusinessContext();
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!enabled || !token || !user?.email_verified_at || !tenantSlug || !businessCode) {
      return undefined;
    }

    const url = new URL('mobile/notifications/stream', `${getApiBaseUrl().replace(/\/$/, '')}/`);
    url.searchParams.set('tenant_slug', tenantSlug);
    url.searchParams.set('business_code', businessCode);

    const subscription = subscribeToNotificationStream({
      url: url.toString(),
      headers: {
        Authorization: `Bearer ${token}`,
      },
      onEvent: (event) => {
        if (event.type === 'notification.created') {
          const audience = event.data?.audience;
          if (audience && audience !== 'customer') {
            return;
          }
          onNotificationRef.current?.();
        }
      },
    });

    return () => subscription.close();
  }, [businessCode, enabled, tenantSlug, token, user?.email_verified_at]);
}
