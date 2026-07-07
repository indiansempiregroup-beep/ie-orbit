import type { RegisterWizardFormValues } from './schemas/registerWizardSchema';
import { createAuthenticatedClient } from '../../lib/apiClient';
import {
  ACTIVE_BUSINESS_STORAGE_KEY,
  ACTIVE_TENANT_STORAGE_KEY,
} from '../../contexts/WorkspaceContext';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

type ProvisionArgs = {
  values: RegisterWizardFormValues;
  login: (email: string, password: string, remember?: boolean) => Promise<string>;
};

export async function provisionWorkspace({ values }: ProvisionArgs) {
  const slug = slugify(values.businessName);
  if (!slug) {
    throw new Error('Business name must contain valid characters for a workspace code.');
  }

  const publicClient = createAuthenticatedClient();
  const slugCheck = await publicClient.tenants.checkSlug(slug);
  if (!slugCheck.data.available) {
    throw new Error('This workspace code is already taken. Choose a different business name.');
  }

  const response = await publicClient.auth.registerBusiness({
    email: values.email,
    password: values.password,
    first_name: values.firstName,
    last_name: values.lastName,
    phone_number: values.mobile,
    slug,
    business_name: values.businessName,
    display_name: values.displayName || values.businessName,
    business_code: slug,
    business_type: 'service-business',
    industry_category: values.industry,
    business_email: values.businessEmail,
    primary_contact: values.businessPhone,
    website: values.website || undefined,
    country: values.country,
    state: values.state,
    city: values.city,
    postal_code: values.postalCode,
    address_line1: values.address,
    timezone: values.timezone,
    currency: values.currency,
    language: values.language,
    selected_product: values.selectedProduct,
    primary_color: values.skipBranding ? undefined : values.primaryColor,
    secondary_color: values.skipBranding ? undefined : values.secondaryColor,
    settings: {
      time_slot_interval: values.appointmentInterval,
      buffer_time: values.bufferTime,
      business_hours: {
        week_start_day: values.weekStartDay,
        start: values.businessHoursStart,
        end: values.businessHoursEnd,
      },
      appointment_duration_defaults: {
        default_minutes: values.defaultDuration,
      },
      localization: {
        timezone: values.timezone,
        currency: values.currency,
        language: values.language,
        date_format: values.dateFormat,
        time_format: values.timeFormat,
      },
      notification_preferences: {
        email: true,
        sms: false,
      },
    },
  });

  const payload = response.data;
  const tenantId = payload.tenant?.id;
  const businessId = payload.business?.id;
  if (!tenantId || !businessId) {
    throw new Error('Workspace provisioning failed.');
  }

  localStorage.setItem('ie:auth:access', payload.access);
  localStorage.setItem('ie:auth:refresh', payload.refresh);
  localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
  localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
  localStorage.setItem('ie:onboarding:show-welcome', 'true');

  return { tenantId, businessId, slug };
}
