import { useQuery } from '@tanstack/react-query';
import type { OperationsSearchResult } from '@ie-platform/sdk';
import { useApiClient } from './useApiClient';
import { useWorkspaceScope } from './useWorkspaceScope';

export function useGlobalSearch(term: string) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  const normalized = term.trim();

  return useQuery<OperationsSearchResult, Error>({
    queryKey: ['operations', 'search', ...scopeKey, normalized],
    queryFn: async () => {
      const response = await client.operations.search({ q: normalized });
      return response.data;
    },
    enabled: workspaceReady && normalized.length >= 2,
    staleTime: 1000 * 15,
  });
}
