import type { ImagePickerAsset } from 'expo-image-picker';
import type { RegisterBusinessInput } from '@ie-platform/sdk';
import { opsClient } from '../api/client';
import { uploadBrandingLogo } from '../api/media';

export type RegisterWizardValues = {
  businessName: string;
  displayName: string;
  businessEmail: string;
  businessPhone: string;
  city: string;
  country: string;
  state: string;
  address: string;
  postalCode: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
  timezone: string;
  currency: string;
  language: string;
  selectedProduct: string;
  primaryColor: string;
  secondaryColor: string;
  skipBranding?: boolean;
  logoAsset?: ImagePickerAsset | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

export async function provisionWorkspace(values: RegisterWizardValues) {
  const slug = slugify(values.businessName);
  if (!slug) throw new Error('Business name must contain valid characters for a workspace code.');

  const slugCheck = await opsClient.tenants.checkSlug(slug);
  if (!slugCheck.data.available) {
    throw new Error('This workspace code is already taken. Choose a different business name.');
  }

  const body: RegisterBusinessInput = {
    email: values.email,
    password: values.password,
    first_name: values.firstName,
    last_name: values.lastName,
    phone_number: values.mobile,
    slug,
    business_name: values.businessName,
    display_name: values.displayName || values.businessName,
    business_code: slug,
    business_email: values.businessEmail,
    primary_contact: values.businessPhone,
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
      business_hours: { start: '09:00', end: '19:00', week_start_day: 'monday' },
      appointment_duration_defaults: { default_minutes: 30 },
    },
  };

  const response = await opsClient.auth.registerBusiness(body);
  const payload = response.data;
  const tenantId = payload.tenant?.id;
  const businessId = payload.business?.id;

  if (!tenantId || !businessId) {
    throw new Error('Workspace provisioning failed.');
  }

  if (!values.skipBranding && values.logoAsset) {
    const uploaded = await uploadBrandingLogo({
      token: payload.access,
      tenantId,
      businessId,
      asset: values.logoAsset,
      displayName: values.displayName || values.businessName,
    });
    const logoUrl = uploaded.public_url || uploaded.private_url;
    if (logoUrl) {
      const scoped = opsClient;
      scoped.setToken(payload.access);
      await scoped.businesses.patch(businessId, { logo: logoUrl });
    }
  }

  return payload;
}
