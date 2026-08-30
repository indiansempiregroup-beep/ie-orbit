export const MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

export const MAPS_ENABLED = Boolean(MAPS_API_KEY);

export const MAPS_UNAVAILABLE_MESSAGE =
  'Map preview is unavailable. Search for your address above or enter it manually below.';
