import React, { useMemo } from 'react';

type Props = {
  total: number;
  offset: number;
  pageSize: number;
  onPageChange: (offset: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  label?: string;
};

function buildPageList(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | '…'> = [];
  for (const page of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === 'number' && page - prev > 1) result.push('…');
    result.push(page);
  }
  return result;
}

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

const pagerBtnActive: React.CSSProperties = {
  ...pagerBtn,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  borderColor: 'var(--primary)',
  fontWeight: 600,
};

const pagerBtnDisabled: React.CSSProperties = {
  ...pagerBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
};

/** Compact server-offset pagination: range + rows select + page controls. */
export function TablePagination({
  total,
  offset,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label = 'entries',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  const currentPage = Math.min(totalPages, Math.floor(Math.max(0, offset) / Math.max(1, pageSize)) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const pages = useMemo(() => buildPageList(currentPage, totalPages), [currentPage, totalPages]);

  if (total <= 0) return null;

  const go = (page: number) => onPageChange((Math.min(totalPages, Math.max(1, page)) - 1) * pageSize);

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
          {from}–{to} of {total} {label}
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
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Rows per page"
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

      {totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} role="navigation" aria-label="Pagination">
          <button
            type="button"
            aria-label="First page"
            title="First"
            disabled={currentPage <= 1}
            onClick={() => go(1)}
            style={currentPage <= 1 ? pagerBtnDisabled : pagerBtn}
          >
            «
          </button>
          <button
            type="button"
            aria-label="Previous page"
            title="Previous"
            disabled={currentPage <= 1}
            onClick={() => go(currentPage - 1)}
            style={currentPage <= 1 ? pagerBtnDisabled : pagerBtn}
          >
            ‹
          </button>
          {pages.map((page, index) =>
            page === '…' ? (
              <span
                key={`ellipsis-${index}`}
                style={{ width: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}
              >
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => go(page)}
                style={page === currentPage ? pagerBtnActive : pagerBtn}
              >
                {page}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Next page"
            title="Next"
            disabled={currentPage >= totalPages}
            onClick={() => go(currentPage + 1)}
            style={currentPage >= totalPages ? pagerBtnDisabled : pagerBtn}
          >
            ›
          </button>
          <button
            type="button"
            aria-label="Last page"
            title="Last"
            disabled={currentPage >= totalPages}
            onClick={() => go(totalPages)}
            style={currentPage >= totalPages ? pagerBtnDisabled : pagerBtn}
          >
            »
          </button>
        </div>
      ) : null}
    </div>
  );
}
