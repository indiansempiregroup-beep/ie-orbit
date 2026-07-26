import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isPlatformAdmin } from '../utils/roles';

export function PlatformAdminGuard() {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;
  if (!isPlatformAdmin(auth.user)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
