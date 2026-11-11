import React, { useEffect, useId, useRef, useState } from 'react';

type Props<T> = {
  /** Selected id ('' / null when nothing is selected). */
  value: string | null | undefined;
  /** Label shown for the current selection. */
  selectedLabel?: string;
  items: T[];
  loading?: boolean;
  /** Raw (non-debounced) query typed in the box; owner debounces and fetches with `q`. */
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (item: T | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | undefined;
  placeholder?: string;
  emptyOptionLabel?: string;
  noResultsLabel?: string;
  hasMore?: boolean;
  hasMoreLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
};

const controlStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
  width: '100%',
  boxSizing: 'border-box',
};

/**
 * Server-search combobox. Replaces `<select>` over full list dumps: parent passes
 * only the current page of results (q + page_size 25) and this renders them.
 */
export function TypeaheadSelect<T>({
  value,
  selectedLabel,
  items,
  loading = false,
  query,
  onQueryChange,
  onSelect,
  getId,
  getLabel,
  getDescription,
  placeholder,
  emptyOptionLabel,
  noResultsLabel = 'No matches',
  hasMore = false,
  hasMoreLabel = 'Keep typing to narrow results',
  disabled = false,
  ariaLabel,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [open]);

  const displayValue = open ? query : value ? selectedLabel || value : '';

  function choose(item: T | null) {
    onSelect(item);
    onQueryChange('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        value={displayValue}
        placeholder={value && !open ? undefined : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          onQueryChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        style={controlStyle}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            maxHeight: 240,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          {emptyOptionLabel ? (
            <li role="option" aria-selected={!value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(null)} style={optionStyle}>
                {emptyOptionLabel}
              </button>
            </li>
          ) : null}
          {loading && items.length === 0 ? (
            <li style={{ padding: 10, color: '#6b7280', fontSize: 13 }}>Searching…</li>
          ) : items.length === 0 ? (
            <li style={{ padding: 10, color: '#6b7280', fontSize: 13 }}>{noResultsLabel}</li>
          ) : (
            items.map((item) => {
              const id = getId(item);
              const description = getDescription?.(item);
              return (
                <li key={id} role="option" aria-selected={id === value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                    style={{ ...optionStyle, fontWeight: id === value ? 700 : 500 }}
                  >
                    <span>{getLabel(item)}</span>
                    {description ? (
                      <span style={{ display: 'block', color: '#6b7280', fontSize: 12 }}>{description}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
          {hasMore ? (
            <li style={{ padding: '8px 10px', color: '#9ca3af', fontSize: 12 }}>{hasMoreLabel}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const optionStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  cursor: 'pointer',
  color: '#111827',
  fontSize: 14,
};
