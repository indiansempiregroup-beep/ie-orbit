import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { mobileClient } from '../api/client';
import { colors, typography } from '../theme/tokens';
import { AddressMapPicker } from './AddressMapPicker';
import { AddressPlacesField, type PlaceSelection } from './AddressPlacesField';

type Props = {
  value: string;
  latitude: number | null;
  longitude: number | null;
  onChangeText: (value: string) => void;
  onPlaceSelected: (place: PlaceSelection) => void;
  primaryColor?: string;
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
  primaryColor = colors.primary,
}: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reverse(lat: number, lng: number) {
    setLocating(true);
    setError(null);
    try {
      const response = await mobileClient.places.reverse({ latitude: lat, longitude: lng });
      onPlaceSelected(asPlace(response.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to identify this map location.');
      onPlaceSelected({
        formattedAddress: value,
        line1: value,
        latitude: lat,
        longitude: lng,
      });
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <AddressPlacesField
        label="Search address, building or landmark"
        value={value}
        onChangeText={onChangeText}
        onPlaceSelected={onPlaceSelected}
        primaryColor={primaryColor}
        latitude={latitude}
        longitude={longitude}
      />
      <AddressMapPicker
        value={value}
        onChangeText={onChangeText}
        latitude={latitude}
        longitude={longitude}
        onLocationChange={(lat, lng) => void reverse(lat, lng)}
        primaryColor={primaryColor}
      />
      {locating ? <Text style={{ ...typography.caption, color: colors.mutedForeground }}>Finding address…</Text> : null}
      {error ? <Text style={{ ...typography.caption, color: colors.destructive }}>{error}</Text> : null}
    </View>
  );
}
