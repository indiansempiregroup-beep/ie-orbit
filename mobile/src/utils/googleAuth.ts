import { Platform } from 'react-native';
import Constants from 'expo-constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { googleSignInConfigured } = require('./googleAuthRequest.cjs') as {
  googleSignInConfigured: (input?: {
    platform?: string;
    androidClientId?: string;
    webClientId?: string;
  }) => boolean;
};

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

function googleOAuthExtra(): { clientId?: string; androidClientId?: string } {
  return (
    (Constants.expoConfig?.extra as { googleOAuth?: { clientId?: string; androidClientId?: string } } | undefined)
      ?.googleOAuth || {}
  );
}

export function getGoogleOAuthClientId(): string {
  const extra = googleOAuthExtra();
  return String(extra.clientId || process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '').trim();
}

export function getGoogleOAuthAndroidClientId(): string {
  const extra = googleOAuthExtra();
  return String(
    extra.androidClientId || process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID || '',
  ).trim();
}

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === 'expo';
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
  // Native Android sign-in needs the Web OAuth client ID here (not the Android client ID).
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
        'Google sign-in is misconfigured for this Android build. Add this app’s package name and EAS keystore SHA-1 to the customer Android OAuth client.',
      );
    }
    throw error;
  }
}

export function useGoogleIdTokenAuth() {
  const webClientId = getGoogleOAuthClientId();
  const androidClientId = getGoogleOAuthAndroidClientId();
  const configured = googleSignInConfigured({
    platform: Platform.OS,
    androidClientId,
    webClientId,
  });
  const expoGo = isExpoGoRuntime();

  async function promptForIdToken(): Promise<string | null> {
    if (!configured) {
      throw new Error('Google sign-in is not configured for this build.');
    }
    if (expoGo) {
      throw new Error(
        'Google sign-in does not work in Expo Go. Use a customer APK or development build.',
      );
    }
    if (Platform.OS === 'web') {
      try {
        return await promptGoogleIdTokenOnWeb(webClientId);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'GIS_UNAVAILABLE') {
          throw error;
        }
        throw new Error('Google sign-in is unavailable in this browser. Please try again.');
      }
    }
    return await promptNativeGoogleIdToken(webClientId);
  }

  return { configured, promptForIdToken };
}
