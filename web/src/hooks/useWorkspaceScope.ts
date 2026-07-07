import { useWorkspace } from '../contexts/WorkspaceContext';

/** Shared workspace scope for React Query keys and enabled guards. */
export function useWorkspaceScope() {
  const workspace = useWorkspace();
  const tenantId = workspace.tenantId;
  const businessId = workspace.businessId;

  return {
    tenantId,
    businessId,
    activeProduct: workspace.activeProduct,
    activeBusiness: workspace.activeBusiness,
    workspaceReady: Boolean(tenantId) && Boolean(businessId),
    scopeKey: [tenantId ?? 'none', businessId ?? 'none'] as const,
  };
}
