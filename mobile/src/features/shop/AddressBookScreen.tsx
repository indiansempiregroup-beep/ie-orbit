import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { FormAlert } from '../../components/ui/FormAlert';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { addressLines, addressTypeMeta, hasMapPin } from './addressUtils';
import type { CustomerAddress } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type AddressBookRoute = RouteProp<RootStackParamList, 'AddressBook'>;

export function AddressBookScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AddressBookRoute>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const selectMode = route.params?.mode === 'select';
  const activeId = route.params?.selectedAddressId;

  const load = useCallback(async () => {
    try {
      const res = await mobileClient.mobile.listAddresses({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setAddresses(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your addresses.');
    } finally {
      setLoading(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function makeDefault(address: CustomerAddress) {
    if (!address.id) return;
    setBusyId(address.id);
    try {
      await mobileClient.mobile.updateAddress(
        address.id,
        { is_default: true },
        { tenant_slug: tenantSlug, business_code: businessCode },
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update this address.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(address: CustomerAddress) {
    if (!address.id) return;
    setBusyId(address.id);
    try {
      await mobileClient.mobile.deleteAddress(address.id, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete this address.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(address: CustomerAddress) {
    Alert.alert('Remove address?', 'This address will no longer be available at checkout.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(address) },
    ]);
  }

  function chooseAddress(address: CustomerAddress) {
    if (!address.id) return;
    navigation.navigate('Cart', { selectedAddressId: address.id });
  }

  const defaultAddress = addresses.find((item) => item.is_default);
  const otherAddresses = addresses.filter((item) => item !== defaultAddress);

  function renderCard(address: CustomerAddress) {
    return (
      <AddressCard
        key={address.id}
        address={address}
        primaryColor={primary}
        selectMode={selectMode}
        selected={selectMode && (activeId ? address.id === activeId : Boolean(address.is_default))}
        busy={busyId === address.id}
        onPress={() =>
          selectMode
            ? chooseAddress(address)
            : navigation.navigate('AddressForm', { addressId: address.id })
        }
        onEdit={() => navigation.navigate('AddressForm', { addressId: address.id, selectOnSave: selectMode })}
        onMakeDefault={() => void makeDefault(address)}
        onRemove={() => confirmRemove(address)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={selectMode ? 'Select address' : 'Your addresses'}
        onBack={() => navigation.goBack()}
      />
      <RefreshableScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.lg,
        }}
        refreshing={refreshing}
        onRefresh={refresh}
        primaryColor={primary}
      >
        {error ? <FormAlert message={error} /> : null}

        <Pressable
          style={({ pressed }) => [styles.addTile, pressed && styles.pressed]}
          onPress={() => navigation.navigate('AddressForm', { selectOnSave: selectMode })}
        >
          <View style={[styles.addIcon, { backgroundColor: `${primary}14` }]}>
            <Feather name="plus" size={18} color={primary} />
          </View>
          <View style={styles.addCopy}>
            <Text style={styles.addTitle}>Add a new address</Text>
            <Text style={styles.addSubtitle}>Drop a map pin for faster, accurate delivery</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={primary} />
          </View>
        ) : addresses.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title="No saved addresses"
            description="Save an address once and reuse it for every order."
          />
        ) : (
          <>
            {defaultAddress ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Default address</Text>
                {renderCard(defaultAddress)}
              </View>
            ) : null}
            {otherAddresses.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {defaultAddress ? 'Other addresses' : 'Saved addresses'}
                </Text>
                {otherAddresses.map(renderCard)}
              </View>
            ) : null}
          </>
        )}
      </RefreshableScrollView>
    </View>
  );
}

type CardProps = {
  address: CustomerAddress;
  primaryColor: string;
  selectMode: boolean;
  selected: boolean;
  busy: boolean;
  onPress: () => void;
  onEdit: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
};

function AddressCard({
  address,
  primaryColor,
  selectMode,
  selected,
  busy,
  onPress,
  onEdit,
  onMakeDefault,
  onRemove,
}: CardProps) {
  const meta = addressTypeMeta(address.address_type);
  const lines = addressLines(address);
  const pinned = hasMapPin(address);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        selected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}0D` } : null,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} address, ${lines.join(', ')}`}
    >
      <View style={styles.cardHead}>
        {selectMode ? (
          <View style={[styles.radio, selected ? { borderColor: primaryColor } : null]}>
            {selected ? <View style={[styles.radioDot, { backgroundColor: primaryColor }]} /> : null}
          </View>
        ) : (
          <View style={[styles.typeIcon, { backgroundColor: `${primaryColor}14` }]}>
            <Feather name={meta.icon} size={16} color={primaryColor} />
          </View>
        )}
        <Text style={styles.typeLabel}>{meta.label}</Text>
        {address.is_default ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>DEFAULT</Text>
          </View>
        ) : null}
        {busy ? <ActivityIndicator size="small" color={primaryColor} /> : null}
      </View>

      <View style={styles.linesWrap}>
        {lines.map((line, index) => (
          <Text key={`${line}-${index}`} style={index === 0 ? styles.lineStrong : styles.line}>
            {line}
          </Text>
        ))}
      </View>

      {!pinned ? (
        <View style={styles.warnRow}>
          <Feather name="alert-triangle" size={12} color={colors.warning} />
          <Text style={styles.warnText}>No map pin saved — instant delivery may be unavailable</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <CardAction icon="edit-2" label="Edit" onPress={onEdit} disabled={busy} />
        {!address.is_default ? (
          <CardAction icon="check-circle" label="Set as default" onPress={onMakeDefault} disabled={busy} />
        ) : null}
        <CardAction icon="trash-2" label="Remove" tone="danger" onPress={onRemove} disabled={busy} />
      </View>
    </Pressable>
  );
}

function CardAction({
  icon,
  label,
  onPress,
  tone = 'default',
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  const tint = tone === 'danger' ? colors.destructive : colors.mutedForeground;
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Feather name={icon} size={13} color={tint} />
      <Text style={[styles.actionText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  addTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  addIcon: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  addCopy: { flex: 1, gap: 2 },
  addTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  addSubtitle: { ...typography.caption, color: colors.mutedForeground },
  section: { gap: spacing.sm },
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeIcon: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.full },
  typeLabel: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  defaultBadgeText: { ...typography.tiny, color: colors.secondaryForeground, fontWeight: '700', letterSpacing: 0.5 },
  linesWrap: { gap: 2 },
  lineStrong: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  line: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warnText: { ...typography.caption, color: colors.warning, flex: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { ...typography.caption, fontWeight: '600' },
});
