import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { createScopedClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

function resolveEasProjectId(): string {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim();
  }
  return (process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '').trim();
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = resolveEasProjectId();
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data || null;
}

export function usePushRegistration(enabled: boolean) {
  const { user, token } = useAuth();
  const { ready, tenants, tenantId, activeBusiness } = useWorkspace();
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !ready || !user || !token || !tenantId || !activeBusiness?.business_code) return;
    const prefs = (user.notification_preferences ?? {}) as Record<string, boolean>;
    if (prefs.push === false) return;

    const tenant = tenants.find((item) => item.id === tenantId);
    const tenantSlug = tenant?.slug;
    if (!tenantSlug) return;

    let cancelled = false;
    void (async () => {
      try {
        const expoToken = await getExpoPushToken();
        if (!expoToken || cancelled || registeredToken.current === expoToken) return;
        const client = createScopedClient(token, tenantId, activeBusiness.id);
        await client.mobile.registerDevice({
          tenant_slug: tenantSlug,
          business_code: activeBusiness.business_code!,
          expo_push_token: expoToken,
          platform: Platform.OS,
          app_flavor: 'ops-mobile',
        });
        registeredToken.current = expoToken;
      } catch {
        // Best-effort in Expo Go / simulators.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, ready, user, token, tenantId, tenants, activeBusiness]);
}
