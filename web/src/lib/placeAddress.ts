import type { PlaceSelection } from '../components/AddressPlacesField';

export function emptyPlace(): PlaceSelection {
  return {
    formattedAddress: '',
    line1: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    latitude: null,
    longitude: null,
  };
}

export function looksLikePlusCode(value: string): boolean {
  return /(?:^|\s)[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b/i.test(value.trim());
}

export function preferHumanAddress(place: PlaceSelection, previousLine = ''): PlaceSelection {
  const line = (place.line1 || place.formattedAddress || '').trim();
  const previous = previousLine.trim();
  if (!looksLikePlusCode(line)) return place;
  if (previous && !looksLikePlusCode(previous)) {
    return { ...place, line1: previous, formattedAddress: previous };
  }
  const composed = [place.city, place.state, place.postalCode, place.country].filter(Boolean).join(', ');
  if (composed) return { ...place, line1: composed, formattedAddress: composed };
  return place;
}

export function placeToAddressFields(place: PlaceSelection) {
  return {
    address: place.line1 || place.formattedAddress || '',
    city: place.city || '',
    state: place.state || '',
    country: place.country || '',
    postalCode: place.postalCode || '',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
  };
}
