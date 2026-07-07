import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Business, type TenantSummary } from '@ie-platform/sdk';
import { createAuthenticatedClient } from '../lib/apiClient';
import { invalidateWorkspaceData } from '../lib/workspace';
import { useAuth } from '../hooks/useAuth';

export const ACTIVE_TENANT_STORAGE_KEY = 'ie:active-tenant-id';
export const ACTIVE_BUSINESS_STORAGE_KEY = 'ie:active-business-id';

type WorkspaceState = {
  tenants: TenantSummary[];
  tenantId: string | null;
  businessId: string | null;
  activeBusiness: Business | null;
  activeProduct: string | null;
  loading: boolean;
  setTenantId: (tenantId: string) => void;
  setBusinessId: (businessId: string) => void;
  switchBusiness: (businessId: string) => void;
  switchProduct: (productId: string) => Promise<void>;
  subscribeProduct: (productId: string, setActive?: boolean) => Promise<void>;
  setActiveBusiness: (business: Business) => void;
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [businessId, setBusinessIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(false);

  const loadActiveBusiness = useCallback(async (token: string, resolvedTenantId: string | null, preferredBusinessId?: string | null) => {
    const client = createAuthenticatedClient(token, resolvedTenantId);
    const businesses = (await client.businesses.list()).data ?? [];

    const storedBusinessId = preferredBusinessId ?? localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
    const matched = storedBusinessId ? businesses.find((item) => item.id === storedBusinessId) : undefined;
    const resolvedBusiness = matched ?? businesses[0] ?? null;

    setActiveBusiness(resolvedBusiness);
    setBusinessIdState(resolvedBusiness?.id ?? null);

    if (resolvedBusiness?.id) {
      localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, resolvedBusiness.id);
    } else {
      localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    }

    return { businesses, resolvedBusiness };
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (!auth.token) {
      setTenants([]);
      setActiveBusiness(null);
      setBusinessIdState(null);
      return;
    }

    setLoading(true);
    try {
      const client = createAuthenticatedClient(auth.token);
      const response = await client.tenants.list();
      const nextTenants = response.data ?? [];
      setTenants(nextTenants);

      const storedTenantId = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
      const validStoredTenant = storedTenantId && nextTenants.some((tenant) => tenant.id === storedTenantId);
      const resolvedTenantId = validStoredTenant ? storedTenantId : nextTenants[0]?.id ?? null;

      setTenantIdState(resolvedTenantId);
      if (resolvedTenantId) {
        localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, resolvedTenantId);
      } else {
        localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
      }

      await loadActiveBusiness(auth.token, resolvedTenantId);
    } catch {
      setTenants([]);
      setActiveBusiness(null);
      setBusinessIdState(null);
    } finally {
      setLoading(false);
    }
  }, [auth.token, loadActiveBusiness]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const setTenantId = useCallback((nextTenantId: string) => {
    setTenantIdState(nextTenantId);
    try {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, nextTenantId);
      localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    } catch {
      // ignore
    }
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const switchBusiness = useCallback(async (nextBusinessId: string) => {
    if (!auth.token) return;

    setBusinessIdState(nextBusinessId);
    localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, nextBusinessId);

    const client = createAuthenticatedClient(auth.token, tenantId);
    try {
      const response = await client.businesses.get(nextBusinessId);
      setActiveBusiness(response.data);
    } catch {
      await loadActiveBusiness(auth.token, tenantId, nextBusinessId);
    }

    invalidateWorkspaceData(queryClient);
  }, [auth.token, tenantId, loadActiveBusiness, queryClient]);

  const switchProduct = useCallback(async (productId: string) => {
    if (!auth.token || !businessId) {
      throw new Error('Select a business before changing product.');
    }

    const client = createAuthenticatedClient(auth.token, tenantId);
    const response = await client.businesses.patch(businessId, { selected_product: productId });
    setActiveBusiness(response.data);
    invalidateWorkspaceData(queryClient);
  }, [auth.token, businessId, tenantId, queryClient]);

  const subscribeProduct = useCallback(async (productId: string, setActive = true) => {
    if (!auth.token || !businessId) {
      throw new Error('Select a business before subscribing to a product.');
    }

    const client = createAuthenticatedClient(auth.token, tenantId);
    const response = await client.businesses.subscribeProduct(businessId, {
      product_code: productId,
      set_active: setActive,
    });
    setActiveBusiness(response.data);
    invalidateWorkspaceData(queryClient);
  }, [auth.token, businessId, tenantId, queryClient]);

  const setActiveBusinessState = useCallback((business: Business) => {
    setActiveBusiness(business);
  }, []);

  const activeProduct = activeBusiness?.selected_product ?? null;

  const value = useMemo(
    () => ({
      tenants,
      tenantId,
      businessId,
      activeBusiness,
      activeProduct,
      loading,
      setTenantId,
      setBusinessId: switchBusiness,
      switchBusiness,
      switchProduct,
      subscribeProduct,
      setActiveBusiness: setActiveBusinessState,
      refreshWorkspace,
    }),
    [tenants, tenantId, businessId, activeBusiness, activeProduct, loading, setTenantId, switchBusiness, switchProduct, subscribeProduct, setActiveBusinessState, refreshWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
