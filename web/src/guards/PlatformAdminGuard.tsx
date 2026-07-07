import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const PLATFORM_ROLES = new Set(['platform_admin', 'super_admin']);

export function PlatformAdminGuard() {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;
  const hasRole = (auth.user.roles ?? []).some((role) => PLATFORM_ROLES.has(role));
  if (!hasRole) return <Navigate to="/403" replace />;
  return <Outlet />;
}
