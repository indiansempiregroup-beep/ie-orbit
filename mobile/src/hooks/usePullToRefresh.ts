import { useCallback, useRef, useState } from 'react';

const MIN_REFRESH_MS = 500;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function usePullToRefresh(refreshFn: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshFnRef = useRef(refreshFn);
  refreshFnRef.current = refreshFn;

  const onRefresh = useCallback(() => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    const started = Date.now();

    void (async () => {
      try {
        await refreshFnRef.current();
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < MIN_REFRESH_MS) {
          await sleep(MIN_REFRESH_MS - elapsed);
        }
        setRefreshing(false);
      }
    })();
  }, [refreshing]);

  return { refreshing, onRefresh };
}
