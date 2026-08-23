import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { mobileClient } from '../api/client';
import { mobileRuntime } from '../config/flavors';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessContext } from '../contexts/BootstrapContext';

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
    shouldPlaySound: false,
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
  const { tenantSlug, businessCode } = useBusinessContext();
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !user || !token || !tenantSlug || !businessCode) return;
    const prefs = (user.notification_preferences ?? {}) as Record<string, boolean>;
    if (prefs.push === false) return;

    let cancelled = false;
    void (async () => {
      try {
        const expoToken = await getExpoPushToken();
        if (!expoToken || cancelled || registeredToken.current === expoToken) return;
        await mobileClient.mobile.registerDevice({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          expo_push_token: expoToken,
          platform: Platform.OS,
          app_flavor: mobileRuntime.flavorKey,
        });
        registeredToken.current = expoToken;
      } catch {
        // Push registration is best-effort in Expo Go / simulators.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, user, token, tenantSlug, businessCode]);
}
