import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { hasTenantOpsRole, isPlatformAdmin, isPlatformAdminOnly } from '../utils/roles';

/** Blocks platform-admin-only accounts from tenant operations; dual-role must opt into workspace mode. */
export function TenantOpsGuard() {
  const auth = useAuth();
  const { workspaceMode, enterWorkspaceMode, loading } = useWorkspace();
  const dualRoleNeedsWorkspace =
    Boolean(auth.user) &&
    isPlatformAdmin(auth.user) &&
    hasTenantOpsRole(auth.user) &&
    !workspaceMode;

  useEffect(() => {
    if (dualRoleNeedsWorkspace) {
      void enterWorkspaceMode();
    }
  }, [dualRoleNeedsWorkspace, enterWorkspaceMode]);

  if (auth.loading) {
    return <p role="status">Loading…</p>;
  }

  if (isPlatformAdminOnly(auth.user)) {
    return <Navigate to="/admin" replace />;
  }

  if (dualRoleNeedsWorkspace || (isPlatformAdmin(auth.user) && hasTenantOpsRole(auth.user) && loading && !workspaceMode)) {
    return <p role="status">Opening workspace…</p>;
  }

  return <Outlet />;
}
