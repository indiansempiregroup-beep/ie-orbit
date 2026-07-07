import React, { useEffect, useMemo, useState } from 'react';
import { useBootstrap } from '../contexts/BootstrapContext';
import { resolveFlavorBranding } from '../config/flavors';
import { applyMobileBranding } from '../theme/brandTheme';
import { SplashBackdrop, SplashScreen } from '../components/SplashScreen';

const SPLASH_DURATION_MS = 3000;

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { bootstrap, error } = useBootstrap();
  const [dismissed, setDismissed] = useState(false);
  const fallbackBranding = useMemo(() => resolveFlavorBranding(), []);

  const bootstrapSettled = bootstrap !== null || Boolean(error);
  const splashBranding = useMemo(
    () => (bootstrap ? applyMobileBranding(bootstrap) : fallbackBranding),
    [bootstrap, fallbackBranding],
  );
  const businessName =
    bootstrap?.business?.display_name ?? bootstrap?.app_name ?? splashBranding.appName;

  useEffect(() => {
    if (!bootstrapSettled || dismissed) return undefined;
    const timer = setTimeout(() => setDismissed(true), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bootstrapSettled, dismissed]);

  if (!bootstrapSettled) {
    return <SplashBackdrop branding={fallbackBranding} />;
  }

  if (!dismissed) {
    return <SplashScreen branding={splashBranding} businessName={businessName} />;
  }

  return <>{children}</>;
}
