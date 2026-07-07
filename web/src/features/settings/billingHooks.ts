import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingCheckoutInput } from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function useBillingStatusQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['billing', 'status'],
    queryFn: async () => (await client.billing.status()).data,
  });
}

export function useBillingCheckout() {
  const client = useApiClient();
  const workspace = useWorkspace();
  return useMutation({
    mutationFn: async (input: Omit<BillingCheckoutInput, 'business_id'>) => {
      const response = await client.billing.checkout({
        ...input,
        business_id: workspace.businessId ?? undefined,
      });
      return response.data;
    },
  });
}
