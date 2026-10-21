import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { isManagerOrAbove } from '../utils/roles';

let currentStaffId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function useReportStaffFilter() {
  const auth = useAuth();
  const canFilter = isManagerOrAbove(auth.user);
  const [staffId, setStaffIdState] = useState<string | null>(canFilter ? currentStaffId : null);

  useEffect(() => {
    const listener = () => setStaffIdState(canFilter ? currentStaffId : null);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, [canFilter]);

  const setStaffId = useCallback(
    (next: string | null) => {
      if (!canFilter) return;
      currentStaffId = next;
      emit();
    },
    [canFilter],
  );

  return { staffId: canFilter ? staffId : null, setStaffId, canFilter };
}
