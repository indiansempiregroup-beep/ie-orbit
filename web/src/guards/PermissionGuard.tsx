import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, Outlet } from 'react-router-dom';
import { hasAnyPermission, hasPermission } from '../utils/roles';

type Props = {
  permission?: string;
  anyPermissions?: string[];
};

export function PermissionGuard({ permission, anyPermissions }: Props) {
  const auth = useAuth();
  if (auth.loading) return <div>Loading…</div>;
  if (!auth.user) return <Navigate to="/auth" replace />;

  const allowed = permission
    ? hasPermission(auth.user, permission)
    : anyPermissions?.length
      ? hasAnyPermission(auth.user, anyPermissions)
      : true;

  if (!allowed) return <Navigate to="/403" replace />;
  return <Outlet />;
}
