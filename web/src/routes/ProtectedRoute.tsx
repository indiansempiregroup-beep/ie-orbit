import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const auth = useAuthContext();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.token) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
