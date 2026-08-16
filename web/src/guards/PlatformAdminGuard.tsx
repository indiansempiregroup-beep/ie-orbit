import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { hasTenantOpsRole, isPlatformAdmin } from '../utils/roles';
import { OpsMobileRedirect } from '../components/OpsMobileRedirect';

export function PlatformAdminGuard() {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;
  if (hasTenantOpsRole(auth.user)) return <OpsMobileRedirect />;
  if (!isPlatformAdmin(auth.user)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
