import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ApiClientError } from '@ie-orbit/sdk';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { googleSignInConfigured } = require('./googleAuthRequest.cjs') as {
  googleSignInConfigured: (input?: {
    platform?: string;
    androidClientId?: string;
    webClientId?: string;
  }) => boolean;
};

WebBrowser.maybeCompleteAuthSession();

export type GoogleIdTokenClaims = {
  email?: string;
  given_name?: string;
  family_name?: string;
};

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
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

function currentGoogleOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function googleOriginAllowlistHint(origin = currentGoogleOrigin()): string {
  const host = origin.replace(/^https?:\/\//, '');
  const withPort = origin;
  const withoutPort = origin.replace(/:\d+$/, '');
  const lines = [withPort];
  if (withoutPort !== withPort) lines.push(withoutPort);
  if (host.startsWith('localhost')) {
    lines.push(origin.replace('localhost', '127.0.0.1'));
  } else if (host.startsWith('127.0.0.1')) {
    lines.push(origin.replace('127.0.0.1', 'localhost'));
  }
  return `Add these exact values (no trailing slash) as Authorized JavaScript origins AND Authorized redirect URIs on the existing Web client: ${[...new Set(lines)].join(', ')}.`;
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

    // Do not set ux_mode: 'popup' or use_fedcm_for_prompt. Those open a full
    // OAuth window whose redirect_uri is this page origin. If that origin is
    // missing on the Web client, Google shows "Access blocked".
    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) finish(null, response.credential);
        else finish(new Error('Google did not return a sign-in token. Please try again.'));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
    });

    googleId.prompt((notification) => {
      if (settled) return;
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        finish(
          new Error(
            `Google sign-in was blocked for ${currentGoogleOrigin()}. ${googleOriginAllowlistHint()}`,
          ),
        );
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
  return googleSignInConfigured({
    platform: Platform.OS,
    androidClientId: getGoogleOAuthAndroidClientId(),
    webClientId: getGoogleOAuthClientId(),
  });
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

async function promptNativeGoogleIdToken(webClientId: string): Promise<string | null> {
  // Lazy so Expo Go can boot without the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    GoogleSignin,
    isErrorWithCode,
    isSuccessResponse,
    statusCodes,
  } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    scopes: ['openid', 'profile', 'email'],
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return null;
    }
    const idToken = response.data.idToken || '';
    if (!idToken) {
      throw new Error('Google did not return a sign-in token. Please try again.');
    }
    return idToken;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }
    const code = isErrorWithCode(error) ? String(error.code) : '';
    if (code === '10' || /DEVELOPER_ERROR/i.test(error instanceof Error ? error.message : '')) {
      throw new Error(
        'Google sign-in is misconfigured for this Android build. Add package com.ieorbit.ops and the EAS keystore SHA-1 to the ops Android OAuth client (373269001775-uaeuvfkv...).',
      );
    }
    throw error;
  }
}

export function useGoogleIdTokenAuth() {
  const clientId = getGoogleOAuthClientId();
  const configured = isGoogleSignInConfigured();
  const expoGo = isExpoGoRuntime();

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
      return await promptGoogleIdTokenOnWeb(clientId);
    }
    return await promptNativeGoogleIdToken(clientId);
  }

  return { configured, promptForIdToken };
}
