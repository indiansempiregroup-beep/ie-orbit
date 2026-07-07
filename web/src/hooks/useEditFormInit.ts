import { useEffect, useRef } from 'react';

/**
 * Initialize edit form state when a dialog opens, without resetting while it stays open.
 */
export function useEditFormInit<T>(open: boolean, data: T | undefined, init: (data: T) => void) {
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current && data) {
      init(data);
    }
    wasOpen.current = open;
  }, [open, data, init]);
}
