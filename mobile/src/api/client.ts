import { createApiClient } from '@ie-platform/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';

export const mobileClient = createApiClient({
  baseUrl: () => getApiBaseUrl(),
});

export { getApiBaseUrl as apiBaseUrl };
