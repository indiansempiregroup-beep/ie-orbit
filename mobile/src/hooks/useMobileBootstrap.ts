import { useEffect, useState } from 'react';
import type { MobileBootstrapResponse } from '@ie-orbit/sdk';
import { mobileClient } from '../api/client';
import { resolveBootstrapQuery } from '../config/flavors';

export function useMobileBootstrap() {
  const [bootstrap, setBootstrap] = useState<MobileBootstrapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = resolveBootstrapQuery();
        const response = await mobileClient.mobile.bootstrap(query);
        if (active) setBootstrap(response.data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load bootstrap.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return { bootstrap, error, loading };
}
