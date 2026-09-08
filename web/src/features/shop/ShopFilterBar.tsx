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
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  hideSearch?: boolean;
};

const controlStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--border, #e5e7eb)',
  padding: '10px 12px',
  background: 'var(--card, #fff)',
};

export function ShopFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onClear,
  action,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  hideSearch,
}: Props) {
  const showDates = Boolean(onDateFromChange && onDateToChange);

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 16,
      }}
    >
      {hideSearch ? null : (
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        style={{
          flex: '1 1 220px',
          minWidth: 200,
          ...controlStyle,
          padding: '10px 14px',
          alignSelf: 'stretch',
        }}
      />
      )}
      {filters.map((filter) => (
        <label key={filter.id} style={{ display: 'grid', gap: 4, minWidth: 140 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{filter.label}</span>
          <select
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            aria-label={filter.label}
            style={controlStyle}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {showDates ? (
        <>
          <label style={{ display: 'grid', gap: 4, minWidth: 140 }}>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>From</span>
            <input type="date" value={dateFrom} onChange={(event) => onDateFromChange?.(event.target.value)} style={controlStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4, minWidth: 140 }}>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>To</span>
            <input type="date" value={dateTo} onChange={(event) => onDateToChange?.(event.target.value)} style={controlStyle} />
          </label>
        </>
      ) : null}
      <Button type="button" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      {action ? <div style={{ marginLeft: 'auto' }}>{action}</div> : null}
    </div>
  );
}
