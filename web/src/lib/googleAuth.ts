import { ApiClientError } from '@ie-orbit/sdk';

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
    }) => void,
  ) => void;
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
};

let initializedForClientId: string | null = null;
let credentialHandler: ((idToken: string) => void) | null = null;

function getGoogleIdApi(): GoogleIdApi | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
}

export function getGoogleOAuthClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(getGoogleOAuthClientId());
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
  return `Add these exact values (no trailing slash) as Authorized JavaScript origins AND Authorized redirect URIs on the existing Web client: ${[...new Set(lines)].join(', ')}.`;
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
    const data = JSON.parse(window.atob(padded)) as GoogleIdTokenClaims;
    return {
      email: typeof data.email === 'string' ? data.email : undefined,
      given_name: typeof data.given_name === 'string' ? data.given_name : undefined,
      family_name: typeof data.family_name === 'string' ? data.family_name : undefined,
    };
  } catch {
    return {};
  }
}

function loadGoogleIdentityServices(): Promise<GoogleIdApi> {
  const existing = getGoogleIdApi();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const scriptId = 'ie-orbit-google-gis';
    const onReady = () => {
      const api = getGoogleIdApi();
      if (api) resolve(api);
      else reject(new Error('Google sign-in failed to load. Refresh and try again.'));
    };
    const current = document.getElementById(scriptId);
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

async function ensureGoogleIdInitialized(): Promise<GoogleIdApi> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw new Error('Google sign-in is not configured for this site.');
  }
  const googleId = await loadGoogleIdentityServices();
  if (initializedForClientId === clientId) return googleId;

  // Do not set ux_mode: 'popup' or use_fedcm_for_prompt. Those open a full
  // OAuth window whose redirect_uri is this page origin. If that origin is
  // missing on the Web client, Google shows "Access blocked".
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
    shape: 'rectangular',
    logo_alignment: 'left',
    width,
  });
}

export async function promptGoogleIdToken(): Promise<string | null> {
  const googleId = await ensureGoogleIdInitialized();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, token?: string | null) => {
      if (settled) return;
      settled = true;
      credentialHandler = null;
      try {
        googleId.cancel();
      } catch {
        /* already dismissed */
      }
      if (error) reject(error);
      else resolve(token ?? null);
    };

    credentialHandler = (idToken) => finish(null, idToken);
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
