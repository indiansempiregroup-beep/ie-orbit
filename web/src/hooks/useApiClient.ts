import { useMemo } from 'react';
import { createAuthenticatedClient } from '../lib/apiClient';
import { useAuth } from './useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';

export function useApiClient() {
  const auth = useAuth();
  const workspace = useWorkspace();

  return useMemo(
    () => createAuthenticatedClient(auth.token, workspace.tenantId, workspace.businessId),
    [auth.token, workspace.tenantId, workspace.businessId],
  );
}

export default useApiClient;
