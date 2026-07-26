import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Business, TenantSummary } from '@ie-platform/sdk';
import { createScopedClient } from '../api/client';
import { isPlatformAdminOnly } from '../utils/roles';
import { useAuth } from './AuthContext';

const TENANT_KEY = 'ie:ops:active-tenant-id';
const BUSINESS_KEY = 'ie:ops:active-business-id';

type WorkspaceState = {
  tenants: TenantSummary[];
  tenantId: string | null;
  businessId: string | null;
  businesses: Business[];
  activeBusiness: Business | null;
  loading: boolean;
  ready: boolean;
  setTenantId: (tenantId: string) => Promise<void>;
  setBusinessId: (businessId: string) => Promise<void>;
  initializeWorkspace: (tenantId: string, businessId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

async function readKey(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string | null) {
  try {
    if (value) await SecureStore.setItemAsync(key, value);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const platformAdminOnly = isPlatformAdminOnly(user);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBusinesses = useCallback(
    async (resolvedTenantId: string, preferredBusinessId?: string | null) => {
      if (!token) return null;
      const client = createScopedClient(token, resolvedTenantId);
      const response = await client.businesses.list();
      const list = response.data ?? [];
      setBusinesses(list);

      const stored = preferredBusinessId ?? (await readKey(BUSINESS_KEY));
      const matched = stored ? list.find((item) => item.id === stored) : undefined;
      const resolved = matched ?? list[0] ?? null;

      setActiveBusiness(resolved);
      setBusinessIdState(resolved?.id ?? null);
      if (resolved?.id) await writeKey(BUSINESS_KEY, resolved.id);
      else await writeKey(BUSINESS_KEY, null);

      return resolved;
    },
    [token],
  );

  const refreshWorkspace = useCallback(async () => {
    if (!token || platformAdminOnly) {
      setTenants([]);
      setBusinesses([]);
      setActiveBusiness(null);
      setTenantIdState(null);
      setBusinessIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createScopedClient(token);
      const response = await client.tenants.list();
      const nextTenants = response.data ?? [];
      setTenants(nextTenants);

      const storedTenantId = await readKey(TENANT_KEY);
      const validStored = storedTenantId && nextTenants.some((t) => t.id === storedTenantId);
      const resolvedTenantId = validStored ? storedTenantId : nextTenants[0]?.id ?? null;

      setTenantIdState(resolvedTenantId);
      if (resolvedTenantId) await writeKey(TENANT_KEY, resolvedTenantId);
      else await writeKey(TENANT_KEY, null);

      if (resolvedTenantId) {
        await loadBusinesses(resolvedTenantId);
      } else {
        setBusinesses([]);
        setActiveBusiness(null);
        setBusinessIdState(null);
      }
    } catch {
      setTenants([]);
      setBusinesses([]);
      setActiveBusiness(null);
      setTenantIdState(null);
      setBusinessIdState(null);
    } finally {
      setLoading(false);
    }
  }, [token, platformAdminOnly, loadBusinesses]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const setTenantId = useCallback(
    async (nextTenantId: string) => {
      setTenantIdState(nextTenantId);
      await writeKey(TENANT_KEY, nextTenantId);
      await writeKey(BUSINESS_KEY, null);
      await loadBusinesses(nextTenantId);
    },
    [loadBusinesses],
  );

  const setBusinessId = useCallback(
    async (nextBusinessId: string) => {
      if (!token || !tenantId) return;
      setBusinessIdState(nextBusinessId);
      await writeKey(BUSINESS_KEY, nextBusinessId);
      const client = createScopedClient(token, tenantId);
      try {
        const response = await client.businesses.get(nextBusinessId);
        setActiveBusiness(response.data);
      } catch {
        const match = businesses.find((b) => b.id === nextBusinessId) ?? null;
        setActiveBusiness(match);
      }
    },
    [token, tenantId, businesses],
  );

  const initializeWorkspace = useCallback(
    async (nextTenantId: string, nextBusinessId: string) => {
      setTenantIdState(nextTenantId);
      await writeKey(TENANT_KEY, nextTenantId);
      await loadBusinesses(nextTenantId, nextBusinessId);
    },
    [loadBusinesses],
  );

  const ready = Boolean(token && tenantId && businessId && activeBusiness);

  const value = useMemo(
    () => ({
      tenants,
      tenantId,
      businessId,
      businesses,
      activeBusiness,
      loading,
      ready,
      setTenantId,
      setBusinessId,
      initializeWorkspace,
      refreshWorkspace,
    }),
    [
      tenants,
      tenantId,
      businessId,
      businesses,
      activeBusiness,
      loading,
      ready,
      setTenantId,
      setBusinessId,
      initializeWorkspace,
      refreshWorkspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
