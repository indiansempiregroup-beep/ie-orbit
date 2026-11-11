import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  count: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  disabled?: boolean;
};

const pagerBtn: React.CSSProperties = {
  minWidth: 32,
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: 13,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const pagerBtnDisabled: React.CSSProperties = {
  ...pagerBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
};

/** Cursor-based pager: previous/next + page size (no total count). */
export function CursorPager({
  count,
  pageSize,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const unitLabel = label ?? t('bi.pagination.entries');

  if (count <= 0 && !hasPrevious && !hasNext) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
          {t('bi.pagination.showingCount', { count, label: unitLabel })}
        </span>
        <label
          style={{
            display: 'inline-flex',
            gap: 6,
            alignItems: 'center',
            fontSize: 13,
            color: 'var(--muted-foreground)',
          }}
        >
          {t('bi.pagination.rows')}
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label={t('bi.pagination.rowsPerPage')}
            style={{
              height: 32,
              padding: '0 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--foreground)',
              fontSize: 13,
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} role="navigation" aria-label={t('bi.pagination.navigation')}>
        <button
          type="button"
          aria-label={t('bi.pagination.previousPage')}
          title={t('bi.pagination.previous')}
          disabled={disabled || !hasPrevious}
          onClick={onPrevious}
          style={disabled || !hasPrevious ? pagerBtnDisabled : pagerBtn}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={t('bi.pagination.nextPage')}
          title={t('bi.pagination.next')}
          disabled={disabled || !hasNext}
          onClick={onNext}
          style={disabled || !hasNext ? pagerBtnDisabled : pagerBtn}
        >
          ›
        </button>
      </div>
    </div>
  );
}
