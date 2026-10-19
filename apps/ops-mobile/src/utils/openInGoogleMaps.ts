import { Linking, Platform } from 'react-native';

/** Open a coordinate in the Google Maps app (falls back to the web maps URL). */
export async function openInGoogleMaps(
  latitude: number,
  longitude: number,
  label?: string,
): Promise<void> {
  const coords = `${latitude},${longitude}`;
  const title = encodeURIComponent(label?.trim() || coords);
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
  const appUrl =
    Platform.OS === 'ios'
      ? `comgooglemaps://?q=${coords}&center=${coords}&zoom=16`
      : Platform.OS === 'android'
        ? `geo:0,0?q=${coords}(${title})`
        : webUrl;

  try {
    if (appUrl !== webUrl && (await Linking.canOpenURL(appUrl))) {
      await Linking.openURL(appUrl);
      return;
    }
  } catch {
    // Fall through to the https URL, which still deep-links on most devices.
  }
  await Linking.openURL(webUrl);
}
