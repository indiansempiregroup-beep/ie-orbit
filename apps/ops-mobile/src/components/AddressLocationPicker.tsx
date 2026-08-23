import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';
import { opsClient } from '../api/client';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { AddressPlacesField, type PlaceSelection } from './AddressPlacesField';

const DEFAULT_REGION: Region = {
  latitude: 19.076,
  longitude: 72.8777,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

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
  const [region, setRegion] = useState<Region>({
    ...DEFAULT_REGION,
    latitude: latitude ?? DEFAULT_REGION.latitude,
    longitude: longitude ?? DEFAULT_REGION.longitude,
  });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    setRegion((current) => ({ ...current, latitude, longitude }));
  }, [latitude, longitude]);

  async function reverse(lat: number, lng: number) {
    setLocating(true);
    setError(null);
    setRegion((current) => ({ ...current, latitude: lat, longitude: lng }));
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

  async function useCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Location permission', 'Allow location access to fill this address.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await reverse(position.coords.latitude, position.coords.longitude);
  }

  function onMapPress(event: MapPressEvent) {
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    void reverse(lat, lng);
  }

  const marker = {
    latitude: latitude ?? region.latitude,
    longitude: longitude ?? region.longitude,
  };

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
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          region={region}
          onPress={onMapPress}
        >
          <Marker
            coordinate={marker}
            draggable
            onDragEnd={(event) => {
              const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
              void reverse(lat, lng);
            }}
          />
        </MapView>
      </View>
      <Text style={styles.hint}>
        {locating ? 'Finding address…' : 'Tap the map or drag the pin; address and pincode update automatically.'}
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
  map: { flex: 1 },
  hint: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
});
