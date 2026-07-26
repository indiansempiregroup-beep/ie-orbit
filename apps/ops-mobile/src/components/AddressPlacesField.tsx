import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type PlaceSelection = {
  formattedAddress: string;
  line1: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  onPlaceSelected?: (place: PlaceSelection) => void;
};

type Prediction = {
  place_id: string;
  description: string;
};

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

function componentByType(
  components: Array<{ long_name: string; short_name: string; types: string[] }> | undefined,
  type: string,
) {
  return components?.find((item) => item.types.includes(type))?.long_name ?? '';
}

export function AddressPlacesField({
  label = 'Address',
  value,
  onChangeText,
  onPlaceSelected,
}: Props) {
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (selectingRef.current) {
      selectingRef.current = false;
      return;
    }
    if (!PLACES_KEY) {
      setPredictions([]);
      return;
    }
    const term = query.trim();
    if (term.length < 3) {
      setPredictions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const url =
            `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
            `?input=${encodeURIComponent(term)}&key=${encodeURIComponent(PLACES_KEY)}`;
          const response = await fetch(url);
          const payload = (await response.json()) as {
            status?: string;
            error_message?: string;
            predictions?: Prediction[];
          };
          if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
            setError(payload.error_message || `Places lookup failed (${payload.status}).`);
            setPredictions([]);
            return;
          }
          setPredictions(payload.predictions ?? []);
        } catch {
          setError('Unable to search places right now.');
          setPredictions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function selectPrediction(prediction: Prediction) {
    selectingRef.current = true;
    setPredictions([]);
    setQuery(prediction.description);
    onChangeText(prediction.description);

    if (!PLACES_KEY) return;

    setLoading(true);
    setError(null);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${encodeURIComponent(prediction.place_id)}` +
        `&fields=formatted_address,geometry,address_component` +
        `&key=${encodeURIComponent(PLACES_KEY)}`;
      const response = await fetch(url);
      const payload = (await response.json()) as {
        status?: string;
        error_message?: string;
        result?: {
          formatted_address?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
          address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
        };
      };
      if (payload.status && payload.status !== 'OK') {
        setError(payload.error_message || `Place details failed (${payload.status}).`);
        return;
      }

      const result = payload.result;
      const formatted = result?.formatted_address || prediction.description;
      const city =
        componentByType(result?.address_components, 'locality') ||
        componentByType(result?.address_components, 'administrative_area_level_2');
      const state = componentByType(result?.address_components, 'administrative_area_level_1');
      const country = componentByType(result?.address_components, 'country');
      const postalCode = componentByType(result?.address_components, 'postal_code');
      const latitude = result?.geometry?.location?.lat ?? null;
      const longitude = result?.geometry?.location?.lng ?? null;

      selectingRef.current = true;
      setQuery(formatted);
      onChangeText(formatted);
      onPlaceSelected?.({
        formattedAddress: formatted,
        line1: formatted,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        postalCode: postalCode || undefined,
        latitude,
        longitude,
      });
    } catch {
      setError('Unable to load place details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <Feather name="map-pin" size={16} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            onChangeText(text);
          }}
          placeholder={PLACES_KEY ? 'Search address on Google Maps' : 'Enter full address'}
          placeholderTextColor={colors.mutedForeground}
          style={styles.input}
          multiline
        />
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {!PLACES_KEY ? (
        <Text style={styles.hint}>
          Set EXPO_PUBLIC_GOOGLE_PLACES_API_KEY in the repo-root .env to enable Google Places autocomplete.
        </Text>
      ) : null}
      {predictions.length ? (
        <View style={styles.suggestions}>
          {predictions.map((item) => (
            <Pressable key={item.place_id} style={styles.suggestion} onPress={() => void selectPrediction(item)}>
              <Feather name="map-pin" size={14} color={colors.primary} />
              <Text style={styles.suggestionText}>{item.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  field: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    minHeight: 40,
    paddingTop: 0,
    textAlignVertical: 'top',
  },
  hint: { ...typography.caption, color: colors.mutedForeground },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: { ...typography.body, color: colors.foreground, flex: 1 },
  error: { ...typography.caption, color: colors.destructive },
});
