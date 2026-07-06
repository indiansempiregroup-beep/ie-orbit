import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createApiClient, type LoginResponse } from '@ie-platform/sdk';

const STORAGE_KEY = 'ie:auth:access';
const STORAGE_REFRESH = 'ie:auth:refresh';

type AuthState = {
  token: string | null;
  user: LoginResponse['user'] | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const client = createApiClient({ baseUrl: '/api' });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshRef = React.useRef<number | null>(null);
  const retryRef = React.useRef<{ attempts: number; timer: number | null }>({ attempts: 0, timer: null });

  useEffect(() => {
    client.setToken(token);
  }, [token]);

  useEffect(() => {
    // attempt restore on mount
    void restore();
    // clear on unmount
    return () => {
      if (refreshRef.current) {
        clearTimeout(refreshRef.current);
      }
    };
  }, []);

  async function login(email: string, password: string, remember = false) {
    setLoading(true);
    try {
      const res = await client.auth.login({ email, password, remember_me: remember });
      const payload = res.data;
      setToken(payload.access);
      setUser(payload.user);
      try {
        localStorage.setItem(STORAGE_KEY, payload.access);
        localStorage.setItem(STORAGE_REFRESH, payload.refresh);
      } catch {}
      scheduleRefresh(payload.expires_in, payload.refresh);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      const refresh = localStorage.getItem(STORAGE_REFRESH) ?? '';
      await client.auth.logout({ refresh });
    } catch {
      // ignore
    } finally {
      setToken(null);
      setUser(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_REFRESH);
      } catch {}
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

  async function restore() {
    setLoading(true);
    try {
      if (!token) return;
      try {
        const me = await client.auth.me();
        setUser(me.data);
      } catch (err) {
        // try refresh
        const refresh = localStorage.getItem(STORAGE_REFRESH);
        if (refresh) {
          const ok = await attemptRefreshWithBackoff(refresh);
          if (!ok) {
            setToken(null);
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.removeItem(STORAGE_REFRESH);
            } catch {}
          }
        } else {
          setToken(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function scheduleRefresh(expires_in: number, refreshToken?: string) {
    try {
      if (refreshRef.current) clearTimeout(refreshRef.current);
    } catch {}
    const when = Math.max(5, expires_in - 60) * 1000; // ms
    // Schedule a refresh using backoff if needed
    refreshRef.current = window.setTimeout(async () => {
      if (!refreshToken) refreshToken = localStorage.getItem(STORAGE_REFRESH) ?? undefined;
      if (!refreshToken) return;
      const ok = await attemptRefreshWithBackoff(refreshToken);
      if (!ok) {
        // failed after retries - perform logout cleanup
        setToken(null);
        setUser(null);
      }
    }, when);
  }

  async function attemptRefreshWithBackoff(refreshToken: string) {
    const maxAttempts = 3;
    const baseDelay = 1000; // 1s

    // reset attempts for a fresh sequence
    retryRef.current.attempts = 0;

    return new Promise<boolean>((resolve) => {
      const tryOnce = async () => {
        retryRef.current.attempts += 1;
        try {
          const refreshed = await client.auth.refresh({ refresh: refreshToken });
          const payload = refreshed.data;
          setToken(payload.access);
          setUser(payload.user);
          try {
            localStorage.setItem(STORAGE_KEY, payload.access);
            localStorage.setItem(STORAGE_REFRESH, payload.refresh);
          } catch {}
          // reset retry state
          retryRef.current.attempts = 0;
          if (retryRef.current.timer) {
            clearTimeout(retryRef.current.timer);
            retryRef.current.timer = null;
          }
          // schedule next refresh normally
          scheduleRefresh(payload.expires_in, payload.refresh);
          resolve(true);
        } catch (e) {
          if (retryRef.current.attempts >= maxAttempts) {
            // give up
            resolve(false);
            return;
          }
          // exponential backoff
          const delay = baseDelay * 2 ** (retryRef.current.attempts - 1);
          retryRef.current.timer = window.setTimeout(tryOnce, delay);
        }
      };

      tryOnce();
    });
  }

  const value = useMemo(
    () => ({ token, user, loading, login, logout, restore }),
    [token, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
