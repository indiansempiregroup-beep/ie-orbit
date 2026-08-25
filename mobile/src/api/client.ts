import { createApiClient } from '@ie-orbit/sdk';
import { getApiBaseUrl } from '../config/apiBaseUrl';

export const mobileClient = createApiClient({
  baseUrl: () => getApiBaseUrl(),
});

export { getApiBaseUrl as apiBaseUrl };
