import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';

type CursorPageInfo = {
  nextCursor?: string | null;
  previousCursor?: string | null;
};

type Options = {
  initialPageSize?: number;
  debounceMs?: number;
  /** Change this value to rewind to the first page (e.g. filter/date changes). */
  resetKey?: string;
};

/**
 * Shared state for server-side cursor lists: debounced `q`, page size and a cursor
 * stack for previous/next (matches the CustomersPage / ShopProductsPage pattern).
 */
export function useCursorListState({ initialPageSize = 25, debounceMs = 300, resetKey = '' }: Options = {}) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, debounceMs);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);

  const reset = useCallback(() => {
    setCursor(null);
    setCursorStack([null]);
  }, []);

  useEffect(() => {
    reset();
  }, [debouncedSearch, pageSize, resetKey, reset]);

  const setPageSize = useCallback((size: number) => setPageSizeState(size), []);

  const goNext = useCallback(
    (nextCursor?: string | null) => {
      if (!nextCursor) return;
      setCursorStack((stack) => [...stack, cursor]);
      setCursor(nextCursor);
    },
    [cursor],
  );

  const goPrevious = useCallback(() => {
    setCursorStack((stack) => {
      if (stack.length <= 1) {
        setCursor(null);
        return [null];
      }
      const nextStack = stack.slice(0, -1);
      setCursor(nextStack[nextStack.length - 1] ?? null);
      return nextStack;
    });
  }, []);

  const pagerProps = useCallback(
    (page: CursorPageInfo | undefined, count: number) => ({
      count,
      pageSize,
      hasPrevious: cursorStack.length > 1 || Boolean(page?.previousCursor),
      hasNext: Boolean(page?.nextCursor),
      onPrevious: goPrevious,
      onNext: () => goNext(page?.nextCursor),
      onPageSizeChange: setPageSize,
      pageSizeOptions: [10, 25, 50, 100],
    }),
    [cursorStack.length, goNext, goPrevious, pageSize, setPageSize],
  );

  return useMemo(
    () => ({
      searchTerm,
      setSearchTerm,
      debouncedSearch,
      pageSize,
      cursor,
      reset,
      pagerProps,
    }),
    [searchTerm, debouncedSearch, pageSize, cursor, reset, pagerProps],
  );
}
