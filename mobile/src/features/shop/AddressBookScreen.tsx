import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { AddressPlacesField } from '../../components/AddressPlacesField';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { CustomerAddress } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function AddressBookScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    const res = await mobileClient.mobile.listAddresses({
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    setAddresses(res.data);
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function addAddress() {
    if (!line1.trim()) {
      Alert.alert('Address needed', 'Search or type a full address first.');
      return;
    }
    setSaving(true);
    try {
      await mobileClient.mobile.createAddress({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        line1,
        city,
        postal_code: postalCode,
        latitude,
        longitude,
        address_type: 'home',
        is_default: addresses.length === 0,
      });
      setLine1('');
      setCity('');
      setPostalCode('');
      setLatitude(null);
      setLongitude(null);
      await load();
    } catch (err) {
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScreenHeader title="Addresses" onBack={() => navigation.goBack()} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
      >
        {addresses.length ? (
          addresses.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.name}>
                {item.address_type || 'Address'}
                {item.is_default ? ' · Default' : ''}
              </Text>
              <Text style={styles.meta}>
                {item.line1}
                {item.city ? `, ${item.city}` : ''}
                {item.postal_code ? ` ${item.postal_code}` : ''}
              </Text>
              <Pressable
                onPress={() =>
                  void mobileClient.mobile
                    .deleteAddress(item.id!, { tenant_slug: tenantSlug, business_code: businessCode })
                    .then(load)
                }
              >
                <Text style={{ color: colors.destructive, marginTop: 8 }}>Delete</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <EmptyState icon="map-pin" title="No saved addresses" description="Search Google Maps or type an address below." />
        )}

        <View style={styles.form}>
          <Text style={styles.formTitle}>Add address</Text>
          <AddressPlacesField
            label="Search address"
            value={line1}
            primaryColor={primary}
            onChangeText={setLine1}
            onPlaceSelected={(place) => {
              setLine1(place.line1 || place.formattedAddress);
              setCity(place.city || '');
              setPostalCode(place.postalCode || '');
              setLatitude(place.latitude ?? null);
              setLongitude(place.longitude ?? null);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            value={city}
            onChangeText={setCity}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            placeholder="Postal code"
            value={postalCode}
            onChangeText={setPostalCode}
            keyboardType="number-pad"
            placeholderTextColor={colors.mutedForeground}
          />
          <Pressable style={[styles.button, { backgroundColor: primary }]} disabled={saving} onPress={() => void addAddress()}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Add address'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground },
  form: {
    gap: 8,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  formTitle: { ...typography.title, color: colors.foreground, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
