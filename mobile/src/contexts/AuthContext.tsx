import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { LoginResponse, UserProfile } from '@ie-platform/sdk';
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

const ACCESS_KEY = 'ie:mobile:access';
const REFRESH_KEY = 'ie:mobile:refresh';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type AuthState = {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometricLabel: string;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  /** Enable Face ID / fingerprint using the current session (Face ID only — no password). */
  enableBiometrics: () => Promise<void>;
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
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function readToken(key: string) {
  try {
    return await SecureStore.getItemAsync(key, STORE_OPTIONS);
  } catch {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }
}

async function writeToken(key: string, value: string | null) {
  try {
    if (value == null) {
      await SecureStore.deleteItemAsync(key, STORE_OPTIONS).catch(() => undefined);
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
      return;
    }
    await SecureStore.setItemAsync(key, value, STORE_OPTIONS);
    const verified = await readToken(key);
    if (verified !== value) {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // ignore secure store errors in dev
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const refreshTokenRef = useRef<string | null>(null);

  useEffect(() => {
    mobileClient.setToken(token);
  }, [token]);

  const refreshBiometricState = useCallback(async () => {
    const [capability, enabled] = await Promise.all([getBiometricCapability(), isBiometricLoginEnabled()]);
    setBiometricAvailable(capability.available);
    setBiometricLabel(capability.label);
    setBiometricEnabled(enabled);
  }, []);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      await refreshBiometricState();
      const access = await readToken(ACCESS_KEY);
      const refresh = await readToken(REFRESH_KEY);
      refreshTokenRef.current = refresh;
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
  }, [refreshBiometricState]);

  useEffect(() => {
    void restore();
  }, [restore]);

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
    await writeToken(ACCESS_KEY, payload.access);
    await writeToken(REFRESH_KEY, refresh);

    if (await isBiometricLoginEnabled()) {
      const email = nextUser.email;
      if (email) {
        await storeBiometricSession(email, refresh);
      }
    }
  }, []);

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
      const biometricOn = await isBiometricLoginEnabled();
      const refresh = refreshTokenRef.current || (await readToken(REFRESH_KEY));

      if (biometricOn && refresh && user?.email) {
        // Soft sign-out: keep refresh for Face ID / fingerprint login.
        await storeBiometricSession(user.email, refresh);
        await writeToken(ACCESS_KEY, null);
        setToken(null);
        setUser(null);
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
  }, [user?.email, refreshBiometricState]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const response = await mobileClient.auth.me();
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
      register,
      logout,
      refreshProfile,
      setUser,
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
      register,
      logout,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
