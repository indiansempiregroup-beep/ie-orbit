import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBootstrap } from '../contexts/BootstrapContext';
import { resolveFlavorBranding } from '../config/flavors';
import { applyMobileBranding } from '../theme/brandTheme';
import { SplashScreen } from '../components/SplashScreen';
import { customerAppFeatures } from '../utils/customerFeatures';

const SPLASH_DURATION_MS = 3000;

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { bootstrap, error } = useBootstrap();
  const [dismissed, setDismissed] = useState(false);
  const [logoSettled, setLogoSettled] = useState(false);
  const fallbackBranding = useMemo(() => resolveFlavorBranding(), []);

  const bootstrapSettled = bootstrap !== null || Boolean(error);
  const splashBranding = useMemo(
    () => (bootstrap ? applyMobileBranding(bootstrap) : fallbackBranding),
    [bootstrap, fallbackBranding],
  );
  const businessName =
    bootstrap?.business?.display_name ?? bootstrap?.app_name ?? splashBranding.appName;
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const tagline =
    showBooking && showShop
      ? 'Book, shop, and stay connected'
      : showShop
        ? 'Your shop, in your pocket'
        : 'Your appointments, beautifully managed';
  const waitingForLogo = bootstrapSettled && Boolean(splashBranding.logo) && !logoSettled && !error;
  const canStartTimer = bootstrapSettled && !waitingForLogo;
  const onLogoSettled = useCallback(() => setLogoSettled(true), []);

  useEffect(() => {
    setLogoSettled(false);
  }, [splashBranding.logo]);

  useEffect(() => {
    if (!canStartTimer || dismissed) return undefined;
    const timer = setTimeout(() => setDismissed(true), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [canStartTimer, dismissed]);

  if (!dismissed) {
    return (
      <SplashScreen
        branding={splashBranding}
        businessName={businessName}
        tagline={tagline}
        expectingLogo={!bootstrapSettled || Boolean(splashBranding.logo && !logoSettled && !error)}
        onLogoSettled={onLogoSettled}
      />
    );
  }

  return <>{children}</>;
}
