import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
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
    if (!line1.trim()) return;
    setSaving(true);
    try {
      await mobileClient.mobile.createAddress({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        line1,
        city,
        postal_code: postalCode,
        address_type: 'home',
        is_default: addresses.length === 0,
      });
      setLine1('');
      setCity('');
      setPostalCode('');
      await load();
    } catch (err) {
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Addresses" onBack={() => navigation.goBack()} />
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180, flexGrow: 1 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
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
                  .deleteAddress(item.id, { tenant_slug: tenantSlug, business_code: businessCode })
                  .then(load)
              }
            >
              <Text style={{ color: colors.destructive, marginTop: 8 }}>Delete</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState icon="map-pin" title="No saved addresses" description="Add a delivery address below for faster checkout." />
        }
      />
      <View style={[styles.form, { paddingBottom: insets.bottom + spacing.md }]}>
        <TextInput style={styles.input} placeholder="Address line" value={line1} onChangeText={setLine1} />
        <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        <TextInput
          style={styles.input}
          placeholder="Postal code"
          value={postalCode}
          onChangeText={setPostalCode}
          keyboardType="number-pad"
        />
        <Pressable style={[styles.button, { backgroundColor: primary }]} disabled={saving} onPress={() => void addAddress()}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Add address'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md },
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
