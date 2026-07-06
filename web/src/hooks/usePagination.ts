import { useState } from 'react';

export function usePagination<T>(initialPage = 1, pageSize = 25) {
  const [page, setPage] = useState(initialPage);
  const [size, setSize] = useState(pageSize);

  return {
    page,
    size,
    setPage,
    setSize,
    offset: (page - 1) * size,
  } as const;
}
