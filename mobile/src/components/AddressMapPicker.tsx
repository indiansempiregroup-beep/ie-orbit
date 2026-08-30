import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Button } from './ui/Button';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { MAPS_ENABLED, MAPS_UNAVAILABLE_MESSAGE } from '../utils/googleMapsConfig';

const DEFAULT_REGION: Region = {
  latitude: 19.076,
  longitude: 72.8777,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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
  const mapRef = useRef<MapView | null>(null);
  const initialRegion = useRef<Region>({
    ...DEFAULT_REGION,
    latitude: latitude ?? DEFAULT_REGION.latitude,
    longitude: longitude ?? DEFAULT_REGION.longitude,
  }).current;
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(
    latitude != null && longitude != null ? { latitude, longitude } : null,
  );
  // A tap or drag already put the pin where the customer wants it, so the
  // geocoded coordinates that come back must not yank the camera around.
  const fromMapRef = useRef(false);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    setPin({ latitude, longitude });
    if (fromMapRef.current) {
      fromMapRef.current = false;
      return;
    }
    mapRef.current?.animateCamera({ center: { latitude, longitude } }, { duration: 300 });
  }, [latitude, longitude]);

  async function useCurrentLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location permission', 'Enable location access to pin your address on the map.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setPin(next);
      onLocationChange(next.latitude, next.longitude);
    } catch {
      Alert.alert('Location unavailable', 'Unable to read your current location. Try searching or tapping the map.');
    }
  }

  function onMapPress(event: MapPressEvent) {
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    fromMapRef.current = true;
    setPin({ latitude: lat, longitude: lng });
    onLocationChange(lat, lng);
  }

  const markerLat = pin?.latitude ?? initialRegion.latitude;
  const markerLng = pin?.longitude ?? initialRegion.longitude;

  return (
    <View style={styles.wrap}>
      <View style={styles.mapHeader}>
        <Text style={styles.label}>Address location</Text>
        <Pressable style={styles.locationBtn} onPress={() => void useCurrentLocation()}>
          <Feather name="crosshair" size={14} color={primaryColor} />
          <Text style={[styles.locationBtnText, { color: primaryColor }]}>Use current location</Text>
        </Pressable>
      </View>
      <View style={styles.mapWrap}>
        {MAPS_ENABLED ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={initialRegion}
            onPress={onMapPress}
          >
            <Marker
              coordinate={{ latitude: markerLat, longitude: markerLng }}
              draggable
              onDragEnd={(event) => {
                const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
                fromMapRef.current = true;
                setPin({ latitude: lat, longitude: lng });
                onLocationChange(lat, lng);
              }}
            />
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Feather name="map" size={24} color={colors.mutedForeground} />
            <Text style={styles.mapFallbackText}>{MAPS_UNAVAILABLE_MESSAGE}</Text>
          </View>
        )}
      </View>
      {MAPS_ENABLED ? (
        <Text style={styles.hint}>Tap the map or drag the pin to set your location.</Text>
      ) : null}
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
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Maps', 'Unable to open Google Maps on this device.');
  }
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
  map: { flex: 1 },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.muted,
  },
  mapFallbackText: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
  hint: { ...typography.caption, color: colors.mutedForeground },
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
