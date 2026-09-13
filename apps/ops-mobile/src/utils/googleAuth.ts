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
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ) => void;
  cancel: () => void;
  disableAutoSelect?: () => void;
  revoke?: (hint: string, callback: () => void) => void;
};

let initializedForClientId: string | null = null;
let credentialHandler: ((idToken: string) => void) | null = null;

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
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onload = onReady;
    script.onerror = () =>
      reject(new Error('Unable to load Google sign-in. Check your network and try again.'));
    document.head.appendChild(script);
  });
}

export function currentGoogleOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export function googleOriginAllowlistHint(origin = currentGoogleOrigin()): string {
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
  return `Add these exact values (no trailing slash) as Authorized JavaScript origins on the existing Web client: ${[...new Set(lines)].join(', ')}.`;
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

async function ensureGoogleIdInitialized(): Promise<GoogleIdApi> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw new Error('Google sign-in is not configured for this build.');
  }
  const googleId = await loadGoogleIdentityServices();
  if (initializedForClientId === clientId) return googleId;

  // Do not set ux_mode: 'popup' — that starts a full OAuth redirect and needs
  // Authorized redirect URIs. The button callback returns an ID token in-page.
  googleId.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response.credential) credentialHandler?.(response.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
  });
  initializedForClientId = clientId;
  return googleId;
}

export async function suppressGoogleAutoSignIn(hint?: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    initializedForClientId = null;
    credentialHandler = null;
    if (!getGoogleOAuthClientId()) return;
    try {
      const googleId = await ensureGoogleIdInitialized();
      try {
        googleId.cancel();
      } catch {
        /* already dismissed */
      }
      googleId.disableAutoSelect?.();
      const email = hint?.trim();
      if (email && googleId.revoke) {
        try {
          googleId.revoke(email, () => {});
        } catch {
          // ignore
        }
      }
    } catch {
      // GIS may be blocked or unconfigured
    }
    return;
  }
  if (isExpoGoRuntime()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // native Google session may not exist
  }
}

export async function mountGoogleSignInButton(
  parent: HTMLElement,
  onIdToken: (idToken: string) => void,
): Promise<void> {
  credentialHandler = onIdToken;
  const googleId = await ensureGoogleIdInitialized();
  parent.replaceChildren();
  const width = Math.min(400, Math.max(240, Math.floor(parent.clientWidth || 320)));
  googleId.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'left',
    width,
  });
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
      throw new Error(
        'Google sign-in on web uses the Google button on this page. Refresh if you do not see it.',
      );
    }
    return await promptNativeGoogleIdToken(clientId);
  }

  return { configured, promptForIdToken, ready: true };
}
