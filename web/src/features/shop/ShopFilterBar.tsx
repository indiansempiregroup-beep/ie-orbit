import React from 'react';
import { Button } from '../../components/Button';

export type ShopFilterOption = {
  value: string;
  label: string;
};

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: Array<{
    id: string;
    label: string;
    value: string;
    options: ShopFilterOption[];
    onChange: (value: string) => void;
  }>;
  onClear: () => void;
  action?: React.ReactNode;
};

export function ShopFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onClear,
  action,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 12,
      }}
    >
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        style={{
          flex: '1 1 220px',
          minWidth: 200,
          borderRadius: 12,
          border: '1px solid var(--border, #e5e7eb)',
          padding: '10px 14px',
          background: 'var(--card, #fff)',
          alignSelf: 'stretch',
        }}
      />
      {filters.map((filter) => (
        <label key={filter.id} style={{ display: 'grid', gap: 4, minWidth: 140 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{filter.label}</span>
          <select
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            aria-label={filter.label}
            style={{
              borderRadius: 12,
              border: '1px solid var(--border, #e5e7eb)',
              padding: '10px 12px',
              background: 'var(--card, #fff)',
            }}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <Button type="button" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      {action ? <div style={{ marginLeft: 'auto' }}>{action}</div> : null}
    </div>
  );
}
