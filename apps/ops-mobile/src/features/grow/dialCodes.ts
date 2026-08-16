export type DialCode = {
  iso: string;
  name: string;
  dial: string;
};

/** Common dial codes; India first for default UX. */
export const DIAL_CODES: DialCode[] = [
  { iso: 'IN', name: 'India', dial: '91' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971' },
  { iso: 'AU', name: 'Australia', dial: '61' },
  { iso: 'BD', name: 'Bangladesh', dial: '880' },
  { iso: 'CA', name: 'Canada', dial: '1' },
  { iso: 'GB', name: 'United Kingdom', dial: '44' },
  { iso: 'ID', name: 'Indonesia', dial: '62' },
  { iso: 'MY', name: 'Malaysia', dial: '60' },
  { iso: 'NP', name: 'Nepal', dial: '977' },
  { iso: 'PK', name: 'Pakistan', dial: '92' },
  { iso: 'PH', name: 'Philippines', dial: '63' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966' },
  { iso: 'SG', name: 'Singapore', dial: '65' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94' },
  { iso: 'US', name: 'United States', dial: '1' },
  { iso: 'ZA', name: 'South Africa', dial: '27' },
];

const COUNTRY_ALIASES: Record<string, string> = {
  india: 'IN',
  in: 'IN',
  'united arab emirates': 'AE',
  uae: 'AE',
  australia: 'AU',
  bangladesh: 'BD',
  canada: 'CA',
  'united kingdom': 'GB',
  uk: 'GB',
  indonesia: 'ID',
  malaysia: 'MY',
  nepal: 'NP',
  pakistan: 'PK',
  philippines: 'PH',
  'saudi arabia': 'SA',
  singapore: 'SG',
  'sri lanka': 'LK',
  'united states': 'US',
  usa: 'US',
  'south africa': 'ZA',
};

export function dialCodeForBusinessCountry(country?: string | null): DialCode {
  const key = (country ?? '').trim().toLowerCase();
  const iso = COUNTRY_ALIASES[key] ?? (key.length === 2 ? key.toUpperCase() : 'IN');
  return DIAL_CODES.find((item) => item.iso === iso) ?? DIAL_CODES[0];
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

/** Split a stored full phone into dial + national using known dial prefixes. */
export function splitPhone(phone: string, fallback: DialCode): { dial: DialCode; national: string } {
  const digits = digitsOnly(phone);
  if (!digits) return { dial: fallback, national: '' };

  const sorted = [...DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);
  for (const code of sorted) {
    if (digits.startsWith(code.dial) && digits.length > code.dial.length) {
      return { dial: code, national: digits.slice(code.dial.length) };
    }
  }
  if (digits.startsWith('0') && digits.length > 1) {
    return { dial: fallback, national: digits.replace(/^0+/, '') };
  }
  return { dial: fallback, national: digits };
}

export function dialCodeOptions() {
  return DIAL_CODES.map((code) => ({
    value: code.iso,
    label: `${code.name} (+${code.dial})`,
  }));
}
