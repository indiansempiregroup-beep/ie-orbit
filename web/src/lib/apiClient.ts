import { createApiClient } from '@ie-platform/sdk';
import { ApiClientError } from '@ie-platform/sdk';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function createAuthenticatedClient(
  token?: string | null,
  tenantId?: string | null,
  businessId?: string | null,
) {
  const headers: HeadersInit = {};
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }
  if (businessId) {
    headers['X-Business-ID'] = businessId;
  }
  return createApiClient({
    baseUrl: '/api/v1',
    token: token ?? null,
    headers,
  });
}
