import { useCallback, useEffect, useState } from 'react';
import type { MobileBooking } from '@ie-platform/sdk';
import { mobileClient } from '../api/client';
import { useBusinessContext } from '../contexts/BootstrapContext';

export function useMobileBookings(options?: { upcoming?: boolean; status?: string }) {
  const { tenantSlug, businessCode } = useBusinessContext();
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!tenantSlug || !businessCode) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.listBookings({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        upcoming: options?.upcoming,
        status: options?.status,
      });
      setBookings(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode, options?.upcoming, options?.status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bookings, loading, error, reload };
}
