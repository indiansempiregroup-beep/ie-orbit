import { createApiClient } from '@ie-platform/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';

export const opsClient = createApiClient({
  baseUrl: () => getApiBaseUrl(),
});

export function createScopedClient(token: string, tenantId?: string | null, businessId?: string | null) {
  const headers: HeadersInit = {};
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  if (businessId) headers['X-Business-ID'] = businessId;
  return createApiClient({
    baseUrl: () => getApiBaseUrl(),
    token,
    headers,
  });
}
