import React, { useMemo, useState } from 'react';
import type { Customer, Service, StaffMember } from '@ie-orbit/sdk';
import { PICKER_PAGE_SIZE } from '@ie-orbit/sdk';
import { TypeaheadSelectField } from '../../components/TypeaheadSelectField';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useCustomer, useCustomers, useServices, useStaffMembers } from '../../hooks/useOpsData';

function customerLabel(customer: Customer): string {
  return (
    customer.display_name?.trim() ||
    customer.full_name?.trim() ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.email ||
    customer.phone_number ||
    customer.id
  );
}

function staffLabel(member: StaffMember): string {
  return member.display_name?.trim() || member.full_name?.trim() || member.email || member.id;
}

type PickerProps<T> = {
  label: string;
  value: string;
  onChange: (id: string, item: T | null) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  disabled?: boolean;
  filterItem?: (item: T) => boolean;
  emptyOption?: { value: string; label: string };
};

export function CustomerPickerField(props: PickerProps<Customer>) {
  const { value, onChange, placeholder = 'Search customers…', ...rest } = props;
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const { customers, loading, nextCursor } = useCustomers({
    q: debounced || undefined,
    pageSize: PICKER_PAGE_SIZE,
  });
  const { customer: detail } = useCustomer(value);
  const [picked, setPicked] = useState<Customer | null>(null);
  const selectedLabel = useMemo(() => {
    if (picked?.id === value) return customerLabel(picked);
    if (detail) return customerLabel(detail);
    return undefined;
  }, [detail, picked, value]);

  return (
    <TypeaheadSelectField<Customer>
      {...rest}
      value={value}
      selectedLabel={selectedLabel}
      items={customers}
      loading={loading}
      hasMore={Boolean(nextCursor)}
      query={query}
      onQueryChange={setQuery}
      placeholder={placeholder}
      getId={(row) => row.id}
      getLabel={customerLabel}
      getDescription={(row) => [row.phone_number, row.email].filter(Boolean).join(' · ') || undefined}
      onChange={(id, item) => {
        setPicked(item);
        onChange(id, item);
      }}
    />
  );
}

export function StaffPickerField(props: PickerProps<StaffMember>) {
  const { value, onChange, placeholder = 'Search staff…', filterItem, ...rest } = props;
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const { staff, loading, nextCursor } = useStaffMembers({
    q: debounced || undefined,
    pageSize: PICKER_PAGE_SIZE,
    status: 'active',
  });
  const [picked, setPicked] = useState<StaffMember | null>(null);
  const selectedLabel = picked?.id === value ? staffLabel(picked) : undefined;

  return (
    <TypeaheadSelectField<StaffMember>
      {...rest}
      value={value}
      selectedLabel={selectedLabel}
      items={staff}
      loading={loading}
      hasMore={Boolean(nextCursor)}
      query={query}
      onQueryChange={setQuery}
      placeholder={placeholder}
      filterItem={filterItem}
      getId={(row) => row.id}
      getLabel={staffLabel}
      getDescription={(row) => row.designation || undefined}
      onChange={(id, item) => {
        setPicked(item);
        onChange(id, item);
      }}
    />
  );
}

export function ServicePickerField(props: PickerProps<Service>) {
  const { value, onChange, placeholder = 'Search services…', ...rest } = props;
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const { services, loading, nextCursor } = useServices({
    q: debounced || undefined,
    pageSize: PICKER_PAGE_SIZE,
  });
  const [picked, setPicked] = useState<Service | null>(null);
  const selectedLabel = picked?.id === value ? picked.name || picked.id : undefined;

  return (
    <TypeaheadSelectField<Service>
      {...rest}
      value={value}
      selectedLabel={selectedLabel}
      items={services}
      loading={loading}
      hasMore={Boolean(nextCursor)}
      query={query}
      onQueryChange={setQuery}
      placeholder={placeholder}
      getId={(row) => row.id}
      getLabel={(row) => row.name || row.id}
      onChange={(id, item) => {
        setPicked(item);
        onChange(id, item);
      }}
    />
  );
}
