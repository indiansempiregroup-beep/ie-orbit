import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createApiClient, type LoginResponse, type UserProfile, type WorkspaceProvisionResponse } from '@ie-orbit/sdk';
import {
  clearImpersonationMarkers,
  getImpersonationTenantId,
  impersonationReturnPath,
  isImpersonating as readIsImpersonating,
  restoreAdminTokenBackup,
  writeAuthTokens,
  clearAuthTokens,
  rememberAuthTokens,
} from '../lib/impersonation';
import { suppressGoogleAutoSignIn } from '../lib/googleAuth';

const STORAGE_KEY = 'ie:auth:access';
const STORAGE_REFRESH = 'ie:auth:refresh';
const STORAGE_STARTED = 'ie:auth:session_started';
const DEFAULT_ACCESS_TTL_SECONDS = 3600;

type AuthState = {
  token: string | null;
  user: UserProfile | null;
  loading: boolean;
  isImpersonating: boolean;
  loginWithOtp: (input: {
    channel: 'email' | 'whatsapp';
    identifier: string;
    code: string;
    remember?: boolean;
  }) => Promise<string>;
  sendOtp: (input: { channel: 'email' | 'whatsapp'; identifier: string }) => Promise<void>;
  loginWithGoogle: (idToken: string, remember?: boolean) => Promise<string>;
  bootstrapSession: (payload: WorkspaceProvisionResponse) => Promise<void>;
  logout: (allSessions?: boolean) => Promise<void>;
  restore: () => Promise<void>;
  endImpersonation: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const client = createApiClient({ baseUrl: '/api/v1' });

function readStoredAuth(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  clearAuthTokens();
}

function writeStoredAuth(access: string, refresh: string, persist: boolean) {
  rememberAuthTokens(access, refresh);
  clearStoredAuth();
  const store = persist ? localStorage : sessionStorage;
  try {
    store.setItem(STORAGE_KEY, access);
    store.setItem(STORAGE_REFRESH, refresh);
    store.setItem(STORAGE_STARTED, new Date().toISOString());
  } catch {
    // ignore storage failures
  }
}

function isPersistedSession(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_REFRESH));
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredAuth(STORAGE_KEY));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(() => Boolean(readStoredAuth(STORAGE_KEY)));
  const [isImpersonating, setIsImpersonating] = useState(() => readIsImpersonating());
  const refreshRef = React.useRef<number | null>(null);
  const retryRef = React.useRef<{ attempts: number; timer: number | null }>({ attempts: 0, timer: null });
  /** Remember me: true → localStorage; false → sessionStorage only. */
  const persistSessionRef = React.useRef(isPersistedSession());

  useEffect(() => {
    client.setToken(token);
  }, [token]);

  useEffect(() => {
    void restore();
    return () => {
      if (refreshRef.current) {
        clearTimeout(refreshRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  async function hydrateUser(): Promise<UserProfile> {
    const me = await client.auth.me();
    setUser(me.data);
    return me.data;
  }

  async function applyLoginPayload(payload: LoginResponse, remember = true) {
    setToken(payload.access);
    setUser(payload.user);
    persistSessionRef.current = remember;
    writeStoredAuth(payload.access, payload.refresh, remember);
    scheduleRefresh(payload.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS, payload.refresh);
    return payload.access;
  }

  async function sendOtp(input: { channel: 'email' | 'whatsapp'; identifier: string }) {
    await client.auth.sendOtp({
      client: 'ops',
      channel: input.channel,
      identifier: input.identifier.trim(),
    });
  }

  async function loginWithOtp(input: {
    channel: 'email' | 'whatsapp';
    identifier: string;
    code: string;
    remember?: boolean;
  }) {
    setLoading(true);
    try {
      clearImpersonationMarkers();
      setIsImpersonating(false);
      const res = await client.auth.verifyOtp({
        client: 'ops',
        channel: input.channel,
        identifier: input.identifier.trim(),
        code: input.code.trim(),
        remember_me: input.remember ?? true,
      });
      return await applyLoginPayload(res.data, input.remember ?? true);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithGoogle(idToken: string, remember = true) {
    setLoading(true);
    try {
      clearImpersonationMarkers();
      setIsImpersonating(false);
      const res = await client.auth.loginWithGoogle({
        id_token: idToken,
        client: 'ops',
        remember_me: remember,
      });
      return await applyLoginPayload(res.data, remember);
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapSession(payload: WorkspaceProvisionResponse) {
    setLoading(true);
    try {
      clearImpersonationMarkers();
      setIsImpersonating(false);
      client.setToken(payload.access);
      setToken(payload.access);
      if (payload.user) {
        setUser(payload.user);
      } else {
        await hydrateUser();
      }
      persistSessionRef.current = true;
      writeStoredAuth(payload.access, payload.refresh, true);
      scheduleRefresh(payload.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS, payload.refresh);
    } finally {
      setLoading(false);
    }
  }

  async function logout(allSessions = false) {
    setLoading(true);
    const email = user?.email;
    try {
      const refresh = readStoredAuth(STORAGE_REFRESH) ?? '';
      await client.auth.logout({ refresh, all_sessions: allSessions });
    } catch {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
      setIsImpersonating(false);
      clearImpersonationMarkers();
      clearStoredAuth();
      void suppressGoogleAutoSignIn(email);
      if (refreshRef.current) {
        clearTimeout(refreshRef.current);
      }
      if (retryRef.current?.timer) {
        clearTimeout(retryRef.current.timer);
        retryRef.current.attempts = 0;
        retryRef.current.timer = null;
      }
      setLoading(false);
    }
  }

  async function endImpersonation() {
    const returnTenantId = getImpersonationTenantId();
    const returnPath = impersonationReturnPath(returnTenantId);
    setLoading(true);
    try {
      try {
        const result = await client.platform.endImpersonation();
        writeAuthTokens(result.data.access, result.data.refresh);
        persistSessionRef.current = true;
        setToken(result.data.access);
        client.setToken(result.data.access);
        if (result.data.user) {
          setUser(result.data.user);
        }
        scheduleRefresh(result.data.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS, result.data.refresh);
      } catch {
        const backup = restoreAdminTokenBackup();
        if (!backup?.access) {
          throw new Error('Unable to end impersonation session.');
        }
        setToken(backup.access);
        client.setToken(backup.access);
        try {
          await hydrateUser();
        } catch {
          // reload will rehydrate
        }
      }
      clearImpersonationMarkers();
      setIsImpersonating(false);
      window.location.href = returnPath;
    } finally {
      setLoading(false);
    }
  }

  async function restore() {
    setLoading(true);
    try {
      setIsImpersonating(readIsImpersonating());
      persistSessionRef.current = isPersistedSession();
      if (!token) return;
      try {
        await hydrateUser();
        const refresh = readStoredAuth(STORAGE_REFRESH) ?? undefined;
        scheduleRefresh(DEFAULT_ACCESS_TTL_SECONDS, refresh);
      } catch {
        const refresh = readStoredAuth(STORAGE_REFRESH);
        if (refresh) {
          const ok = await attemptRefreshWithBackoff(refresh);
          if (!ok) {
            setToken(null);
            setUser(null);
            clearStoredAuth();
          }
        } else {
          setToken(null);
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function scheduleRefresh(expires_in: number, refreshToken?: string) {
    try {
      if (refreshRef.current) clearTimeout(refreshRef.current);
    } catch {
      // ignore
    }
    const ttl = Number.isFinite(expires_in) && expires_in > 0 ? expires_in : DEFAULT_ACCESS_TTL_SECONDS;
    const when = Math.max(5, ttl - 60) * 1000;
    refreshRef.current = window.setTimeout(async () => {
      const nextRefresh = refreshToken || readStoredAuth(STORAGE_REFRESH) || undefined;
      if (!nextRefresh) return;
      const ok = await attemptRefreshWithBackoff(nextRefresh);
      if (!ok) {
        setToken(null);
        setUser(null);
      }
    }, when);
  }

  async function attemptRefreshWithBackoff(refreshToken: string) {
    const maxAttempts = 3;
    const baseDelay = 1000;

    retryRef.current.attempts = 0;

    return new Promise<boolean>((resolve) => {
      const tryOnce = async () => {
        retryRef.current.attempts += 1;
        try {
          const refreshed = await client.auth.refresh({ refresh: refreshToken });
          const payload = refreshed.data as LoginResponse & { user?: UserProfile };
          const nextRefresh = payload.refresh || refreshToken;

          setToken(payload.access);
          client.setToken(payload.access);
          writeStoredAuth(payload.access, nextRefresh, persistSessionRef.current);

          // /auth/refresh returns tokens only — never clear roles by assigning undefined user.
          if (payload.user?.id) {
            setUser(payload.user);
          } else {
            await hydrateUser();
          }

          retryRef.current.attempts = 0;
          if (retryRef.current.timer) {
            clearTimeout(retryRef.current.timer);
            retryRef.current.timer = null;
          }
          scheduleRefresh(payload.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS, nextRefresh);
          resolve(true);
        } catch {
          if (retryRef.current.attempts >= maxAttempts) {
            resolve(false);
            return;
          }
          const delay = baseDelay * 2 ** (retryRef.current.attempts - 1);
          retryRef.current.timer = window.setTimeout(tryOnce, delay);
        }
      };

      void tryOnce();
    });
  }

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isImpersonating,
      sendOtp,
      loginWithOtp,
      loginWithGoogle,
      bootstrapSession,
      logout,
      restore,
      endImpersonation,
    }),
    [token, user, loading, isImpersonating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
