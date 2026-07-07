import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Branch, BranchCreateInput, BranchUpdateInput } from '@ie-platform/sdk';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createBranch, listBranches, updateBranch } from './branchesApi';

export function useBranchesQuery() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const businessId = workspace.businessId;

  return useQuery<Branch[], Error>({
    queryKey: ['settings', 'branches', workspace.tenantId ?? 'default', businessId ?? 'none'],
    queryFn: () => {
      if (!businessId) {
        throw new Error('Select a business before loading branches.');
      }
      return listBranches(auth.token, workspace.tenantId, businessId);
    },
    enabled: Boolean(auth.token) && Boolean(businessId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateBranch() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<Branch, Error, BranchCreateInput>({
    mutationFn: (branch) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before creating a branch.');
      }
      return createBranch(auth.token, workspace.tenantId, workspace.businessId, branch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'branches'] });
    },
  });
}

export function useUpdateBranch() {
  const auth = useAuth();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation<Branch, Error, { branchId: string; branch: BranchUpdateInput }>({
    mutationFn: ({ branchId, branch }) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before updating a branch.');
      }
      return updateBranch(auth.token, workspace.tenantId, workspace.businessId, branchId, branch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'branches'] });
    },
  });
}
