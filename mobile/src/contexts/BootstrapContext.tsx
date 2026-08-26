import React, { createContext, useContext, useMemo } from 'react';
import type { MobileBootstrapResponse } from '@ie-orbit/sdk';
import { useMobileBootstrap } from '../hooks/useMobileBootstrap';
import { applyMobileBranding, type BrandTheme } from '../theme/brandTheme';
import { mobileRuntime, resolveFlavorBranding } from '../config/flavors';

type BootstrapState = {
  bootstrap: MobileBootstrapResponse | null;
  branding: BrandTheme;
  loading: boolean;
  error: string | null;
};

const BootstrapContext = createContext<BootstrapState | undefined>(undefined);

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const { bootstrap, error, loading } = useMobileBootstrap();
  const branding = useMemo(
    () => (bootstrap ? applyMobileBranding(bootstrap) : resolveFlavorBranding()),
    [bootstrap],
  );

  const value = useMemo(
    () => ({ bootstrap, branding, loading, error }),
    [bootstrap, branding, loading, error],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap() {
  const ctx = useContext(BootstrapContext);
  if (!ctx) throw new Error('useBootstrap must be used within BootstrapProvider');
  return ctx;
}

export function useBusinessContext() {
  const { bootstrap, branding } = useBootstrap();
  return {
    tenantId: bootstrap?.tenant_id ?? '',
    tenantSlug: bootstrap?.tenant_slug ?? branding?.tenantSlug ?? '',
    businessCode: bootstrap?.business_code ?? branding?.businessCode ?? '',
  };
}

export function useAppTitle() {
  const { branding } = useBootstrap();
  return branding?.appName ?? 'Orbit Appoint';
}

export function isBootstrapRequired() {
  return !mobileRuntime.isDevMode;
}
