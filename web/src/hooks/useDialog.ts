import { useCallback, useState } from 'react';

export function useDialog<T = unknown>() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<T | null>(null);

  const show = useCallback((p?: T) => {
    setPayload(p ?? null);
    setOpen(true);
  }, []);
  const hide = useCallback(() => setOpen(false), []);

  return { open, payload, show, hide } as const;
}
