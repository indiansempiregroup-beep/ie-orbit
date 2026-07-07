import { useEffect } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';

/** Keeps a form `business` field aligned with the active workspace business. */
export function useActiveBusinessFormField(
  active: boolean,
  businessId: string,
  setBusinessId: (businessId: string) => void,
) {
  const workspace = useWorkspace();

  useEffect(() => {
    if (!active || !workspace.businessId) return;
    if (businessId !== workspace.businessId) {
      setBusinessId(workspace.businessId);
    }
  }, [active, businessId, setBusinessId, workspace.businessId]);
}

export function useBusinessFormChange(
  setBusinessId: (businessId: string) => void,
) {
  const workspace = useWorkspace();

  return (nextBusinessId: string) => {
    setBusinessId(nextBusinessId);
    if (nextBusinessId && nextBusinessId !== workspace.businessId) {
      workspace.setBusinessId(nextBusinessId);
    }
  };
}
