import React, { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { opsClient } from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { AddressPlacesField, type PlaceSelection } from './AddressPlacesField';

const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 };

const MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

type LatLng = { lat: number; lng: number };

type GoogleLatLng = { lat: () => number; lng: () => number };

type GoogleMap = {
  addListener: (event: string, handler: (payload: { latLng?: GoogleLatLng }) => void) => void;
  panTo: (position: LatLng) => void;
};

type GoogleMarker = {
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => GoogleLatLng | undefined;
  setPosition: (position: LatLng) => void;
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Map: new (
        el: HTMLElement,
        opts: {
          center: LatLng;
          zoom: number;
          mapTypeControl?: boolean;
          streetViewControl?: boolean;
          fullscreenControl?: boolean;
          clickableIcons?: boolean;
        },
      ) => GoogleMap;
      Marker: new (opts: { map: GoogleMap; position: LatLng; draggable?: boolean }) => GoogleMarker;
    };
  };
  __ieGoogleMapsPromise?: Promise<void>;
};

function loadGoogleMaps(apiKey: string): Promise<void> {
  const win = window as GoogleMapsWindow;
  if (win.google?.maps) return Promise.resolve();
  if (win.__ieGoogleMapsPromise) return win.__ieGoogleMapsPromise;

  win.__ieGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ie-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps.')));
      return;
    }
    const script = document.createElement('script');
    script.dataset.ieGoogleMaps = '1';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps.'));
    document.head.appendChild(script);
  });
  return win.__ieGoogleMapsPromise;
}

type Props = {
  value: string;
  latitude: number | null;
  longitude: number | null;
  onChangeText: (value: string) => void;
  onPlaceSelected: (place: PlaceSelection) => void;
};

function asPlace(data: {
  formatted_address: string;
  line1: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): PlaceSelection {
  return {
    formattedAddress: data.formatted_address,
    line1: data.line1 || data.formatted_address,
    city: data.city || undefined,
    state: data.state || undefined,
    country: data.country || undefined,
    postalCode: data.postal_code || undefined,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
  };
}

export function AddressLocationPicker({
  value,
  latitude,
  longitude,
  onChangeText,
  onPlaceSelected,
}: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    MAPS_API_KEY ? null : 'Set GOOGLE_PLACES_API_KEY in the repo root .env to enable the map picker.',
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);

  const center: LatLng = {
    lat: latitude ?? DEFAULT_CENTER.lat,
    lng: longitude ?? DEFAULT_CENTER.lng,
  };

  // The map is built once, so its listeners must read the latest props through refs.
  const centerRef = useRef(center);
  const reverseRef = useRef<((lat: number, lng: number) => Promise<void>) | null>(null);

  async function reverse(lat: number, lng: number) {
    setLocating(true);
    setError(null);
    markerRef.current?.setPosition({ lat, lng });
    mapRef.current?.panTo({ lat, lng });
    try {
      const response = await opsClient.places.reverse({ latitude: lat, longitude: lng });
      onPlaceSelected(asPlace(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to identify this map location.');
      onPlaceSelected({ formattedAddress: value, line1: value, latitude: lat, longitude: lng });
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    centerRef.current = center;
    reverseRef.current = reverse;
  });

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    let cancelled = false;

    loadGoogleMaps(MAPS_API_KEY)
      .then(() => {
        const maps = (window as GoogleMapsWindow).google?.maps;
        const el = containerRef.current;
        if (cancelled || !maps || !el) return;

        const map = new maps.Map(el, {
          center: centerRef.current,
          zoom: latitude != null && longitude != null ? 16 : 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const marker = new maps.Marker({ map, position: centerRef.current, draggable: true });

        map.addListener('click', (payload) => {
          const position = payload.latLng;
          if (position) void reverseRef.current?.(position.lat(), position.lng());
        });
        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) void reverseRef.current?.(position.lat(), position.lng());
        });

        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapError('Google Maps could not be loaded. Check the API key and billing.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const position = { lat: latitude, lng: longitude };
    markerRef.current?.setPosition(position);
    mapRef.current?.panTo(position);
  }, [latitude, longitude]);

  async function useCurrentLocation() {
    setError(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError('Allow location access in your browser to fill this address.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await reverse(position.coords.latitude, position.coords.longitude);
  }

  const mapNode = createElement('div', {
    ref: containerRef,
    style: { width: '100%', height: '100%' },
  });

  return (
    <View style={styles.wrap}>
      <AddressPlacesField
        label="Search address, building or landmark"
        value={value}
        onChangeText={onChangeText}
        onPlaceSelected={onPlaceSelected}
        latitude={latitude}
        longitude={longitude}
      />
      <View style={styles.mapHeader}>
        <Text style={styles.label}>Confirm map location</Text>
        <Pressable style={styles.locationButton} onPress={() => void useCurrentLocation()}>
          <Feather name="crosshair" size={14} color={colors.primary} />
          <Text style={styles.locationText}>Use current location</Text>
        </Pressable>
      </View>
      <View style={styles.mapWrap}>
        {mapError ? (
          <View style={styles.fallback}>
            <Feather name="map-pin" size={20} color={colors.mutedForeground} />
            <Text style={styles.fallbackText}>{mapError}</Text>
            <Text style={styles.fallbackCoords}>
              {latitude != null && longitude != null
                ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                : 'Search above to set the pin.'}
            </Text>
          </View>
        ) : (
          <>
            {mapNode}
            {mapReady ? null : (
              <View style={styles.fallback}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </>
        )}
      </View>
      <Text style={styles.hint}>
        {locating ? 'Finding address…' : 'Click the map or drag the pin; address and pincode update automatically.'}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  locationButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  mapWrap: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  fallbackText: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
  fallbackCoords: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  hint: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
});
