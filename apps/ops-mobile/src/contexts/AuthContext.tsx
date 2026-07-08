import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { LoginResponse, UserProfile, WorkspaceProvisionResponse } from '@ie-platform/sdk';
import { opsClient } from '../api/client';

const ACCESS_KEY = 'ie:ops:access';
const REFRESH_KEY = 'ie:ops:refresh';

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  bootstrapSession: (payload: WorkspaceProvisionResponse) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function readToken(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeToken(key: string, value: string | null) {
  try {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsClient.setToken(token);
  }, [token]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const access = await readToken(ACCESS_KEY);
      if (!access) {
        setToken(null);
        setUser(null);
        return;
      }
      opsClient.setToken(access);
      const response = await opsClient.auth.me();
      setToken(access);
      setUser(response.data);
    } catch {
      await writeToken(ACCESS_KEY, null);
      await writeToken(REFRESH_KEY, null);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await opsClient.auth.login({ email, password, remember_me: true });
      const payload: LoginResponse = response.data;
      setToken(payload.access);
      setUser(payload.user);
      await writeToken(ACCESS_KEY, payload.access);
      await writeToken(REFRESH_KEY, payload.refresh);
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrapSession = useCallback(async (payload: WorkspaceProvisionResponse) => {
    setLoading(true);
    try {
      setToken(payload.access);
      setUser(payload.user);
      await writeToken(ACCESS_KEY, payload.access);
      await writeToken(REFRESH_KEY, payload.refresh);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      const refresh = await readToken(REFRESH_KEY);
      if (refresh) {
        await opsClient.auth.logout({ refresh, all_sessions: false });
      }
    } catch {
      // ignore
    } finally {
      await writeToken(ACCESS_KEY, null);
      await writeToken(REFRESH_KEY, null);
      setToken(null);
      setUser(null);
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const response = await opsClient.auth.me();
    setUser(response.data);
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, bootstrapSession, logout, refreshProfile }),
    [user, token, loading, login, bootstrapSession, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
