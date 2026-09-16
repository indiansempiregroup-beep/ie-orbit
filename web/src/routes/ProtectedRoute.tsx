import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { safeNextPath } from '../lib/authRedirect';
import { hasTenantOpsRole, needsEmailVerification, VERIFY_EMAIL_PATH } from '../utils/roles';
import { OpsMobileRedirect } from '../components/OpsMobileRedirect';

export function ProtectedRoute() {
  const auth = useAuthContext();
  const workspace = useWorkspace();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb', color: '#111827' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!auth.token) {
    const next = safeNextPath(`${location.pathname}${location.search}`);
    return <Navigate to={next ? `/auth?next=${encodeURIComponent(next)}` : '/auth'} replace />;
  }

  if (needsEmailVerification(auth.user)) {
    return <Navigate to={VERIFY_EMAIL_PATH} replace />;
  }

  if (hasTenantOpsRole(auth.user)) {
    return <OpsMobileRedirect />;
  }

  if (workspace.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb', color: '#111827' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
          Loading workspace…
        </div>
      </div>
    );
  }

  return <Outlet />;
}
