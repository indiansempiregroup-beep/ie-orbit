export type CursorPageParams = {
  page_size?: number;
  cursor?: string | null;
};

export type PagedResult<T> = {
  items: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  pageSize: number;
};

export type PagedEnvelope<T> = {
  data: T;
  meta?: {
    pagination?: {
      next_cursor?: string | null;
      previous_cursor?: string | null;
      page_size?: number;
    };
    [key: string]: unknown;
  };
};

export const DEFAULT_PAGE_SIZE = 25;
export const PICKER_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function toPagedResult<T>(
  envelope: PagedEnvelope<T[]>,
  fallbackPageSize = DEFAULT_PAGE_SIZE,
): PagedResult<T> {
  const pagination = envelope.meta?.pagination;
  return {
    items: Array.isArray(envelope.data) ? envelope.data : [],
    nextCursor: pagination?.next_cursor ? String(pagination.next_cursor) : null,
    previousCursor: pagination?.previous_cursor ? String(pagination.previous_cursor) : null,
    pageSize: Number(pagination?.page_size || fallbackPageSize) || fallbackPageSize,
  };
}

export function clampPageSize(value: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}
