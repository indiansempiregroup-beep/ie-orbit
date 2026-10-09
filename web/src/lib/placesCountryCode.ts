/** ISO 3166-1 alpha-2 for Places autocomplete when known from the business address. */
export function placesCountryCodeFromName(country?: string | null): string | undefined {
  const value = country?.trim();
  if (!value) return undefined;
  if (/^in(dia)?$/i.test(value)) return 'IN';
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return undefined;
}
