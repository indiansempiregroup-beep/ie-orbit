import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PATH = '/api/v1';
const DEFAULT_API_PORT = '8000';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(?:https?|exp):\/\/([^/:]+)/i);
  return match?.[1] ?? null;
}

/**
 * Host of the Metro / Expo packager. On a physical phone this is the computer's
 * LAN IP the device already used to load the JS bundle — the most reliable API host.
 */
export function getDevHostFromBundler(): string | null {
  if (Platform.OS === 'web') return null;

  const scriptURL = NativeModules.SourceCode?.getConstants?.()?.scriptURL as string | undefined;
  const fromScript = hostFromUrl(scriptURL);
  if (fromScript && fromScript !== 'localhost' && fromScript !== '127.0.0.1') {
    return fromScript;
  }

  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;
  if (typeof debuggerHost === 'string' && debuggerHost.length > 0) {
    const host = debuggerHost.split(':')[0]?.trim();
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  }

  return fromScript;
}

export function getApiBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://localhost:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;

  try {
    const url = new URL(configured);
    const port = url.port || DEFAULT_API_PORT;
    const path = url.pathname || DEFAULT_API_PATH;

    // On device / simulator via Expo Go: always prefer the packager host so a
    // stale EXPO_PUBLIC_API_BASE_URL LAN IP cannot strand list screens loading.
    if (Platform.OS !== 'web') {
      const devHost = getDevHostFromBundler();
      if (devHost) {
        return normalizeBaseUrl(`http://${devHost}:${port}${path}`);
      }
    }

    return normalizeBaseUrl(configured);
  } catch {
    return normalizeBaseUrl(configured);
  }
}
