import React, { useEffect, useMemo, useState } from 'react';
import type { ShopProduct } from '@ie-orbit/sdk';
import { PICKER_PAGE_SIZE } from '@ie-orbit/sdk';
import { TypeaheadSelectField } from '../../components/TypeaheadSelectField';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from './posPayment';
import { CustomerPickerField } from '../management/EntityPickers';

export { CustomerPickerField as ShopCustomerPickerField };

type ProductPickerProps = {
  label: string;
  value: string;
  onChange: (id: string, product: ShopProduct | null) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  businessId?: string;
};

export function ShopProductPickerField({
  label,
  value,
  onChange,
  placeholder = 'Search products…',
  businessId: businessIdProp,
  ...rest
}: ProductPickerProps) {
  const client = useOpsClient();
  const { businessId: workspaceBusinessId, activeBusiness } = useWorkspace();
  const businessId = businessIdProp || workspaceBusinessId;
  const currency = activeBusiness?.currency;
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [picked, setPicked] = useState<ShopProduct | null>(null);

  useEffect(() => {
    if (!client || !businessId) {
      setItems([]);
      setHasMore(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void client.shop
      .listProducts({
        business_id: businessId,
        status: 'active',
        search: debounced || undefined,
        page_size: PICKER_PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        setItems(response.data ?? []);
        setHasMore(Boolean(response.meta?.pagination?.next_cursor));
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, client, debounced]);

  const selectedLabel = useMemo(() => {
    if (picked?.id === value) return picked.name || picked.id;
    const hit = items.find((row) => row.id === value);
    if (hit) return hit.name || hit.id;
    return undefined;
  }, [items, picked, value]);

  return (
    <TypeaheadSelectField<ShopProduct>
      {...rest}
      label={label}
      value={value}
      selectedLabel={selectedLabel}
      items={items}
      loading={loading}
      hasMore={hasMore}
      query={query}
      onQueryChange={setQuery}
      placeholder={placeholder}
      getId={(row) => row.id}
      getLabel={(row) => row.name || row.id}
      getDescription={(row) => formatMoney(row.price, currency)}
      onChange={(id, item) => {
        setPicked(item);
        onChange(id, item);
      }}
    />
  );
}
