import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

export function ProtectedRoute() {
  const auth = useAuthContext();
  const workspace = useWorkspace();

  if (auth.loading || (auth.token && workspace.loading)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fb', color: '#111827' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!auth.token) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
