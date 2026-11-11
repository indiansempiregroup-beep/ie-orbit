import React, { useState } from 'react';
import { PICKER_PAGE_SIZE } from '@ie-orbit/sdk';
import { TypeaheadSelect } from '../../components/TypeaheadSelect';
import { useDebounce } from '../../hooks/useDebounce';
import { useShopCustomers, useShopSuppliers } from './shopHooks';

export type ShopPickedCustomer = NonNullable<ReturnType<typeof useShopCustomers>['data']>['items'][number];
type Customer = ShopPickedCustomer;
type Supplier = NonNullable<ReturnType<typeof useShopSuppliers>['data']>['items'][number];

type PickerProps<T> = {
  value: string | null | undefined;
  onChange: (id: string, item: T | null) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
};

function customerLabel(row: Customer) {
  return row.full_name ?? row.display_name ?? row.email ?? row.id;
}

/** Shop party picker: `/customers?q=&page_size=25` typeahead (keeps raw loyalty fields). */
export function ShopCustomerTypeahead({ value, onChange, ...rest }: PickerProps<Customer>) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Customer | null>(null);
  const debounced = useDebounce(query, 250);
  const list = useShopCustomers(debounced, { pageSize: PICKER_PAGE_SIZE });
  return (
    <TypeaheadSelect<Customer>
      {...rest}
      value={value}
      selectedLabel={picked && picked.id === value ? customerLabel(picked) : undefined}
      items={list.data?.items ?? []}
      loading={list.isFetching}
      hasMore={Boolean(list.data?.nextCursor)}
      query={query}
      onQueryChange={setQuery}
      getId={(row) => row.id}
      getLabel={customerLabel}
      getDescription={(row) => [row.phone_number, row.email].filter(Boolean).join(' · ') || undefined}
      onSelect={(item) => {
        setPicked(item);
        onChange(item?.id ?? '', item);
      }}
    />
  );
}

/** Shop supplier picker: `/shop/suppliers?q=&page_size=25` typeahead. */
export function ShopSupplierTypeahead({ value, onChange, ...rest }: PickerProps<Supplier>) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Supplier | null>(null);
  const debounced = useDebounce(query, 250);
  const list = useShopSuppliers(debounced, { pageSize: PICKER_PAGE_SIZE });
  return (
    <TypeaheadSelect<Supplier>
      {...rest}
      value={value}
      selectedLabel={picked && picked.id === value ? picked.name : undefined}
      items={list.data?.items ?? []}
      loading={list.isFetching}
      hasMore={Boolean(list.data?.nextCursor)}
      query={query}
      onQueryChange={setQuery}
      getId={(row) => row.id}
      getLabel={(row) => row.name}
      onSelect={(item) => {
        setPicked(item);
        onChange(item?.id ?? '', item);
      }}
    />
  );
}
