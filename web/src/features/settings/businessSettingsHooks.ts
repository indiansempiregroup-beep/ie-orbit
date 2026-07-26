import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createAuthenticatedClient } from '../../lib/apiClient';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  cancelPendingBusinessProductPlan,
  changeBusinessProductPlan,
  createBusinessProfile,
  listBusinessProfiles,
  listProductPlans,
  subscribeBusinessProduct,
  unsubscribeBusinessProduct,
  updateActiveBusinessProfile,
  updateBusinessProfile,
} from './businessSettingsApi';
import type { Business, BusinessCreateInput, BusinessUpdateInput, ProductPlan } from '@ie-platform/sdk';

import { useActiveBusiness } from '../../hooks/useActiveBusiness';

export function useBusinessProfileQuery() {
  return useActiveBusiness();
}

export function useTenantBrandingQuery() {
  const auth = useAuth();
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['settings', 'tenant-branding', workspace.tenantId ?? 'default'],
    queryFn: async () => {
      if (!workspace.tenantId) return null;
      const client = createAuthenticatedClient(auth.token, workspace.tenantId);
      const response = await client.tenants.get(workspace.tenantId);
      const tenant = response.data as {
        primary_color?: string | null;
        secondary_color?: string | null;
        branding?: { theme_mode?: string | null } | null;
      };
      return {
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
        theme_mode: tenant.branding?.theme_mode,
      };
    },
    enabled: Boolean(auth.token && workspace.tenantId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBusinessListQuery() {
  const auth = useAuth();
  const workspace = useWorkspace();
  return useQuery<Business[], Error>({
    queryKey: ['settings', 'businesses', workspace.tenantId ?? 'default'],
    queryFn: () => listBusinessProfiles(auth.token, workspace.tenantId),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 5,
  });
}

export function useBusinessProfileUpdate() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, BusinessUpdateInput>({
    mutationFn: (business) => {
      if (!workspace.businessId) {
        return updateActiveBusinessProfile(auth.token, workspace.tenantId, business);
      }
      return updateBusinessProfile(auth.token, workspace.tenantId, workspace.businessId, business);
    },
    onSuccess: () => {
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useCreateBusiness() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, BusinessCreateInput>({
    mutationFn: (business) => createBusinessProfile(auth.token, workspace.tenantId, business),
    onSuccess: (business) => {
      if (business.id) {
        workspace.switchBusiness(business.id);
      }
      invalidateWorkspaceData(queryClient);
      void workspace.refreshWorkspace();
    },
  });
}

export function useBusinessProductUpdate() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, string>({
    mutationFn: async (productId) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before changing product.');
      }
      return updateBusinessProfile(auth.token, workspace.tenantId, workspace.businessId, {
        selected_product: productId,
      });
    },
    onSuccess: (business) => {
      workspace.setActiveBusiness(business);
      invalidateWorkspaceData(queryClient);
      void workspace.refreshWorkspace();
    },
  });
}

export function useProductPlansQuery(productCode?: string) {
  const auth = useAuth();
  const workspace = useWorkspace();
  return useQuery<ProductPlan[], Error>({
    queryKey: ['settings', 'product-plans', productCode ?? 'all', workspace.tenantId ?? 'default'],
    queryFn: () => listProductPlans(auth.token, workspace.tenantId, productCode),
    enabled: Boolean(auth.token),
    staleTime: 1000 * 60 * 30,
  });
}

export function useBusinessProductSubscribe() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, { productCode: string; setActive?: boolean; planCode?: string }>({
    mutationFn: async ({ productCode, setActive = true, planCode }) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before subscribing to a product.');
      }
      return subscribeBusinessProduct(
        auth.token,
        workspace.tenantId,
        workspace.businessId,
        productCode,
        { setActive, planCode },
      );
    },
    onSuccess: (business) => {
      workspace.setActiveBusiness(business);
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useBusinessProductUnsubscribe() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, string>({
    mutationFn: async (productCode) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before unsubscribing from a product.');
      }
      return unsubscribeBusinessProduct(auth.token, workspace.tenantId, workspace.businessId, productCode);
    },
    onSuccess: (business) => {
      workspace.setActiveBusiness(business);
      invalidateWorkspaceData(queryClient);
    },
  });
}

export function useBusinessProductPlanChange() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, { productCode: string; planCode: string }>({
    mutationFn: async ({ productCode, planCode }) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before changing a product plan.');
      }
      return changeBusinessProductPlan(
        auth.token,
        workspace.tenantId,
        workspace.businessId,
        productCode,
        planCode,
      );
    },
    onSuccess: (business) => {
      workspace.setActiveBusiness(business);
      invalidateWorkspaceData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['business-billing-snapshot'] });
    },
  });
}

export function useCancelPendingProductPlanChange() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation<Business, Error, { productCode: string }>({
    mutationFn: async ({ productCode }) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before canceling a pending plan change.');
      }
      return cancelPendingBusinessProductPlan(
        auth.token,
        workspace.tenantId,
        workspace.businessId,
        productCode,
      );
    },
    onSuccess: (business) => {
      workspace.setActiveBusiness(business);
      invalidateWorkspaceData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['business-billing-snapshot'] });
    },
  });
}
