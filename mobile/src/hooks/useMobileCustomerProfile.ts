import { useCallback, useEffect, useState } from 'react';
import type { MobileCustomerProfile } from '@ie-platform/sdk';
import { mobileClient } from '../api/client';
import { useBusinessContext } from '../contexts/BootstrapContext';

export function useMobileCustomerProfile(enabled = true) {
  const { tenantSlug, businessCode } = useBusinessContext();
  const [profile, setProfile] = useState<MobileCustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !tenantSlug || !businessCode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.getCustomerProfile({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setProfile(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customer profile.');
    } finally {
      setLoading(false);
    }
  }, [enabled, tenantSlug, businessCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profile, loading, error, reload };
}
