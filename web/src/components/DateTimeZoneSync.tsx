import React, { useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { configureBusinessCurrency } from '../lib/currency';
import { configureDateTimeZones } from '../lib/datetime';

/** Keeps display formatters in sync with business timezone and currency. */
export function DateTimeZoneSync({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { activeBusiness } = useWorkspace();
  const userTimezone = auth.user?.timezone ?? '';
  const businessTimezone = activeBusiness?.timezone ?? '';
  const businessCurrency = activeBusiness?.currency ?? '';

  useEffect(() => {
    configureDateTimeZones({
      userTimezone,
      businessTimezone,
    });
  }, [userTimezone, businessTimezone]);

  useEffect(() => {
    configureBusinessCurrency(businessCurrency);
  }, [businessCurrency]);

  const zoneKey = useMemo(
    () => `${userTimezone}|${businessTimezone}`,
    [userTimezone, businessTimezone],
  );

  return <React.Fragment key={zoneKey}>{children}</React.Fragment>;
}
