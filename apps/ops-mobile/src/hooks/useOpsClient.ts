import { useMemo } from 'react';
import { createScopedClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

export function useOpsClient() {
  const { token } = useAuth();
  const { tenantId, businessId } = useWorkspace();

  return useMemo(() => {
    if (!token) return null;
    return createScopedClient(token, tenantId, businessId);
  }, [token, tenantId, businessId]);
}
