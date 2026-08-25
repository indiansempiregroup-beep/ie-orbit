import { createApiClient } from '@ie-orbit/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';

const REQUEST_TIMEOUT_MS = 15_000;

/** Fail hung device requests quickly so screens stop spinning forever. */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && (err.name === 'AbortError' || /aborted|timed out/i.test(err.message))) ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError');
    if (aborted) {
      throw new Error(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check API at ${getApiBaseUrl()}.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const opsClient = createApiClient({
  baseUrl: () => getApiBaseUrl(),
  fetchImpl: fetchWithTimeout as typeof fetch,
});

export function createScopedClient(token: string, tenantId?: string | null, businessId?: string | null) {
  const headers: Record<string, string> = {};
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  if (businessId) headers['X-Business-ID'] = businessId;
  return createApiClient({
    baseUrl: () => getApiBaseUrl(),
    token,
    headers,
    fetchImpl: fetchWithTimeout as typeof fetch,
  });
}
