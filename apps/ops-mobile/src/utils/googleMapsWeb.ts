// Web-only helper: react-native-maps is native-only, so the web build renders
// maps through the Google Maps JavaScript SDK instead. Import this from `.web.tsx`
// files only so it never enters the native bundle graph.

import Constants from 'expo-constants';

export const MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  String(Constants.expoConfig?.extra?.googleMapsApiKey || '');

export const MISSING_KEY_MESSAGE =
  'Set GOOGLE_PLACES_API_KEY in the repo root .env to enable maps on web.';

export const LOAD_FAILED_MESSAGE = 'Google Maps could not be loaded. Check the API key and billing.';

export type LatLngLiteral = { lat: number; lng: number };

type GoogleLatLng = { lat: () => number; lng: () => number };

export type GoogleLatLngBounds = { extend: (position: LatLngLiteral) => void };

export type GoogleMap = {
  addListener: (event: string, handler: (payload: { latLng?: GoogleLatLng }) => void) => void;
  panTo: (position: LatLngLiteral) => void;
  setCenter: (position: LatLngLiteral) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
};

export type GoogleMarker = {
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => GoogleLatLng | undefined;
  setPosition: (position: LatLngLiteral) => void;
  setMap: (map: GoogleMap | null) => void;
};

export type GooglePolyline = { setMap: (map: GoogleMap | null) => void };

type MarkerIcon = {
  path: number;
  scale: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
};

export type GoogleMapsApi = {
  Map: new (
    el: HTMLElement,
    opts: {
      center: LatLngLiteral;
      zoom: number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      clickableIcons?: boolean;
      gestureHandling?: string;
      zoomControl?: boolean;
    },
  ) => GoogleMap;
  Marker: new (opts: {
    map: GoogleMap;
    position: LatLngLiteral;
    draggable?: boolean;
    title?: string;
    icon?: MarkerIcon;
  }) => GoogleMarker;
  Polyline: new (opts: {
    map: GoogleMap;
    path: LatLngLiteral[];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
  }) => GooglePolyline;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: { CIRCLE: number };
};

type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
  __ieGoogleMapsPromise?: Promise<GoogleMapsApi>;
};

export function loadGoogleMaps(apiKey: string = MAPS_API_KEY): Promise<GoogleMapsApi> {
  const win = window as GoogleMapsWindow;
  if (win.google?.maps) return Promise.resolve(win.google.maps);
  if (win.__ieGoogleMapsPromise) return win.__ieGoogleMapsPromise;
  if (!apiKey) return Promise.reject(new Error(MISSING_KEY_MESSAGE));

  win.__ieGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const settle = () => {
      const maps = (window as GoogleMapsWindow).google?.maps;
      if (maps) resolve(maps);
      else reject(new Error(LOAD_FAILED_MESSAGE));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-ie-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', settle);
      existing.addEventListener('error', () => reject(new Error(LOAD_FAILED_MESSAGE)));
      return;
    }
    const script = document.createElement('script');
    script.dataset.ieGoogleMaps = '1';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = settle;
    script.onerror = () => reject(new Error(LOAD_FAILED_MESSAGE));
    document.head.appendChild(script);
  });
  return win.__ieGoogleMapsPromise;
}

export function dotIcon(maps: GoogleMapsApi, color: string): MarkerIcon {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
  };
}
