import { useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { redirectToOpsMobileWeb } from '../lib/impersonation';

export function OpsMobileRedirect({ tenantId }: { tenantId?: string | null }) {
  const workspace = useWorkspace();
  const nextTenantId = tenantId ?? workspace.tenantId;

  useEffect(() => {
    redirectToOpsMobileWeb({ tenantId: nextTenantId });
  }, [nextTenantId]);

  return <p role="status">Opening your workspace…</p>;
}
