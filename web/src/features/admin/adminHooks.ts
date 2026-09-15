import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PlatformPlanPackageUpsertInput,
  PlatformAuditQuery,
  PlatformUserSearchParams,
  PlatformAnalyticsQuery,
} from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';

export function usePlatformTenantsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: async () => (await client.platform.tenants()).data.tenants,
    retry: false,
  });
}

export function usePlatformAnalyticsQuery(params: PlatformAnalyticsQuery, enabled = true) {
  const client = useApiClient();
  const normalized = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  ) as PlatformAnalyticsQuery;
  return useQuery({
    queryKey: ['platform', 'analytics', normalized],
    queryFn: async () => (await client.platform.analytics(normalized)).data,
    enabled,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function usePlatformTenantDetailQuery(tenantId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenant', tenantId],
    queryFn: async () => (await client.platform.tenant(tenantId!)).data,
    enabled: Boolean(tenantId),
    retry: false,
  });
}

export function usePlatformTenantUsersQuery(tenantId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenant', tenantId, 'users'],
    queryFn: async () => (await client.platform.tenantUsers(tenantId!)).data.users,
    enabled: Boolean(tenantId),
    retry: false,
  });
}

export function usePlatformTenantFlagsQuery(tenantId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenant', tenantId, 'flags'],
    queryFn: async () => (await client.platform.tenantFlags(tenantId!)).data.flags,
    enabled: Boolean(tenantId),
    retry: false,
  });
}

export function usePlatformTenantPaymentsQuery(tenantId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenant', tenantId, 'payments'],
    queryFn: async () => (await client.platform.tenantPayments(tenantId!)).data.payments,
    enabled: Boolean(tenantId),
    retry: false,
  });
}

export function usePlatformUpiClaimsQuery(scope: 'pending' | 'history' | 'all' = 'pending') {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'upi-claims', scope],
    queryFn: async () => (await client.platform.upiClaims({ limit: 100, scope })).data.claims,
    retry: false,
  });
}

export function usePlatformTenantCreditsQuery(tenantId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenant', tenantId, 'credits'],
    queryFn: async () => (await client.platform.tenantCredits(tenantId!)).data.balance_paise,
    enabled: Boolean(tenantId),
    retry: false,
  });
}

export function usePlatformAuditQuery(filters: PlatformAuditQuery = {}) {
  const client = useApiClient();
  const normalized = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  ) as PlatformAuditQuery;
  return useQuery({
    queryKey: ['platform', 'audit', normalized],
    queryFn: async () => (await client.platform.audit(normalized)).data,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function usePlatformTicketsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tickets'],
    queryFn: async () => (await client.platform.tickets()).data.tickets,
    retry: false,
  });
}

export function usePlatformTicketQuery(ticketId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tickets', ticketId],
    queryFn: async () => (await client.platform.ticket(ticketId!)).data,
    enabled: Boolean(ticketId),
    retry: false,
  });
}

export function usePlatformUserSearchQuery(params: PlatformUserSearchParams) {
  const client = useApiClient();
  const normalized: PlatformUserSearchParams = { ...params, q: (params.q ?? '').trim() || undefined };
  return useQuery({
    queryKey: ['platform', 'users', 'search', normalized],
    queryFn: async () => (await client.platform.searchUsers(normalized)).data,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

export function usePlatformAnnouncementsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'announcements'],
    queryFn: async () => (await client.platform.announcements()).data.announcements,
    retry: false,
  });
}

export function usePlatformHelpArticlesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'help'],
    queryFn: async () => (await client.platform.helpArticlesAdmin()).data.articles,
    retry: false,
  });
}

export function usePlatformCouponsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'coupons'],
    queryFn: async () => (await client.platform.coupons()).data.coupons,
    retry: false,
  });
}

export function useUpsertCouponMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      code: string;
      percent_off?: number;
      amount_off_paise?: number;
      is_active?: boolean;
      reason: string;
    }) => (await client.platform.upsertCoupon(body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'coupons'] });
    },
  });
}

export function usePlatformPlanPackagesQuery(productCode?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'plan-packages', productCode ?? 'all'],
    queryFn: async () => (await client.platform.planPackages(productCode ? { product_code: productCode } : undefined)).data.plan_packages,
    retry: false,
  });
}

export function useUpsertPlanPackageMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PlatformPlanPackageUpsertInput) => (await client.platform.upsertPlanPackage(body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'plan-packages'] });
    },
  });
}

export function usePlatformAddonPricingQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'addon-pricing'],
    queryFn: async () => (await client.platform.addonPricing()).data,
    retry: false,
  });
}

export function useUpdateAddonPricingMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      staff_price_paise: number;
      office_price_paise: number;
      pets_price_paise: number;
      reason: string;
    }) => (await client.platform.updateAddonPricing(body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'addon-pricing'] });
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
  });
}

export function usePlatformAuthSettingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'auth-settings'],
    queryFn: async () => (await client.platform.authSettings()).data,
    retry: false,
  });
}

export function useUpdatePlatformAuthSettingsMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      tenant_slug: string | null;
      business_code: string | null;
      reason: string;
    }) => (await client.platform.updateAuthSettings(body)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'auth-settings'] });
    },
  });
}

export function usePlatformCustomerAppQuery(businessId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'customer-app', businessId],
    queryFn: async () => (await client.platform.customerApp(businessId!)).data,
    enabled: Boolean(businessId),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      const preview = data?.recipe?.preview as { status?: string } | undefined;
      const production = data?.recipe?.production as { status?: string } | undefined;
      const active = [preview?.status, production?.status].some(
        (status) => status === 'queued' || status === 'in_progress',
      );
      return active ? 15_000 : false;
    },
  });
}

export function useInvalidatePlatform() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['platform'] });
  };
}
