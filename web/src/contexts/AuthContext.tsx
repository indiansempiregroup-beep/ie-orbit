import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createApiClient, type LoginResponse, type UserProfile } from '@ie-platform/sdk';
import {
  clearImpersonationMarkers,
  getImpersonationTenantId,
  impersonationReturnPath,
  isImpersonating as readIsImpersonating,
  restoreAdminTokenBackup,
  writeAuthTokens,
} from '../lib/impersonation';

const STORAGE_KEY = 'ie:auth:access';
const STORAGE_REFRESH = 'ie:auth:refresh';
const STORAGE_STARTED = 'ie:auth:session_started';
const DEFAULT_ACCESS_TTL_SECONDS = 3600;

type AuthState = {
  token: string | null;
  user: UserProfile | null;
  loading: boolean;
  isImpersonating: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<string>;
  logout: (allSessions?: boolean) => Promise<void>;
  restore: () => Promise<void>;
  endImpersonation: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const client = createApiClient({ baseUrl: '/api/v1' });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(() => {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [isImpersonating, setIsImpersonating] = useState(() => readIsImpersonating());
  const refreshRef = React.useRef<number | null>(null);
  const retryRef = React.useRef<{ attempts: number; timer: number | null }>({ attempts: 0, timer: null });

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

  async function login(email: string, password: string, remember = false) {
    setLoading(true);
    try {
      clearImpersonationMarkers();
      setIsImpersonating(false);
      const res = await client.auth.login({ email, password, remember_me: remember });
      const payload = res.data;
      setToken(payload.access);
      setUser(payload.user);
      try {
        localStorage.setItem(STORAGE_KEY, payload.access);
        localStorage.setItem(STORAGE_REFRESH, payload.refresh);
        localStorage.setItem(STORAGE_STARTED, new Date().toISOString());
      } catch {
        // ignore storage failures
      }
      scheduleRefresh(payload.expires_in ?? DEFAULT_ACCESS_TTL_SECONDS, payload.refresh);
      return payload.access;
    } finally {
      setLoading(false);
    }
  }

  async function logout(allSessions = false) {
    setLoading(true);
    try {
      const refresh = localStorage.getItem(STORAGE_REFRESH) ?? '';
      await client.auth.logout({ refresh, all_sessions: allSessions });
    } catch {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
      setIsImpersonating(false);
      clearImpersonationMarkers();
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_REFRESH);
        localStorage.removeItem(STORAGE_STARTED);
      } catch {
        // ignore
      }
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
      if (!token) return;
      try {
        await hydrateUser();
        const refresh = localStorage.getItem(STORAGE_REFRESH) ?? undefined;
        scheduleRefresh(DEFAULT_ACCESS_TTL_SECONDS, refresh);
      } catch {
        const refresh = localStorage.getItem(STORAGE_REFRESH);
        if (refresh) {
          const ok = await attemptRefreshWithBackoff(refresh);
          if (!ok) {
            setToken(null);
            setUser(null);
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(STORAGE_REFRESH);
            } catch {
              // ignore
            }
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
      const nextRefresh = refreshToken || localStorage.getItem(STORAGE_REFRESH) || undefined;
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
          try {
            localStorage.setItem(STORAGE_KEY, payload.access);
            localStorage.setItem(STORAGE_REFRESH, nextRefresh);
          } catch {
            // ignore
          }

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
    () => ({ token, user, loading, isImpersonating, login, logout, restore, endImpersonation }),
    [token, user, loading, isImpersonating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
