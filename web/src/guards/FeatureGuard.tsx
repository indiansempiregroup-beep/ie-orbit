import React from 'react';
import { isFeatureEnabled } from '../services/featureFlags';
import { Navigate, Outlet } from 'react-router-dom';

export function FeatureGuard({ feature }: { feature: string }) {
  const enabled = isFeatureEnabled(feature);
  if (!enabled) return <Navigate to="/404" replace />;
  return <Outlet />;
}
