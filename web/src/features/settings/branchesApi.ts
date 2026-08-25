import type { Branch, BranchCreateInput, BranchUpdateInput } from '@ie-orbit/sdk';
import { createAuthenticatedClient } from '../../lib/apiClient';

export async function listBranches(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
) {
  const response = await createAuthenticatedClient(token, tenantId, businessId).businesses.branches.list(businessId);
  return response.data;
}

export async function createBranch(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  branch: BranchCreateInput,
) {
  const response = await createAuthenticatedClient(token, tenantId, businessId).businesses.branches.create(
    businessId,
    branch,
  );
  return response.data;
}

export async function updateBranch(
  token: string | null,
  tenantId: string | null | undefined,
  businessId: string,
  branchId: string,
  branch: BranchUpdateInput,
) {
  const response = await createAuthenticatedClient(token, tenantId, businessId).businesses.branches.patch(
    businessId,
    branchId,
    branch,
  );
  return response.data;
}

export type { Branch, BranchCreateInput, BranchUpdateInput };
