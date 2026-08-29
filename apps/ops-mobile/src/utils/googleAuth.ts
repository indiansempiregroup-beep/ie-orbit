import { Platform } from 'react-native';
import { ResponseType } from 'expo-auth-session';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ApiClientError } from '@ie-orbit/sdk';

WebBrowser.maybeCompleteAuthSession();

export type GoogleIdTokenClaims = {
  email?: string;
  given_name?: string;
  family_name?: string;
};

const DISABLED_CLIENT_ID = '000000000000-disabled.apps.googleusercontent.com';

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (
    cb?: (notification: {
      isNotDisplayed: () => boolean;
      isSkippedMoment: () => boolean;
      isDismissedMoment: () => boolean;
    }) => void,
  ) => void;
  cancel: () => void;
};

function getGoogleIdApi(): GoogleIdApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
}

function loadGoogleIdentityServices(): Promise<GoogleIdApi> {
  const existing = getGoogleIdApi();
  if (existing) return Promise.resolve(existing);
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'));
  }
  return new Promise((resolve, reject) => {
    const scriptId = 'ie-orbit-google-gis';
    const onReady = () => {
      const api = getGoogleIdApi();
      if (api) resolve(api);
      else reject(new Error('Google sign-in failed to load. Refresh and try again.'));
    };
    const current = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (current) {
      current.addEventListener('load', onReady);
      current.addEventListener('error', () =>
        reject(new Error('Unable to load Google sign-in. Check your network and try again.')),
      );
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () =>
      reject(new Error('Unable to load Google sign-in. Check your network and try again.'));
    document.head.appendChild(script);
  });
}

async function promptGoogleIdTokenOnWeb(clientId: string): Promise<string | null> {
  const googleId = await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, token?: string | null) => {
      if (settled) return;
      settled = true;
      try {
        googleId.cancel();
      } catch {
        /* already dismissed */
      }
      if (error) reject(error);
      else resolve(token ?? null);
    };

    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) finish(null, response.credential);
        else finish(new Error('Google did not return a sign-in token. Please try again.'));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
    });

    googleId.prompt((notification) => {
      if (settled) return;
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        finish(new Error('GIS_UNAVAILABLE'));
      }
    });
  });
}

function googleOAuthExtra(): { clientId?: string; iosClientId?: string; androidClientId?: string } {
  return (
    (Constants.expoConfig?.extra as { googleOAuth?: { clientId?: string; iosClientId?: string; androidClientId?: string } } | undefined)
      ?.googleOAuth || {}
  );
}

export function getGoogleOAuthClientId(): string {
  const extra = googleOAuthExtra();
  return String(
    extra.clientId ||
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID ||
      '',
  ).trim();
}

export function getGoogleOAuthIosClientId(): string {
  const extra = googleOAuthExtra();
  return String(
    extra.iosClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_OPS_IOS_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_OPS_IOS_CLIENT_ID ||
      '',
  ).trim();
}

export function getGoogleOAuthAndroidClientId(): string {
  const extra = googleOAuthExtra();
  return String(
    extra.androidClientId ||
      process.env.EXPO_PUBLIC_GOOGLE_OAUTH_OPS_ANDROID_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_OPS_ANDROID_CLIENT_ID ||
      '',
  ).trim();
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(getGoogleOAuthClientId());
}

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === 'expo';
}

export function isGoogleAccountNotRegistered(error: unknown): boolean {
  return (
    error instanceof ApiClientError && error.payload.error.code === 'GOOGLE_ACCOUNT_NOT_REGISTERED'
  );
}

export function decodeGoogleIdToken(idToken: string): GoogleIdTokenClaims {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const data = JSON.parse(json) as GoogleIdTokenClaims;
    return {
      email: typeof data.email === 'string' ? data.email : undefined,
      given_name: typeof data.given_name === 'string' ? data.given_name : undefined,
      family_name: typeof data.family_name === 'string' ? data.family_name : undefined,
    };
  } catch {
    return {};
  }
}

function googleRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  const scheme = String(Constants.expoConfig?.scheme || '')
    .split(',')[0]
    .trim();
  return AuthSession.makeRedirectUri({
    native: scheme ? `${scheme}:/oauthredirect` : undefined,
  });
}

export function useGoogleIdTokenAuth() {
  const clientId = getGoogleOAuthClientId();
  const iosClientId = getGoogleOAuthIosClientId();
  const androidClientId = getGoogleOAuthAndroidClientId();
  const configured = Boolean(clientId);
  const expoGo = isExpoGoRuntime();
  const redirectUri = googleRedirectUri();
  const [, , promptAsync] = Google.useAuthRequest({
    clientId: clientId || DISABLED_CLIENT_ID,
    iosClientId: iosClientId || undefined,
    androidClientId: androidClientId || undefined,
    webClientId: clientId || undefined,
    responseType: ResponseType.IdToken,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
  });

  async function promptForIdToken(): Promise<string | null> {
    if (!configured) {
      throw new Error('Google sign-in is not configured for this build.');
    }
    if (expoGo) {
      throw new Error(
        'Google sign-in does not work in Expo Go. In the Expo terminal press w, then continue with Google in the browser at http://localhost:8082.',
      );
    }
    if (Platform.OS === 'web') {
      try {
        return await promptGoogleIdTokenOnWeb(clientId);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'GIS_UNAVAILABLE') {
          throw error;
        }
      }
    }
    const result = await promptAsync();
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return null;
    }
    if (result.type !== 'success') {
      throw new Error('Google sign-in was interrupted. Please try again.');
    }
    const idToken = result.params.id_token || result.authentication?.idToken || '';
    if (!idToken) {
      throw new Error('Google did not return a sign-in token. Please try again.');
    }
    return idToken;
  }

  return { configured, promptForIdToken };
}
