export type CustomerAddressLike = {
  full_address?: string | null;
  addresses?: Array<{
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postal_code?: string | null;
    full_address?: string | null;
    is_default?: boolean;
    latitude?: number | string | null;
    longitude?: number | string | null;
  }>;
  address?: {
    line1?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postal_code?: string | null;
    full_address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  } | null;
};

export type ParsedCustomerAddress = {
  line1: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function parseCustomerAddress(customer: CustomerAddressLike): ParsedCustomerAddress {
  const defaultAddress =
    customer.addresses?.find((row) => row.is_default) ?? customer.addresses?.[0] ?? customer.address;
  const line1 = defaultAddress?.full_address || defaultAddress?.line1 || customer.full_address || '';
  return {
    line1,
    city: defaultAddress?.city ?? undefined,
    state: defaultAddress?.state ?? undefined,
    country: defaultAddress?.country ?? undefined,
    postalCode: defaultAddress?.postal_code ?? undefined,
    latitude: defaultAddress?.latitude != null ? Number(defaultAddress.latitude) : null,
    longitude: defaultAddress?.longitude != null ? Number(defaultAddress.longitude) : null,
  };
}

export function formatCustomerAddressLabel(customer: CustomerAddressLike): string {
  const address = parseCustomerAddress(customer);
  return (
    [address.line1, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(', ') ||
    '—'
  );
}
