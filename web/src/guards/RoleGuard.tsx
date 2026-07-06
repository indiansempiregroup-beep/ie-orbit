import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Outlet } from 'react-router-dom';

export function RoleGuard({ role }: { role: string }) {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;
  const has = (auth.user.roles ?? []).includes(role);
  if (!has) return <Navigate to="/403" replace />;
  return <Outlet />;
}
