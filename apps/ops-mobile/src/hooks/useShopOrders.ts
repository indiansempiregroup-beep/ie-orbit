import { useCallback, useState } from 'react';
import type { ShopOrder } from '@ie-orbit/sdk';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../utils/format';
import { useOpsClient } from './useOpsClient';

function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.items)) return record.items as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}

export function useShopOrders(enabled = true) {
  const client = useOpsClient();
  const { businessId, ready } = useWorkspace();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !client || !ready || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listOrders({ business_id: businessId });
      setOrders(asList<ShopOrder>(response.data));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load orders'));
    } finally {
      setLoading(false);
    }
  }, [enabled, client, ready, businessId]);

  return { orders, loading, error, reload };
}
