import React, { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Button } from './ui/Button';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
  loadGoogleMaps,
  MAPS_API_KEY,
  MISSING_KEY_MESSAGE,
  type GoogleMap,
  type GoogleMarker,
  type LatLngLiteral,
} from '../utils/googleMapsWeb';

const DEFAULT_CENTER: LatLngLiteral = { lat: 19.076, lng: 72.8777 };

type AddressMapPickerProps = {
  value: string;
  onChangeText: (value: string) => void;
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
  primaryColor?: string;
};

export function AddressMapPicker({
  value,
  onChangeText,
  latitude,
  longitude,
  onLocationChange,
  primaryColor = colors.primary,
}: AddressMapPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(MAPS_API_KEY ? null : MISSING_KEY_MESSAGE);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);

  const markerLat = latitude ?? DEFAULT_CENTER.lat;
  const markerLng = longitude ?? DEFAULT_CENTER.lng;

  // The map is created once, so its listeners read the latest props through refs.
  const centerRef = useRef<LatLngLiteral>({ lat: markerLat, lng: markerLng });
  const changeRef = useRef(onLocationChange);

  useEffect(() => {
    centerRef.current = { lat: markerLat, lng: markerLng };
    changeRef.current = onLocationChange;
  });

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        const el = containerRef.current;
        if (cancelled || !el) return;

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
          if (!position) return;
          marker.setPosition({ lat: position.lat(), lng: position.lng() });
          changeRef.current(position.lat(), position.lng());
        });
        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) changeRef.current(position.lat(), position.lng());
        });

        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch((err: Error) => {
        if (!cancelled) setMapError(err.message);
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
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Enable location access in your browser to pin your address on the map.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      markerRef.current?.setPosition(next);
      mapRef.current?.panTo(next);
      onLocationChange(position.coords.latitude, position.coords.longitude);
    } catch {
      setError('Unable to read your current location. Try clicking the map instead.');
    } finally {
      setLocating(false);
    }
  }

  const mapNode = createElement('div', {
    ref: containerRef,
    style: { width: '100%', height: '100%' },
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.mapHeader}>
        <Text style={styles.label}>Address location</Text>
        <Pressable
          style={styles.locationBtn}
          onPress={() => void useCurrentLocation()}
          disabled={locating}
        >
          <Feather name="crosshair" size={14} color={primaryColor} />
          <Text style={[styles.locationBtnText, { color: primaryColor }]}>
            {locating ? 'Locating…' : 'Use current location'}
          </Text>
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
                : 'No location pinned yet.'}
            </Text>
          </View>
        ) : (
          <>
            {mapNode}
            {mapReady ? null : (
              <View style={styles.fallback}>
                <ActivityIndicator size="small" color={primaryColor} />
              </View>
            )}
          </>
        )}
      </View>
      <Text style={styles.hint}>Click the map or drag the pin to set your location.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Full address</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="House / street / area / city / pin code"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        style={styles.textarea}
      />
      <Button label="Open in Google Maps" variant="ghost" onPress={() => void openInMaps(markerLat, markerLng)} />
    </View>
  );
}

async function openInMaps(latitude: number, longitude: number) {
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  await Linking.openURL(url);
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationBtnText: { ...typography.caption, fontWeight: '600' },
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
  textarea: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    color: colors.foreground,
    ...typography.body,
  },
});
