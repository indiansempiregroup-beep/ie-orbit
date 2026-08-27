import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import {
  adminAppIsSeparateHost,
  getPublicSiteOrigin,
  isAdminAppHost,
  isPublicMarketingPath,
} from '../lib/hosts';
import { continueAfterAuth, redirectToAdminApp } from '../lib/authRedirect';
import { isPlatformAdmin, needsEmailVerification, VERIFY_EMAIL_PATH } from '../utils/roles';

function Status({ children }: { children: string }) {
  return <p role="status">{children}</p>;
}

/** Splits the public marketing site and Platform Admin across configured hosts. */
export function HostGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const auth = useAuthContext();
  const separate = adminAppIsSeparateHost();
  const onAdmin = separate && isAdminAppHost();
  const path = location.pathname;
  const suffix = `${path}${location.search}${location.hash}`;

  useEffect(() => {
    if (!separate) return;
    if (onAdmin && path === '/' && auth.user && !isPlatformAdmin(auth.user) && !needsEmailVerification(auth.user)) {
      continueAfterAuth(auth.user, (next) => {
        window.location.assign(next);
      });
      return;
    }
    if (onAdmin && path !== '/' && isPublicMarketingPath(path)) {
      window.location.replace(`${getPublicSiteOrigin()}${suffix}`);
      return;
    }
    if (!onAdmin && path.startsWith('/admin')) {
      redirectToAdminApp(suffix);
    }
  }, [separate, onAdmin, path, suffix, auth.user]);

  if (!separate) {
    return children;
  }

  if (onAdmin && path === '/') {
    if (auth.loading) return <Status>Opening admin…</Status>;
    if (auth.user && needsEmailVerification(auth.user)) {
      return <Navigate to={VERIFY_EMAIL_PATH} replace />;
    }
    if (auth.user && isPlatformAdmin(auth.user)) {
      return <Navigate to="/admin" replace />;
    }
    if (auth.user) {
      return <Status>Opening your workspace…</Status>;
    }
    return <Navigate to="/auth" replace />;
  }

  if (onAdmin && isPublicMarketingPath(path)) {
    return <Status>Opening IE Orbit…</Status>;
  }

  if (!onAdmin && path.startsWith('/admin')) {
    return <Status>Opening platform admin…</Status>;
  }

  return children;
}
