import { useCallback, useEffect, useState } from 'react';
import type { MobileStaffMember } from '@ie-platform/sdk';
import { mobileClient } from '../api/client';
import { useBusinessContext } from '../contexts/BootstrapContext';

export function useMobileStaff(serviceId?: string | null) {
  const { tenantSlug, businessCode } = useBusinessContext();
  const [staff, setStaff] = useState<MobileStaffMember[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!tenantSlug || !businessCode) {
      setStaff([]);
      return;
    }
    setLoading(true);
    try {
      const response = await mobileClient.mobile.listStaff({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        service_id: serviceId || undefined,
      });
      setStaff(response.data);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode, serviceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { staff, loading, reload };
}
