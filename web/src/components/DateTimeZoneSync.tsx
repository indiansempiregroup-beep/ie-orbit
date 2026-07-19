import React, { useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { configureDateTimeZones } from '../lib/datetime';

/** Keeps display formatters in sync with user profile → business timezone. */
export function DateTimeZoneSync({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { activeBusiness } = useWorkspace();
  const userTimezone = auth.user?.timezone ?? '';
  const businessTimezone = activeBusiness?.timezone ?? '';

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
