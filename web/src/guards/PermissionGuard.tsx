import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Outlet } from 'react-router-dom';

export function PermissionGuard({ permission }: { permission: string }) {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;
  const has = (auth.user.permissions ?? []).includes(permission);
  if (!has) return <Navigate to="/403" replace />;
  return <Outlet />;
}
