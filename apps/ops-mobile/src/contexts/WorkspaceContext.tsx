import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Business, TenantSummary } from '@ie-platform/sdk';
import { createScopedClient } from '../api/client';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { isPlatformAdminOnly } from '../utils/roles';
import { getPersistentItem, setPersistentItem } from '../utils/persistentStore';
import { useAuth } from './AuthContext';

const TENANT_KEY = 'ie.ops.active-tenant-id';
const BUSINESS_KEY = 'ie.ops.active-business-id';

type WorkspaceState = {
  tenants: TenantSummary[];
  tenantId: string | null;
  businessId: string | null;
  businesses: Business[];
  activeBusiness: Business | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  setTenantId: (tenantId: string) => Promise<void>;
  setBusinessId: (businessId: string) => Promise<void>;
  initializeWorkspace: (tenantId: string, businessId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

async function readKey(key: string) {
  return getPersistentItem(key);
}

async function writeKey(key: string, value: string | null) {
  await setPersistentItem(key, value);
}

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}

function withApiHint(message: string): string {
  return `${message} (API: ${getApiBaseUrl()})`;
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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
  const [error, setError] = useState<string | null>(null);
  const selectionRef = useRef({ tenantId: null as string | null, businessId: null as string | null });

  useEffect(() => {
    selectionRef.current = { tenantId, businessId };
  }, [tenantId, businessId]);

  const loadBusinesses = useCallback(
    async (resolvedTenantId: string, preferredBusinessId?: string | null) => {
      if (!token) return null;
      const client = createScopedClient(token, resolvedTenantId);
      const response = await withDeadline(client.businesses.list(), 15000, 'Loading businesses');
      const list = asList<Business>(response.data);
      setBusinesses(list);

      const stored = preferredBusinessId ?? (await readKey(BUSINESS_KEY));
      const matched = stored ? list.find((item) => item.id === stored) : undefined;
      const resolved = matched ?? list[0] ?? null;

      setActiveBusiness(resolved);
      setBusinessIdState(resolved?.id ?? null);
      void writeKey(BUSINESS_KEY, resolved?.id ?? null);

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
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = createScopedClient(token);
      const response = await withDeadline(client.tenants.list(), 15000, 'Loading workspaces');
      const nextTenants = asList<TenantSummary>(response.data);
      setTenants(nextTenants);

      if (!nextTenants.length) {
        setTenantIdState(null);
        setBusinessIdState(null);
        setBusinesses([]);
        setActiveBusiness(null);
        void writeKey(TENANT_KEY, null);
        void writeKey(BUSINESS_KEY, null);
        return;
      }

      const storedTenantId = await readKey(TENANT_KEY);
      const validStored = Boolean(
        storedTenantId && nextTenants.some((tenant) => tenant.id === storedTenantId),
      );
      const resolvedTenantId = validStored ? storedTenantId! : nextTenants[0].id;

      setTenantIdState(resolvedTenantId);
      void writeKey(TENANT_KEY, resolvedTenantId);

      try {
        await loadBusinesses(resolvedTenantId);
      } catch (businessErr) {
        // Keep tenant selected; allow manual business pick / retry.
        setBusinesses([]);
        setActiveBusiness(null);
        setBusinessIdState(null);
        setError(
          withApiHint(
            businessErr instanceof Error
              ? businessErr.message
              : 'Could not load businesses for this workspace.',
          ),
        );
      }
    } catch (err) {
      const hadSelection = Boolean(selectionRef.current.tenantId && selectionRef.current.businessId);
      setError(
        withApiHint(
          err instanceof Error ? err.message : 'Could not load workspaces. Check your API connection.',
        ),
      );
      // Don't wipe a working session on a flaky refresh — that bounced users back to the picker.
      if (!hadSelection) {
        setTenants([]);
        setBusinesses([]);
        setActiveBusiness(null);
        setTenantIdState(null);
        setBusinessIdState(null);
      }
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
      setBusinessIdState(null);
      setActiveBusiness(null);
      setBusinesses([]);
      void writeKey(TENANT_KEY, nextTenantId);
      void writeKey(BUSINESS_KEY, null);
      try {
        setError(null);
        setLoading(true);
        await loadBusinesses(nextTenantId);
      } catch (businessErr) {
        setBusinesses([]);
        setActiveBusiness(null);
        setBusinessIdState(null);
        setError(
          withApiHint(
            businessErr instanceof Error
              ? businessErr.message
              : 'Could not load businesses for this workspace.',
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [loadBusinesses],
  );

  const setBusinessId = useCallback(
    async (nextBusinessId: string) => {
      if (!token || !tenantId) return;

      const fromList = businesses.find((b) => b.id === nextBusinessId) ?? null;
      setBusinessIdState(nextBusinessId);
      setActiveBusiness(
        fromList ??
          ({
            id: nextBusinessId,
            business_name: 'Selected business',
            display_name: 'Selected business',
          } as Business),
      );
      void writeKey(BUSINESS_KEY, nextBusinessId);

      try {
        const client = createScopedClient(token, tenantId);
        const response = await withDeadline(
          client.businesses.get(nextBusinessId),
          8000,
          'Loading business',
        );
        setActiveBusiness(response.data);
      } catch {
        // IDs are enough for scoped API calls.
      }
    },
    [token, tenantId, businesses],
  );

  const initializeWorkspace = useCallback(
    async (nextTenantId: string, nextBusinessId: string) => {
      setTenantIdState(nextTenantId);
      void writeKey(TENANT_KEY, nextTenantId);
      await loadBusinesses(nextTenantId, nextBusinessId);
    },
    [loadBusinesses],
  );

  const resolvedBusiness =
    activeBusiness ??
    (businessId ? businesses.find((item) => item.id === businessId) ?? null : null);
  const ready = Boolean(token && tenantId && businessId);

  const value = useMemo(
    () => ({
      tenants,
      tenantId,
      businessId,
      businesses,
      activeBusiness: resolvedBusiness,
      loading,
      ready,
      error,
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
      resolvedBusiness,
      loading,
      ready,
      error,
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
