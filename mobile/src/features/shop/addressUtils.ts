import { Feather } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { CustomerAddress } from '@ie-orbit/sdk';

export type AddressTypeKey = 'home' | 'work' | 'other';

export type AddressTypeMeta = {
  key: AddressTypeKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

export const ADDRESS_TYPES: AddressTypeMeta[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'work', label: 'Work', icon: 'briefcase' },
  { key: 'other', label: 'Other', icon: 'map-pin' },
];

export function addressTypeMeta(type?: string | null): AddressTypeMeta {
  const key = String(type || 'home').toLowerCase();
  const known = ADDRESS_TYPES.find((item) => item.key === key);
  if (known) return known;
  return { key: 'other', label: key ? key[0].toUpperCase() + key.slice(1) : 'Other', icon: 'map-pin' };
}

/** Localised label for an address type (home/work/other); custom types fall back to their own text. */
export function addressTypeLabel(type: string | null | undefined, t: TFunction): string {
  const meta = addressTypeMeta(type);
  const raw = String(type || 'home').toLowerCase();
  if (!ADDRESS_TYPES.some((item) => item.key === raw)) return meta.label;
  return t(`customerApp.addresses.type.${meta.key}`, { defaultValue: meta.label });
}

/** Address parts ordered the way a courier reads them: door detail, street, city block, country. */
export function addressLines(address: CustomerAddress): string[] {
  const lines: string[] = [];
  if (address.line2) lines.push(String(address.line2));
  if (address.line1) lines.push(String(address.line1));
  const region = [address.city, address.state].filter(Boolean).join(', ');
  const regionWithPin = [region, address.postal_code].filter(Boolean).join(' - ');
  if (regionWithPin) lines.push(regionWithPin);
  if (address.country) lines.push(String(address.country));
  return lines;
}

export function addressSingleLine(address: CustomerAddress): string {
  return addressLines(address).join(', ');
}

/** Street-level address for orders and rider drops; city, state and pincode travel as separate fields. */
export function deliveryAddressLine(address: Pick<CustomerAddress, 'line1' | 'line2'> | null | undefined): string {
  if (!address) return '';
  return [address.line2, address.line1].filter(Boolean).join(', ');
}

export function toCoordinate(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasMapPin(address: CustomerAddress): boolean {
  return toCoordinate(address.latitude) != null && toCoordinate(address.longitude) != null;
}
