import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { mobileClient } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessContext } from '../contexts/BootstrapContext';
import {
  clearPendingReferral,
  readPendingReferral,
  referralFromUrl,
  savePendingReferral,
} from '../utils/referralLinks';

export function ReferralLinkHandler() {
  const { user } = useAuth();
  const { tenantSlug, businessCode } = useBusinessContext();
  const applying = useRef(false);
  const [pendingVersion, setPendingVersion] = useState(0);

  useEffect(() => {
    const capture = async (url: string | null) => {
      if (!url) return;
      const referral = referralFromUrl(url);
      if (referral) {
        await savePendingReferral(referral);
        setPendingVersion((value) => value + 1);
      }
    };
    void Linking.getInitialURL().then(capture);
    const subscription = Linking.addEventListener('url', ({ url }) => void capture(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!user || !tenantSlug || !businessCode || applying.current) return;
    applying.current = true;
    void (async () => {
      const pending = await readPendingReferral();
      if (!pending) return;
      if (
        (pending.tenantSlug && pending.tenantSlug !== tenantSlug) ||
        (pending.businessCode && pending.businessCode !== businessCode)
      ) {
        return;
      }
      try {
        await mobileClient.mobile.applyReferral({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          referral_code: pending.code,
        });
      } catch {
        // Invalid, self, or already-used codes should not block app startup.
      } finally {
        await clearPendingReferral();
      }
    })().finally(() => {
      applying.current = false;
    });
  }, [user, tenantSlug, businessCode, pendingVersion]);

  return null;
}
