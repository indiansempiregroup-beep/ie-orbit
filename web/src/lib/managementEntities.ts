import type { Customer, Service, StaffMember } from '@ie-platform/sdk';

type RawRecord = Record<string, unknown>;

export function displayPersonName(raw: {
  display_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  id?: string | null;
}) {
  const composed = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim();
  return raw.display_name || raw.full_name || composed || raw.name || raw.email || raw.id || '—';
}

export function normalizeCustomer(raw: RawRecord): Customer {
  const addresses = (raw.addresses as Array<Record<string, unknown>> | undefined) ?? [];
  const defaultAddress = addresses.find((row) => row.is_default) ?? addresses[0];
  const latitude = defaultAddress?.latitude != null ? Number(defaultAddress.latitude) : null;
  const longitude = defaultAddress?.longitude != null ? Number(defaultAddress.longitude) : null;
  const fullAddress = defaultAddress
    ? String(defaultAddress.full_address || defaultAddress.line1 || '').trim() || null
    : null;

  return {
    id: String(raw.id),
    full_name: displayPersonName(raw as Customer),
    email: (raw.email as string | undefined) ?? null,
    phone_number: (raw.phone_number as string | undefined) ?? null,
    status: (raw.status as string | undefined) ?? 'active',
    full_address: fullAddress,
    latitude,
    longitude,
    address: defaultAddress
      ? {
          id: defaultAddress.id ? String(defaultAddress.id) : undefined,
          line1: (defaultAddress.line1 as string | undefined) ?? undefined,
          full_address: fullAddress,
          city: (defaultAddress.city as string | undefined) ?? null,
          state: (defaultAddress.state as string | undefined) ?? null,
          country: (defaultAddress.country as string | undefined) ?? null,
          postal_code: (defaultAddress.postal_code as string | undefined) ?? null,
          latitude,
          longitude,
        }
      : null,
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
  };
}

export function normalizeService(raw: RawRecord): Service {
  const durations =
    (raw.durations as Array<{
      duration_minutes?: number;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      cleanup_minutes?: number;
      is_default?: boolean;
    }> | undefined) ?? [];
  const prices = (raw.prices as Array<{ base_price?: number | string; currency?: string; is_default?: boolean }> | undefined) ?? [];
  const images = (raw.images as Array<{ is_primary?: boolean; image_url?: string; thumbnail_url?: string }> | undefined) ?? [];
  const defaultDuration = durations.find((row) => row.is_default) ?? durations[0];
  const defaultPrice = prices.find((row) => row.is_default) ?? prices[0];
  const primaryImage = images.find((row) => row.is_primary) ?? images[0];
  const basePrice = defaultPrice?.base_price;
  const imageUrl = primaryImage?.image_url || primaryImage?.thumbnail_url || null;

  return {
    id: String(raw.id),
    name: (raw.display_name as string | undefined) || (raw.name as string | undefined) || 'Untitled service',
    description: (raw.short_description as string | undefined) || (raw.description as string | undefined) || null,
    status: (raw.status as string | undefined) ?? 'draft',
    duration_minutes: defaultDuration?.duration_minutes,
    buffer_before_minutes: defaultDuration?.buffer_before_minutes ?? 0,
    buffer_after_minutes: defaultDuration?.buffer_after_minutes ?? 0,
    cleanup_minutes: defaultDuration?.cleanup_minutes ?? 0,
    loyalty_points_earn: Number(raw.loyalty_points_earn ?? 0) || 0,
    durations,
    price: basePrice != null ? Number(basePrice) : undefined,
    currency: (defaultPrice?.currency as string | undefined) ?? null,
    image_url: imageUrl,
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
  };
}

export function normalizeStaff(raw: RawRecord): StaffMember {
  return {
    id: String(raw.id),
    full_name: displayPersonName(raw as StaffMember),
    email: (raw.email as string | undefined) ?? null,
    phone_number: (raw.phone_number as string | undefined) ?? null,
    status: (raw.employment_status as string | undefined) ?? 'active',
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
  };
}

export function buildNameMap<T extends { id?: string; full_name?: string | null; name?: string | null }>(
  rows: T[] | undefined,
  fallback = '—',
) {
  return new Map(
    (rows ?? []).map((row) => [String(row.id), row.full_name || row.name || fallback]),
  );
}
