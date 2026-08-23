import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { mobileClient } from '../api/client';
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
  primaryColor?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Prediction = {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text?: string;
};

function newSessionToken() {
  return globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AddressPlacesField({
  label = 'Address',
  value,
  onChangeText,
  onPlaceSelected,
  primaryColor = colors.primary,
  latitude,
  longitude,
}: Props) {
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);
  const sessionTokenRef = useRef(newSessionToken());

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (selectingRef.current) {
      selectingRef.current = false;
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
          const response = await mobileClient.places.autocomplete({
            input: term,
            session_token: sessionTokenRef.current,
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
            country_code: 'IN',
          });
          setPredictions(response.data.predictions ?? []);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to search places right now.');
          setPredictions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [latitude, longitude, query]);

  async function selectPrediction(prediction: Prediction) {
    selectingRef.current = true;
    setPredictions([]);
    setQuery(prediction.description);
    onChangeText(prediction.description);
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.places.details({
        place_id: prediction.place_id,
        session_token: sessionTokenRef.current,
      });
      sessionTokenRef.current = newSessionToken();
      const result = response.data;
      const formatted = result.formatted_address || prediction.description;
      selectingRef.current = true;
      setQuery(formatted);
      onChangeText(formatted);
      onPlaceSelected?.({
        formattedAddress: formatted,
        line1: result.line1 || formatted,
        city: result.city || undefined,
        state: result.state || undefined,
        country: result.country || undefined,
        postalCode: result.postal_code || undefined,
        latitude: result.latitude ?? null,
        longitude: result.longitude ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load place details.');
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
          placeholder="Search address on Google Maps"
          placeholderTextColor={colors.mutedForeground}
          style={styles.input}
          multiline
        />
        {loading ? <ActivityIndicator size="small" color={primaryColor} /> : null}
      </View>
      {predictions.length ? (
        <View style={styles.suggestions}>
          {predictions.map((item) => (
            <Pressable key={item.place_id} style={styles.suggestion} onPress={() => void selectPrediction(item)}>
              <Feather name="map-pin" size={14} color={primaryColor} />
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionText}>{item.main_text || item.description}</Text>
                {item.secondary_text ? (
                  <Text style={styles.suggestionSecondary}>{item.secondary_text}</Text>
                ) : null}
              </View>
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
    backgroundColor: colors.card,
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
  suggestionCopy: { flex: 1, gap: 2 },
  suggestionSecondary: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
});
