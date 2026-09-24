import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function useAssistantAccessQuery(enabled = true) {
  const client = useApiClient();
  const { businessId } = useWorkspace();
  return useQuery({
    queryKey: ['assistant', 'access', businessId],
    queryFn: async () => (await client.assistant.access()).data,
    enabled: Boolean(businessId) && enabled,
    staleTime: 60_000,
  });
}
