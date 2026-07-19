import React, { useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { configureDateTimeZones } from '../utils/format';

/** Keeps display formatters in sync with user profile → business timezone. */
export function DateTimeZoneSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { bootstrap } = useBootstrap();
  const userTimezone = user?.timezone ?? '';
  const businessTimezone = bootstrap?.business?.timezone ?? '';

  useEffect(() => {
    configureDateTimeZones({
      userTimezone,
      businessTimezone,
    });
  }, [userTimezone, businessTimezone]);

  const zoneKey = useMemo(
    () => `${userTimezone}|${businessTimezone}`,
    [userTimezone, businessTimezone],
  );

  return <React.Fragment key={zoneKey}>{children}</React.Fragment>;
}
