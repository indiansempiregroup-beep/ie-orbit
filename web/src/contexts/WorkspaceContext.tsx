import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Business, type TenantSummary } from '@ie-platform/sdk';
import { createAuthenticatedClient } from '../lib/apiClient';
import { invalidateWorkspaceData } from '../lib/workspace';
import { useAuth } from '../hooks/useAuth';
import { isPlatformAdmin } from '../utils/roles';

export const ACTIVE_TENANT_STORAGE_KEY = 'ie:active-tenant-id';
export const ACTIVE_BUSINESS_STORAGE_KEY = 'ie:active-business-id';
/** When set, platform/super admins may load a tenant workspace (opt-in). */
export const WORKSPACE_MODE_STORAGE_KEY = 'ie:workspace-mode';

type WorkspaceState = {
  tenants: TenantSummary[];
  tenantId: string | null;
  businessId: string | null;
  activeBusiness: Business | null;
  activeProduct: string | null;
  loading: boolean;
  /** True when a platform admin has opted into tenant workspace mode. */
  workspaceMode: boolean;
  setTenantId: (tenantId: string) => void;
  setBusinessId: (businessId: string) => void;
  switchBusiness: (businessId: string) => void;
  switchProduct: (productId: string) => Promise<void>;
  subscribeProduct: (productId: string, setActive?: boolean) => Promise<void>;
  setActiveBusiness: (business: Business) => void;
  refreshWorkspace: () => Promise<void>;
  enterWorkspaceMode: () => Promise<void>;
  exitWorkspaceMode: () => void;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

function readWorkspaceModeFlag(): boolean {
  try {
    return localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeWorkspaceModeFlag(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(WORKSPACE_MODE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function clearWorkspaceState(
  setTenants: (value: TenantSummary[]) => void,
  setActiveBusiness: (value: Business | null) => void,
  setBusinessIdState: (value: string | null) => void,
  setTenantIdState: (value: string | null) => void,
) {
  setTenants([]);
  setActiveBusiness(null);
  setBusinessIdState(null);
  setTenantIdState(null);
}

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
  const [workspaceMode, setWorkspaceMode] = useState(readWorkspaceModeFlag);

  const platformAdmin = isPlatformAdmin(auth.user);
  const shouldLoadWorkspace = Boolean(auth.token && auth.user && (!platformAdmin || workspaceMode));

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
      clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
      return;
    }

    if (isPlatformAdmin(auth.user) && !readWorkspaceModeFlag()) {
      clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
      setLoading(false);
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
      clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
    } finally {
      setLoading(false);
    }
  }, [auth.token, auth.user, loadActiveBusiness]);

  useEffect(() => {
    if (!auth.token || !auth.user) {
      clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
      setWorkspaceMode(false);
      writeWorkspaceModeFlag(false);
      setLoading(false);
      return;
    }

    if (!shouldLoadWorkspace) {
      clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
      setLoading(false);
      return;
    }

    void refreshWorkspace();
  }, [auth.token, auth.user, shouldLoadWorkspace, refreshWorkspace]);

  const enterWorkspaceMode = useCallback(async () => {
    writeWorkspaceModeFlag(true);
    setWorkspaceMode(true);
    await refreshWorkspace();
  }, [refreshWorkspace]);

  const exitWorkspaceMode = useCallback(() => {
    writeWorkspaceModeFlag(false);
    setWorkspaceMode(false);
    clearWorkspaceState(setTenants, setActiveBusiness, setBusinessIdState, setTenantIdState);
    setLoading(false);
  }, []);

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
      workspaceMode,
      setTenantId,
      setBusinessId: switchBusiness,
      switchBusiness,
      switchProduct,
      subscribeProduct,
      setActiveBusiness: setActiveBusinessState,
      refreshWorkspace,
      enterWorkspaceMode,
      exitWorkspaceMode,
    }),
    [
      tenants,
      tenantId,
      businessId,
      activeBusiness,
      activeProduct,
      loading,
      workspaceMode,
      setTenantId,
      switchBusiness,
      switchProduct,
      subscribeProduct,
      setActiveBusinessState,
      refreshWorkspace,
      enterWorkspaceMode,
      exitWorkspaceMode,
    ],
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
