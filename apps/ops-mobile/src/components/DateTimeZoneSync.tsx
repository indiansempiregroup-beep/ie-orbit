import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { configureDateTimeZones } from '../utils/format';

/** Keeps display formatters in sync with business (venue) → user timezone. */
export function DateTimeZoneSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeBusiness } = useWorkspace();
  const userTimezone = user?.timezone ?? '';
  const businessTimezone = activeBusiness?.timezone ?? '';

  useEffect(() => {
    configureDateTimeZones({
      userTimezone,
      businessTimezone,
    });
  }, [userTimezone, businessTimezone]);

  // Do not remount children when timezone hydrates — that remounted NavigationContainer
  // and looked like an app load failure on Expo Go.
  return <>{children}</>;
}
