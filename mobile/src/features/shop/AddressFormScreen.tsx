import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { ADDRESS_TYPES, toCoordinate, type AddressTypeKey } from './addressUtils';
import type { RootStackParamList } from '../../navigation/types';

type AddressFormRoute = RouteProp<RootStackParamList, 'AddressForm'>;

export function AddressFormScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AddressFormRoute>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;

  const addressId = route.params?.addressId;
  const selectOnSave = Boolean(route.params?.selectOnSave);
  const editing = Boolean(addressId);

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('India');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressType, setAddressType] = useState<AddressTypeKey>('home');
  const [isDefault, setIsDefault] = useState(false);
  const [wasDefault, setWasDefault] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!addressId) return;
    try {
      const res = await mobileClient.mobile.listAddresses({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      const found = res.data.find((item) => item.id === addressId);
      if (!found) {
        setError('This address is no longer available.');
        return;
      }
      setLine1(found.line1 || '');
      setLine2(found.line2 || '');
      setCity(found.city || '');
      setState(found.state || '');
      setCountry(found.country || '');
      setPostalCode(found.postal_code || '');
      setLatitude(toCoordinate(found.latitude));
      setLongitude(toCoordinate(found.longitude));
      const type = String(found.address_type || 'home').toLowerCase();
      setAddressType(ADDRESS_TYPES.some((item) => item.key === type) ? (type as AddressTypeKey) : 'other');
      setIsDefault(Boolean(found.is_default));
      setWasDefault(Boolean(found.is_default));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this address.');
    } finally {
      setLoading(false);
    }
  }, [addressId, businessCode, tenantSlug]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function save() {
    if (!line1.trim()) {
      setLineError('Search for your address or drop a pin on the map.');
      return;
    }
    setLineError(null);
    setError(null);
    setSaving(true);
    const payload = {
      line1: line1.trim(),
      line2: line2.trim(),
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      postal_code: postalCode.trim(),
      latitude,
      longitude,
      address_type: addressType,
      is_default: isDefault,
    };
    try {
      const saved = editing
        ? await mobileClient.mobile.updateAddress(addressId!, payload, {
            tenant_slug: tenantSlug,
            business_code: businessCode,
          })
        : await mobileClient.mobile.createAddress({
            tenant_slug: tenantSlug,
            business_code: businessCode,
            ...payload,
          });
      if (selectOnSave && saved.data?.id) {
        navigation.navigate('Cart', { selectedAddressId: saved.data.id });
        return;
      }
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this address. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Edit address" onBack={() => navigation.goBack()} />
        <View style={styles.loader}>
          <ActivityIndicator color={primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScreenHeader title={editing ? 'Edit address' : 'Add a new address'} onBack={() => navigation.goBack()} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg }}
      >
        {error ? <FormAlert message={error} /> : null}

        <Card style={styles.section}>
          <SectionHead
            icon="map"
            title="Pin your location"
            subtitle="Search an address or move the pin — we fill the rest in for you."
            primaryColor={primary}
          />
          <AddressLocationPicker
            value={line1}
            latitude={latitude}
            longitude={longitude}
            primaryColor={primary}
            onChangeText={(value) => {
              setLine1(value);
              if (lineError) setLineError(null);
            }}
            onPlaceSelected={(place) => {
              setLine1(place.line1 || place.formattedAddress);
              setCity(place.city || '');
              setState(place.state || '');
              setCountry(place.country || '');
              setPostalCode(place.postalCode || '');
              setLatitude(place.latitude ?? null);
              setLongitude(place.longitude ?? null);
              setLineError(null);
            }}
          />
          {lineError ? <Text style={styles.fieldError}>{lineError}</Text> : null}
        </Card>

        <Card style={styles.section}>
          <SectionHead icon="home" title="Address details" primaryColor={primary} />
          <Input
            label="Flat, floor or landmark"
            hint="Optional, but it helps the delivery partner reach your door."
            placeholder="Flat 302, B wing, near City Mall"
            value={line2}
            onChangeText={setLine2}
          />
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Input label="City" placeholder="City" value={city} onChangeText={setCity} />
            </View>
            <View style={styles.rowItem}>
              <Input label="State" placeholder="State" value={state} onChangeText={setState} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Input
                label="Pincode"
                placeholder="400001"
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.rowItem}>
              <Input label="Country" placeholder="Country" value={country} onChangeText={setCountry} />
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <SectionHead icon="tag" title="Save this address as" primaryColor={primary} />
          <View style={styles.typeRow}>
            {ADDRESS_TYPES.map((item) => {
              const active = item.key === addressType;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setAddressType(item.key)}
                  style={[
                    styles.typeChip,
                    active ? { borderColor: primary, backgroundColor: `${primary}12` } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Feather name={item.icon} size={14} color={active ? primary : colors.mutedForeground} />
                  <Text style={[styles.typeChipText, active ? { color: primary } : null]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.defaultRow}>
            <View style={styles.defaultCopy}>
              <Text style={styles.defaultTitle}>Make this my default address</Text>
              <Text style={styles.defaultSubtitle}>
                {wasDefault
                  ? 'This is already your default address.'
                  : 'It will be pre-selected at checkout.'}
              </Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              disabled={wasDefault}
              trackColor={{ false: colors.muted, true: `${primary}66` }}
              thumbColor={isDefault ? primary : '#FFFFFF'}
            />
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={editing ? 'Save changes' : 'Save address'}
          size="lg"
          fullWidth
          loading={saving}
          primaryColor={primary}
          onPress={() => void save()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function SectionHead({
  icon,
  title,
  subtitle,
  primaryColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  primaryColor: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, { backgroundColor: `${primaryColor}14` }]}>
        <Feather name={icon} size={15} color={primaryColor} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sectionIcon: { width: 30, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  sectionSubtitle: { ...typography.caption, color: colors.mutedForeground, lineHeight: 17 },
  fieldError: { ...typography.caption, color: colors.destructive },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeChipText: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  defaultCopy: { flex: 1, gap: 2 },
  defaultTitle: { ...typography.label, color: colors.foreground },
  defaultSubtitle: { ...typography.caption, color: colors.mutedForeground },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
