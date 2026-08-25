import { useQuery } from '@tanstack/react-query';
import type { Business } from '@ie-orbit/sdk';
import { useAuth } from './useAuth';
import { useApiClient } from './useApiClient';
import { useWorkspaceScope } from './useWorkspaceScope';

/**
 * Single source of truth for the active business profile in the current workspace.
 */
export function useActiveBusiness() {
  const auth = useAuth();
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();

  return useQuery<Business, Error>({
    queryKey: ['workspace', 'business', ...scopeKey],
    queryFn: async () => {
      if (!businessId) {
        const response = await client.businesses.me();
        return response.data;
      }
      const response = await client.businesses.get(businessId);
      return response.data;
    },
    enabled: Boolean(auth.token) && workspaceReady,
    staleTime: 1000 * 60 * 5,
  });
}
