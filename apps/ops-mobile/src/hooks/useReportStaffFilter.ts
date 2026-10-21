import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isManagerOrAbove } from '../utils/roles';

let currentStaffId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function useReportStaffFilter() {
  const { user } = useAuth();
  const canFilter = isManagerOrAbove(user);
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
