import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { LoginResponse, UserProfile } from '@ie-orbit/sdk';
import { mobileClient } from '../api/client';
import {
  authenticateForBiometricLogin,
  disableBiometricLogin as clearBiometricLogin,
  enableBiometricLogin as enrollBiometricLogin,
  getBiometricCapability,
  getStoredBiometricSession,
  isBiometricLoginEnabled,
  storeBiometricSession,
} from '../utils/biometrics';
import { getSecureItem, setSecureItem } from '../utils/persistentStore';

const ACCESS_KEY = 'ie.mobile.access';
const REFRESH_KEY = 'ie.mobile.refresh';
const LEGACY_ACCESS_KEY = 'ie:mobile:access';
const LEGACY_REFRESH_KEY = 'ie:mobile:refresh';
/** Match backend SIMPLE_JWT ACCESS_TOKEN_LIFETIME (15 minutes). */
const ACCESS_TTL_SECONDS = 15 * 60;
/** Refresh when less than this many seconds remain on the access JWT. */
const ACCESS_REFRESH_SKEW_SECONDS = 90;

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function readAccessExpiryMs(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const data = JSON.parse(json) as { exp?: unknown };
    return typeof data.exp === 'number' ? data.exp * 1000 : null;
  } catch {
    return null;
  }
}

function remainingAccessSeconds(accessToken: string | null | undefined): number {
  if (!accessToken) return 0;
  const expMs = readAccessExpiryMs(accessToken);
  if (!expMs) return 0;
  return Math.max(0, Math.floor((expMs - Date.now()) / 1000));
}

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometricLabel: string;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string, remember?: boolean) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  /** Enable Face ID / fingerprint using the current session (Face ID only — no password). */
  enableBiometrics: (emailOverride?: string) => Promise<void>;
  disableBiometrics: () => Promise<void>;
  refreshBiometricState: () => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  /** Refresh the access token if needed; call when returning from background. */
  ensureFreshAccess: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function readToken(key: string) {
  return getSecureItem(key, STORE_OPTIONS);
}

async function writeToken(key: string, value: string | null) {
  await setSecureItem(key, value, STORE_OPTIONS);
}

