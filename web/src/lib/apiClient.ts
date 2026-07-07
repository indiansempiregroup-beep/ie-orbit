import { createApiClient } from '@ie-platform/sdk';
import { ApiClientError } from '@ie-platform/sdk';

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Password',
  website: 'Website',
  slug: 'Workspace code',
  business_email: 'Business email',
  business_name: 'Business name',
  phone_number: 'Mobile',
  primary_color: 'Primary color',
  secondary_color: 'Secondary color',
};

function humanizeField(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectValidationMessages(details: unknown, prefix = ''): string[] {
  if (!details) return [];
  if (typeof details === 'string') {
    return prefix ? [`${prefix}: ${details}`] : [details];
  }
  if (Array.isArray(details)) {
    return details.flatMap((entry) => collectValidationMessages(entry, prefix));
  }
  if (typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>).flatMap(([field, value]) => {
      const label = prefix || humanizeField(field);
      return collectValidationMessages(value, label);
    });
  }
  return [];
}

export function formatApiValidationDetails(details: unknown): string | null {
  const messages = collectValidationMessages(details);
  if (messages.length === 0) return null;
  return messages.join(' ');
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    const details = formatApiValidationDetails(error.payload.error.details);
    return details || error.payload.error.message || error.message || fallback;
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
