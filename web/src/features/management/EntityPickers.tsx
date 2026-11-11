import React, { useState } from 'react';
import { PICKER_PAGE_SIZE } from '@ie-orbit/sdk';
import { TypeaheadSelect } from '../../components/TypeaheadSelect';
import { useDebounce } from '../../hooks/useDebounce';
import { displayPersonName } from '../../lib/managementEntities';
import {
  useCustomerDetail,
  useCustomerList,
  useServiceDetail,
  useServiceList,
  useStaffDetail,
  useStaffList,
} from './managementHooks';
import type { Customer, Service, StaffMember } from './managementApi';

type BasePickerProps<T> = {
  value: string | null | undefined;
  onChange: (id: string | null, item: T | null) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  noResultsLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
};

/** Typeahead over `/customers?q=&page_size=25` (no full dumps). */
export function CustomerTypeahead({ value, onChange, ...rest }: BasePickerProps<Customer>) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Customer | null>(null);
  const debounced = useDebounce(query, 250);
  const list = useCustomerList({ q: debounced, pageSize: PICKER_PAGE_SIZE });
  const detail = useCustomerDetail(value && picked?.id !== value ? value : undefined);
  const selected = picked?.id === value ? picked : detail.data;
  return (
    <TypeaheadSelect<Customer>
      {...rest}
      value={value}
      selectedLabel={selected ? selected.full_name ?? selected.id : undefined}
      items={list.data?.items ?? []}
      loading={list.isFetching}
      hasMore={Boolean(list.data?.nextCursor)}
      query={query}
      onQueryChange={setQuery}
      getId={(row) => row.id}
      getLabel={(row) => row.full_name ?? row.id}
      getDescription={(row) => [row.phone_number, row.email].filter(Boolean).join(' · ') || undefined}
      onSelect={(item) => {
        setPicked(item);
        onChange(item?.id ?? null, item);
      }}
    />
  );
}

/** Typeahead over `/staff?q=&page_size=25`. */
export function StaffTypeahead({ value, onChange, ...rest }: BasePickerProps<StaffMember>) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<StaffMember | null>(null);
  const debounced = useDebounce(query, 250);
  const list = useStaffList({ q: debounced, pageSize: PICKER_PAGE_SIZE });
  const detail = useStaffDetail(value && picked?.id !== value ? value : undefined);
  const selected = picked?.id === value ? picked : detail.data;
  return (
    <TypeaheadSelect<StaffMember>
      {...rest}
      value={value}
      selectedLabel={selected ? displayPersonName(selected) : undefined}
      items={list.data?.items ?? []}
      loading={list.isFetching}
      hasMore={Boolean(list.data?.nextCursor)}
      query={query}
      onQueryChange={setQuery}
      getId={(row) => row.id}
      getLabel={(row) => displayPersonName(row)}
      getDescription={(row) => row.designation || undefined}
      onSelect={(item) => {
        setPicked(item);
        onChange(item?.id ?? null, item);
      }}
    />
  );
}

/** Single-service typeahead over `/services?q=&page_size=25`. */
export function ServiceTypeahead({ value, onChange, ...rest }: BasePickerProps<Service>) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Service | null>(null);
  const debounced = useDebounce(query, 250);
  const list = useServiceList({ q: debounced, pageSize: PICKER_PAGE_SIZE });
  const detail = useServiceDetail(value && picked?.id !== value ? value : undefined);
  const selected = picked?.id === value ? picked : detail.data;
  return (
    <TypeaheadSelect<Service>
      {...rest}
      value={value}
      selectedLabel={selected ? selected.name ?? selected.id : undefined}
      items={list.data?.items ?? []}
      loading={list.isFetching}
      hasMore={Boolean(list.data?.nextCursor)}
      query={query}
      onQueryChange={setQuery}
      getId={(row) => row.id}
      getLabel={(row) => row.name ?? row.id}
      onSelect={(item) => {
        setPicked(item);
        onChange(item?.id ?? null, item);
      }}
    />
  );
}
