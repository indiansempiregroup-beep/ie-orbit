import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WhiteLabelProfile } from '@ie-platform/sdk';
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
