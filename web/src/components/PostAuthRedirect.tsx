import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { getPostLoginPath, hasTenantOpsRole } from '../utils/roles';
import { OpsMobileRedirect } from './OpsMobileRedirect';

/** Business owners, managers, and staff use Expo ops web. Platform admins stay on this app. */
export function PostAuthRedirect() {
  const auth = useAuthContext();
  if (hasTenantOpsRole(auth.user)) {
    return <OpsMobileRedirect />;
  }
  return <Navigate to={getPostLoginPath(auth.user)} replace />;
}
