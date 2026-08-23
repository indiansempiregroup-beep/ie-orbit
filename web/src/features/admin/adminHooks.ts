import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PlatformPlanPackageUpsertInput,
  PlatformAuditQuery,
  PlatformUserSearchParams,
  WhiteLabelProfile,
} from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';

export function usePlatformTenantsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: async () => (await client.platform.tenants()).data.tenants,
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

export function usePlatformUpiClaimsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'upi-claims'],
    queryFn: async () => (await client.platform.upiClaims({ limit: 100 })).data.claims,
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

export function usePlatformWhiteLabelProfilesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'white-label'],
    queryFn: async () => (await client.platform.whiteLabelProfiles()).data,
    retry: false,
  });
}

export function usePlatformWhiteLabelProfileQuery(businessId: string | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['platform', 'white-label', businessId],
    queryFn: async () => (await client.platform.whiteLabelProfile(businessId!)).data,
    enabled: Boolean(businessId),
    retry: false,
  });
}

export function useUpdateWhiteLabelProfileMutation(businessId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<WhiteLabelProfile>) =>
      (await client.platform.updateWhiteLabelProfile(businessId, body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'white-label'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'white-label', businessId] });
    },
  });
}

export function useInvalidatePlatform() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['platform'] });
  };
}
