import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { LoginResponse, UserProfile } from '@ie-platform/sdk';
import { mobileClient } from '../api/client';

const ACCESS_KEY = 'ie:mobile:access';
const REFRESH_KEY = 'ie:mobile:refresh';

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
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
    // ignore secure store errors in dev
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mobileClient.setToken(token);
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
      mobileClient.setToken(access);
      const response = await mobileClient.auth.me();
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

  const login = useCallback(async (email: string, password: string, remember = true) => {
    setLoading(true);
    try {
      const response = await mobileClient.auth.login({ email, password, remember_me: remember });
      const payload: LoginResponse = response.data;
      setToken(payload.access);
      setUser(payload.user);
      await writeToken(ACCESS_KEY, payload.access);
      await writeToken(REFRESH_KEY, payload.refresh);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const refresh = await readToken(REFRESH_KEY);
      if (refresh) {
        await mobileClient.auth.logout({ refresh, all_sessions: false });
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
    const response = await mobileClient.auth.me();
    setUser(response.data);
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refreshProfile, setUser }),
    [user, token, loading, login, register, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
