import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PATH = '/api/v1';
const DEFAULT_API_PORT = '8000';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function getDevHostFromBundler(): string | null {
  if (Platform.OS === 'web') return null;

  const scriptURL = NativeModules.SourceCode?.getConstants?.()?.scriptURL as string | undefined;
  if (!scriptURL) return null;

  const match = scriptURL.match(/^https?:\/\/([^/:]+)/);
  return match?.[1] ?? null;
}

/** Resolve API base URL; map localhost to the Metro dev host on physical devices. */
export function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://localhost:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;

  try {
    const url = new URL(configured);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!isLocalhost) {
      return normalizeBaseUrl(configured);
    }

    const devHost = getDevHostFromBundler();
    if (devHost) {
      const port = url.port || DEFAULT_API_PORT;
      const path = url.pathname || DEFAULT_API_PATH;
      return normalizeBaseUrl(`http://${devHost}:${port}${path}`);
    }
  } catch {
    // fall through to configured value
  }

  return normalizeBaseUrl(configured);
}

/** Resolve API base URL; map localhost to the Metro dev host on physical devices. */
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

export const apiBaseUrl = getApiBaseUrl();
