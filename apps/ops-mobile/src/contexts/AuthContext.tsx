import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { LoginResponse, UserProfile, WorkspaceProvisionResponse } from '@ie-platform/sdk';
import { opsClient } from '../api/client';
import {
  authenticateForBiometricLogin,
  disableBiometricLogin as clearBiometricLogin,
  enableBiometricLogin as enrollBiometricLogin,
  getBiometricCapability,
  getStoredBiometricSession,
  isBiometricLoginEnabled,
  migrateLegacyBiometricKeys,
  storeBiometricSession,
} from '../utils/biometrics';
import { getSecureItem, setSecureItem, getPersistentItem } from '../utils/persistentStore';
import {
  clearImpersonationHandoff,
  consumeImpersonationHandoff,
  defaultAdminReturnUrl,
  IMPERSONATION_RETURN_KEY,
  IMPERSONATOR_KEY,
  jwtIsImpersonation,
  persistImpersonationHandoff,
  persistSessionHandoff,
  redirectToAdminWeb,
} from '../utils/impersonationHandoff';

const ACCESS_KEY = 'ie.ops.access';
const REFRESH_KEY = 'ie.ops.refresh';
const LEGACY_ACCESS_KEY = 'ie:ops:access';
const LEGACY_REFRESH_KEY = 'ie:ops:refresh';
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
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  /** Enable Face ID / fingerprint using the current session (Face ID only — no password). */
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  refreshBiometricState: () => Promise<void>;
  bootstrapSession: (payload: WorkspaceProvisionResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Refresh the access token if needed; call before long uploads / analysis. */
  ensureFreshAccess: () => Promise<string | null>;
  isImpersonating: boolean;
  endImpersonation: () => Promise<void>;
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
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const refreshTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const accessIssuedAtRef = useRef<number>(0);

  useEffect(() => {
    opsClient.setToken(token);
  }, [token]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshBiometricState = useCallback(async () => {
    await migrateLegacyBiometricKeys().catch(() => undefined);
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
        const response = await opsClient.auth.refresh({ refresh });
        const access = response.data.access;
        const nextRefresh = response.data.refresh || refresh;
        if (!access) return null;

        opsClient.setToken(access);
        setToken(access);
        refreshTokenRef.current = nextRefresh;
        accessIssuedAtRef.current = Date.now();
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
    const remaining = remainingAccessSeconds(token);
    if (token && remaining > ACCESS_REFRESH_SKEW_SECONDS) return token;

    const refreshed = await performRefresh();
    if (refreshed) {
      scheduleRefresh(remainingAccessSeconds(refreshed) || ACCESS_TTL_SECONDS);
      return refreshed;
    }
    return token;
  }, [performRefresh, scheduleRefresh, token]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      await refreshBiometricState();
      const handoff = consumeImpersonationHandoff();
      if (handoff) {
        if (handoff.impersonatorId && handoff.tenantId) {
          await persistImpersonationHandoff({
            access: handoff.access,
            refresh: handoff.refresh,
            tenantId: handoff.tenantId,
            impersonatorId: handoff.impersonatorId,
            returnTo: handoff.returnTo,
          });
          setIsImpersonating(true);
        } else {
          await persistSessionHandoff(handoff);
          setIsImpersonating(false);
        }
        opsClient.setToken(handoff.access);
        const me = await opsClient.auth.me();
        setToken(handoff.access);
        setUser(me.data);
        refreshTokenRef.current = handoff.refresh;
        accessIssuedAtRef.current = Date.now();
        await writeToken(ACCESS_KEY, handoff.access);
        await writeToken(REFRESH_KEY, handoff.refresh);
        scheduleRefresh(remainingAccessSeconds(handoff.access) || ACCESS_TTL_SECONDS);
        return;
      }

      const storedImpersonator = await getPersistentItem(IMPERSONATOR_KEY);
      const migrated = await migrateLegacyAuthKeys();
      const access = migrated.access;
      refreshTokenRef.current = migrated.refresh;
      setIsImpersonating(Boolean(storedImpersonator) || jwtIsImpersonation(access));
      if (!access && !migrated.refresh) {
        setToken(null);
        setUser(null);
        return;
      }

      const remaining = remainingAccessSeconds(access);
      if (access && remaining > ACCESS_REFRESH_SKEW_SECONDS) {
        opsClient.setToken(access);
        try {
          const response = await opsClient.auth.me();
          setToken(access);
          setUser(response.data);
          // Align issued-at with JWT remaining lifetime (not "now" for a stale stored token).
          accessIssuedAtRef.current = Date.now() - (ACCESS_TTL_SECONDS - remaining) * 1000;
          scheduleRefresh(remaining);
          return;
        } catch {
          // Access rejected — try refresh before signing out.
        }
      }

      const refreshed = await performRefresh();
      if (!refreshed) {
        await writeToken(ACCESS_KEY, null);
        if (!(await isBiometricLoginEnabled())) {
          await writeToken(REFRESH_KEY, null);
          refreshTokenRef.current = null;
        }
        setToken(null);
        setUser(null);
        return;
      }
      const me = await opsClient.auth.me();
      setUser(me.data);
      scheduleRefresh(remainingAccessSeconds(refreshed) || ACCESS_TTL_SECONDS);
    } catch {
      await writeToken(ACCESS_KEY, null);
      // Keep refresh when biometric login is enabled so Face ID can restore the session.
      if (!(await isBiometricLoginEnabled())) {
        await writeToken(REFRESH_KEY, null);
        refreshTokenRef.current = null;
      }
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [performRefresh, refreshBiometricState, scheduleRefresh]);

  useEffect(() => {
    void restore();
    return () => clearRefreshTimer();
    // Intentionally run once on mount; restore reads latest secure-store tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = useCallback(async (payload: LoginResponse) => {
    if (!payload.access) {
      throw new Error('Sign-in did not return an access token. Please try again.');
    }
    const refresh = payload.refresh;
    if (!refresh) {
      throw new Error('Sign-in did not return a session token. Please try again.');
    }

    opsClient.setToken(payload.access);
    let nextUser = payload.user;
    // /auth/refresh returns tokens only — hydrate the profile when needed.
    if (!nextUser?.id) {
      const me = await opsClient.auth.me();
      nextUser = me.data;
    }

    setToken(payload.access);
    setUser(nextUser);
    refreshTokenRef.current = refresh;
    accessIssuedAtRef.current = Date.now();
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

  const login = useCallback(async (email: string, password: string, rememberMe = true) => {
    setLoading(true);
    try {
      await clearImpersonationHandoff();
      setIsImpersonating(false);
      const response = await opsClient.auth.login({
        email,
        password,
        remember_me: rememberMe,
      });
      await applySession(response.data);
      await refreshBiometricState();
    } finally {
      setLoading(false);
    }
  }, [applySession, refreshBiometricState]);

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
      const response = await opsClient.auth.refresh({ refresh: session.refresh });
      await applySession(response.data);
      await refreshBiometricState();
    } catch (err) {
      // Invalid/expired biometric session — clear and ask for password login.
      if (await isBiometricLoginEnabled()) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        if (message.includes('invalid') || message.includes('401') || message.includes('token') || message.includes('denied')) {
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

  const enableBiometrics = useCallback(async () => {
    const email = user?.email?.trim();
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
    // Keep session refresh in the main store after enroll.
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
        await opsClient.auth.logout({ refresh: session.refresh, all_sessions: false });
      } catch {
        // ignore
      }
    }
    await refreshBiometricState();
  }, [token, refreshBiometricState]);

  const bootstrapSession = useCallback(async (payload: WorkspaceProvisionResponse) => {
    setLoading(true);
    try {
      opsClient.setToken(payload.access);
      setToken(payload.access);
      setUser(payload.user);
      refreshTokenRef.current = payload.refresh;
      accessIssuedAtRef.current = Date.now();
      await writeToken(ACCESS_KEY, payload.access);
      await writeToken(REFRESH_KEY, payload.refresh);
      scheduleRefresh(ACCESS_TTL_SECONDS);
    } finally {
      setLoading(false);
    }
  }, [scheduleRefresh]);

  const endImpersonation = useCallback(async () => {
    const storedReturn = await getPersistentItem(IMPERSONATION_RETURN_KEY);
    const tenantId = await getPersistentItem('ie.ops.active-tenant-id');
    const returnTo = storedReturn || defaultAdminReturnUrl(tenantId);
    setLoading(true);
    try {
      try {
        await opsClient.platform.endImpersonation();
      } catch {
        // Admin web still has the original session; continue the hand-back.
      }
      clearRefreshTimer();
      await clearImpersonationHandoff();
      await writeToken(ACCESS_KEY, null);
      await writeToken(REFRESH_KEY, null);
      refreshTokenRef.current = null;
      setToken(null);
      setUser(null);
      setIsImpersonating(false);
      redirectToAdminWeb(returnTo);
    } finally {
      setLoading(false);
    }
  }, [clearRefreshTimer]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      clearRefreshTimer();
      const biometricOn = await isBiometricLoginEnabled();
      const refresh = refreshTokenRef.current || (await readToken(REFRESH_KEY));

      if (biometricOn && refresh && user?.email) {
        // Soft sign-out: keep refresh for Face ID / fingerprint login.
        await storeBiometricSession(user.email, refresh);
        await writeToken(ACCESS_KEY, null);
        // Keep REFRESH_KEY so a later password re-login still has a path if needed;
        // biometric vault is the primary source after soft logout.
        setToken(null);
        setUser(null);
        refreshTokenRef.current = null;
        await refreshBiometricState();
        return;
      }

      if (refresh) {
        await opsClient.auth.logout({ refresh, all_sessions: false });
      }
      await clearImpersonationHandoff();
      setIsImpersonating(false);
      await writeToken(ACCESS_KEY, null);
      await writeToken(REFRESH_KEY, null);
      refreshTokenRef.current = null;
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
      await refreshBiometricState();
    } finally {
      setLoading(false);
    }
  }, [user?.email, refreshBiometricState, clearRefreshTimer]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const response = await opsClient.auth.me();
    setUser(response.data);
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
      loginWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      refreshBiometricState,
      bootstrapSession,
      logout,
      refreshProfile,
      ensureFreshAccess,
      isImpersonating,
      endImpersonation,
    }),
    [
      user,
      token,
      loading,
      biometricEnabled,
      biometricAvailable,
      biometricLabel,
      login,
      loginWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      refreshBiometricState,
      bootstrapSession,
      logout,
      refreshProfile,
      ensureFreshAccess,
      isImpersonating,
      endImpersonation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
