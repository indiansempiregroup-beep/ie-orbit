import { toPagedResult, type PagedEnvelope } from '@ie-orbit/sdk';

/**
 * Walks cursor pages (100 rows each) until `match` hits. Used by detail screens whose API has no
 * single-record endpoint, so they keep working past the first server page.
 */
export async function findInCursorPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<PagedEnvelope<T[]>>,
  match: (row: T) => boolean,
  maxPages = 20,
): Promise<T | null> {
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = toPagedResult(await fetchPage(cursor), 100);
    const found = page.items.find(match);
    if (found) return found;
    if (!page.nextCursor || page.nextCursor === cursor) return null;
    cursor = page.nextCursor;
  }
  return null;
}
