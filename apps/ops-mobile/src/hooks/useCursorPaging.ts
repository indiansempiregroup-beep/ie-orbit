import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampPageSize, type PagedResult } from '@ie-orbit/sdk';

export const CURSOR_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type PagingState = {
  scope: string;
  cursor: string | null;
  stack: Array<string | null>;
  nextCursor: string | null;
  previousCursor: string | null;
};

/**
 * Server-side cursor paging + debounced search for ops-mobile list screens.
 * Search / page size / `resetKeys` changes reset the cursor to the first page.
 */
export function useCursorPaging(options?: { resetKeys?: unknown[]; initialPageSize?: number; debounceMs?: number }) {
  const { resetKeys = [], initialPageSize = 25, debounceMs = 300 } = options ?? {};
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSizeState] = useState<number>(clampPageSize(initialPageSize));
  const [state, setState] = useState<PagingState>({
    scope: '',
    cursor: null,
    stack: [null],
    nextCursor: null,
    previousCursor: null,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  const scope = JSON.stringify([debouncedSearch, pageSize, ...resetKeys]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // A cursor is only valid for the scope it was issued in; stale state falls back to page one.
  const active = state.scope === scope ? state : null;
  const cursor = active?.cursor ?? null;
  const stack = active?.stack ?? [null];

  const setPageMeta = useCallback(
    (page: Pick<PagedResult<unknown>, 'nextCursor' | 'previousCursor'>) => {
      // Ignore responses that belong to a search / page size the user has already moved past.
      if (scopeRef.current !== scope) return;
      setState((current) =>
        current.scope === scope
          ? { ...current, nextCursor: page.nextCursor, previousCursor: page.previousCursor }
          : { scope, cursor: null, stack: [null], nextCursor: page.nextCursor, previousCursor: page.previousCursor },
      );
    },
    [scope],
  );

  const clearPageMeta = useCallback(() => setPageMeta({ nextCursor: null, previousCursor: null }), [setPageMeta]);

  const goNext = useCallback(() => {
    setState((current) => {
      const base = current.scope === scope ? current : { ...current, scope, cursor: null, stack: [null] };
      if (!base.nextCursor) return base;
      return { ...base, stack: [...base.stack, base.cursor], cursor: base.nextCursor, nextCursor: null };
    });
  }, [scope]);

  const goPrevious = useCallback(() => {
    setState((current) => {
      const base = current.scope === scope ? current : { ...current, scope, cursor: null, stack: [null] };
      if (base.stack.length <= 1) return { ...base, cursor: null, stack: [null] };
      const nextStack = base.stack.slice(0, -1);
      return { ...base, stack: nextStack, cursor: nextStack[nextStack.length - 1] ?? null };
    });
  }, [scope]);

  const setPageSize = useCallback((size: number) => setPageSizeState(clampPageSize(size)), []);

  const pager = useMemo(
    () => ({
      pageSize,
      hasPrevious: stack.length > 1 || Boolean(active?.previousCursor),
      hasNext: Boolean(active?.nextCursor),
      onPrevious: goPrevious,
      onNext: goNext,
      onPageSizeChange: setPageSize,
      pageSizeOptions: [...CURSOR_PAGE_SIZE_OPTIONS],
    }),
    [pageSize, stack.length, active?.previousCursor, active?.nextCursor, goPrevious, goNext, setPageSize],
  );

  return {
    search,
    setSearch,
    /** Trimmed, debounced search term — pass as `q` to the API (`undefined` when empty). */
    q: debouncedSearch || undefined,
    pageSize,
    cursor: cursor || undefined,
    setPageMeta,
    clearPageMeta,
    pager,
  };
}