async function migrateLegacyAuthKeys() {
  const access = (await readToken(ACCESS_KEY)) || (await readToken(LEGACY_ACCESS_KEY));
  const refresh = (await readToken(REFRESH_KEY)) || (await readToken(LEGACY_REFRESH_KEY));
  if (access) {
    await writeToken(ACCESS_KEY, access);
    await setSecureItem(LEGACY_ACCESS_KEY, null, STORE_OPTIONS);
  }
  if (refresh) {
    await writeToken(REFRESH_KEY, refresh);
    await setSecureItem(LEGACY_REFRESH_KEY, null, STORE_OPTIONS);
  }
  return { access, refresh };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const refreshTokenRef = useRef<string | null>(null);
  const userEmailRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    mobileClient.setToken(token);
  }, [token]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshBiometricState = useCallback(async () => {
    const [capability, enabled] = await Promise.all([getBiometricCapability(), isBiometricLoginEnabled()]);
    setBiometricAvailable(capability.available);
    setBiometricLabel(capability.label);
    setBiometricEnabled(enabled);
  }, []);

  const performRefresh = useCallback(async (): Promise<string | null> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const run = (async () => {
      const refresh =
        refreshTokenRef.current ||
        (await readToken(REFRESH_KEY)) ||
        (await getStoredBiometricSession())?.refresh ||
        null;
      if (!refresh) return null;
      try {
        const response = await mobileClient.auth.refresh({ refresh });
        const access = response.data.access;
        const nextRefresh = response.data.refresh || refresh;
        if (!access) return null;

        mobileClient.setToken(access);
        setToken(access);
        refreshTokenRef.current = nextRefresh;
        await writeToken(ACCESS_KEY, access);
        await writeToken(REFRESH_KEY, nextRefresh);

        if (await isBiometricLoginEnabled()) {
          const biometricSession = await getStoredBiometricSession();
          const email = biometricSession?.email;
          if (email) {
            await storeBiometricSession(email, nextRefresh);
          }
        }
        return access;
      } catch {
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = run;
    return run;
  }, []);

  const scheduleRefresh = useCallback(
    (expiresInSeconds = ACCESS_TTL_SECONDS) => {
      clearRefreshTimer();
      const whenMs = Math.max(5, expiresInSeconds - 60) * 1000;
      refreshTimerRef.current = setTimeout(() => {
        void performRefresh().then((access) => {
          if (access) {
            scheduleRefresh(ACCESS_TTL_SECONDS);
          }
        });
      }, whenMs);
    },
    [clearRefreshTimer, performRefresh],
  );

  const ensureFreshAccess = useCallback(async (): Promise<string | null> => {
    // Only refresh an active session — never silently restore from the biometric vault.
    if (!token) return null;

    const remaining = remainingAccessSeconds(token);
    if (remaining > ACCESS_REFRESH_SKEW_SECONDS) return token;

    const refreshed = await performRefresh();
    if (refreshed) {
      scheduleRefresh(remainingAccessSeconds(refreshed) || ACCESS_TTL_SECONDS);
      return refreshed;
    }
    return token;
  }, [performRefresh, scheduleRefresh, token]);

  const applySession = useCallback(async (payload: LoginResponse) => {
    if (!payload.access) {
      throw new Error('Sign-in did not return an access token. Please try again.');
    }
    const refresh = payload.refresh;
    if (!refresh) {
      throw new Error('Sign-in did not return a session token. Please try again.');
    }

    mobileClient.setToken(payload.access);
    let nextUser = payload.user;
    // /auth/refresh returns tokens only — hydrate the profile when needed.
    if (!nextUser?.id) {
      const me = await mobileClient.auth.me();
      nextUser = me.data;
    }

    setToken(payload.access);
    setUser(nextUser);
    refreshTokenRef.current = refresh;
    userEmailRef.current = nextUser.email?.trim() || null;
    await writeToken(ACCESS_KEY, payload.access);
    await writeToken(REFRESH_KEY, refresh);
    const jwtRemaining = remainingAccessSeconds(payload.access);
    scheduleRefresh(
      jwtRemaining > 0
        ? jwtRemaining
        : typeof payload.expires_in === 'number' && payload.expires_in > 0
          ? payload.expires_in
          : ACCESS_TTL_SECONDS,
    );

    if (await isBiometricLoginEnabled()) {
      const email = nextUser.email;
      if (email) {
        await storeBiometricSession(email, refresh);
      }
    }
  }, [scheduleRefresh]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      await refreshBiometricState();
      const migrated = await migrateLegacyAuthKeys();
      const access = migrated.access;
      const refresh = migrated.refresh;
      refreshTokenRef.current = refresh;

      if (!access && !refresh) {
        setToken(null);
        setUser(null);
        userEmailRef.current = null;
        return;
      }

      const remaining = remainingAccessSeconds(access);
      if (access && remaining > ACCESS_REFRESH_SKEW_SECONDS) {
        mobileClient.setToken(access);
        try {
          const response = await mobileClient.auth.me();
          setToken(access);
          setUser(response.data);
          userEmailRef.current = response.data.email?.trim() || null;
          scheduleRefresh(remaining);
          return;
        } catch {
          // Access token expired — try silent refresh below.
        }
      }

      if (refresh) {
        const refreshed = await performRefresh();
        if (refreshed) {
          const me = await mobileClient.auth.me();
          setUser(me.data);
          userEmailRef.current = me.data.email?.trim() || null;
          scheduleRefresh(remainingAccessSeconds(refreshed) || ACCESS_TTL_SECONDS);
          return;
        }
      }

      await writeToken(ACCESS_KEY, null);
      if (!(await isBiometricLoginEnabled())) {
        await writeToken(REFRESH_KEY, null);
        refreshTokenRef.current = null;
      }
      setToken(null);
      setUser(null);
      userEmailRef.current = null;
    } catch {
      await writeToken(ACCESS_KEY, null);
      // Keep refresh when biometric login is enabled so Face ID can restore the session.
      if (!(await isBiometricLoginEnabled())) {
        await writeToken(REFRESH_KEY, null);
        refreshTokenRef.current = null;
      }
      setToken(null);
      setUser(null);
      userEmailRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [performRefresh, refreshBiometricState, scheduleRefresh]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);
    void restore().finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      clearRefreshTimer();
    };
    // Intentionally run once on mount; restore reads latest secure-store tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After lock/unlock or long background, timers may be paused — refresh on foreground.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = next;
      if (wasBackground && next === 'active') {
        void ensureFreshAccess();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [ensureFreshAccess]);

  const login = useCallback(
    async (email: string, password: string, remember = true) => {
      setLoading(true);
      try {
        const response = await mobileClient.auth.login({ email, password, remember_me: remember });
        await applySession(response.data);
        await refreshBiometricState();
      } finally {
        setLoading(false);
      }
    },
    [applySession, refreshBiometricState],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string, remember = true) => {
      setLoading(true);
      try {
        const response = await mobileClient.auth.loginWithGoogle({
          id_token: idToken,
          client: 'customer',
          remember_me: remember,
        });
        await applySession(response.data);
        await refreshBiometricState();
      } finally {
        setLoading(false);
      }
    },
    [applySession, refreshBiometricState],
  );

  const loginWithBiometrics = useCallback(async () => {
    setLoading(true);
    try {
      const capability = await getBiometricCapability();
      if (!capability.available) {
        throw new Error(
          capability.enrolled
            ? `${capability.label} is not available to this app right now. On iPhone: Settings → Expo Go → enable Face ID.`
            : `Set up ${capability.label} in your phone Settings first.`,
        );
      }
      await authenticateForBiometricLogin(capability.label);
      const session = await getStoredBiometricSession();
      if (!session) {
        await clearBiometricLogin();
        await refreshBiometricState();
        throw new Error('Saved sign-in was removed. Please sign in with email and password.');
      }
      const response = await mobileClient.auth.refresh({ refresh: session.refresh });
      await applySession(response.data);
      await refreshBiometricState();
    } catch (err) {
      // Invalid/expired biometric session — clear and ask for password login.
      if (await isBiometricLoginEnabled()) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        if (
          message.includes('invalid') ||
          message.includes('401') ||
          message.includes('token') ||
          message.includes('denied')
        ) {
          await clearBiometricLogin();
          await refreshBiometricState();
          throw new Error('Saved session expired. Sign in with email and password, then re-enable Face ID.');
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [applySession, refreshBiometricState]);

  const enableBiometrics = useCallback(async (emailOverride?: string) => {
    const email = emailOverride?.trim() || user?.email?.trim() || userEmailRef.current?.trim();
    let refresh = refreshTokenRef.current || (await readToken(REFRESH_KEY));

    // Recovery: biometric vault may already hold a refresh from a prior soft logout.
    if (!refresh) {
      const biometricSession = await getStoredBiometricSession();
      if (biometricSession?.refresh) {
        refresh = biometricSession.refresh;
        refreshTokenRef.current = refresh;
        await writeToken(REFRESH_KEY, refresh);
      }
    }

    if (!email || !refresh) {
      throw new Error(
        'Your saved session is incomplete. Sign out, sign in with email and password once, then enable Face ID.',
      );
    }

    await enrollBiometricLogin(email, refresh);
    await writeToken(REFRESH_KEY, refresh);
    refreshTokenRef.current = refresh;
    setBiometricEnabled(true);
    await refreshBiometricState();
  }, [user?.email, refreshBiometricState]);

  const disableBiometrics = useCallback(async () => {
    const session = await getStoredBiometricSession();
    await clearBiometricLogin();
    // If user is signed out locally but biometric held the refresh, revoke it.
    if (!token && session?.refresh) {
      try {
        await mobileClient.auth.logout({ refresh: session.refresh, all_sessions: false });
      } catch {
        // ignore
      }
    }
    await refreshBiometricState();
  }, [token, refreshBiometricState]);

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      phone_number?: string;
    }) => {
      await mobileClient.mobile.registerCustomer(input);
      await login(input.email, input.password, true);
    },
    [login],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      clearRefreshTimer();
      const biometricOn = await isBiometricLoginEnabled();
      const refresh = refreshTokenRef.current || (await readToken(REFRESH_KEY));

      const email = user?.email?.trim() || userEmailRef.current?.trim();
      if (biometricOn && refresh && email) {
        // Soft sign-out: keep refresh for Face ID / fingerprint login.
        await storeBiometricSession(email, refresh);
        await writeToken(ACCESS_KEY, null);
        setToken(null);
        setUser(null);
        userEmailRef.current = null;
        refreshTokenRef.current = null;
        await refreshBiometricState();
        return;
      }

      if (refresh) {
        await mobileClient.auth.logout({ refresh, all_sessions: false });
      }
      await writeToken(ACCESS_KEY, null);
      await writeToken(REFRESH_KEY, null);
      refreshTokenRef.current = null;
      userEmailRef.current = null;
      setToken(null);
      setUser(null);
      await refreshBiometricState();
    } catch {
      await writeToken(ACCESS_KEY, null);
      if (!(await isBiometricLoginEnabled())) {
        await writeToken(REFRESH_KEY, null);
        refreshTokenRef.current = null;
      }
      setToken(null);
      setUser(null);
      userEmailRef.current = null;
      await refreshBiometricState();
    } finally {
      setLoading(false);
    }
  }, [user?.email, refreshBiometricState, clearRefreshTimer]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const response = await mobileClient.auth.me();
    setUser(response.data);
    userEmailRef.current = response.data.email?.trim() || null;
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      biometricEnabled,
      biometricAvailable,
      biometricLabel,
      login,
      loginWithGoogle,
      loginWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      refreshBiometricState,
      register,
      logout,
      refreshProfile,
      setUser,
      ensureFreshAccess,
    }),
    [
      user,
      token,
      loading,
      biometricEnabled,
      biometricAvailable,
      biometricLabel,
      login,
      loginWithGoogle,
      loginWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      refreshBiometricState,
      register,
      logout,
      refreshProfile,
      ensureFreshAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
