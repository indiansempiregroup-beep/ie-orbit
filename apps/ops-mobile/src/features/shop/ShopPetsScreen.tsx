import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomers } from '../../hooks/useOpsData';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { DesktopPage } from '../../components/DesktopPage';
import { EmptyState } from '../../components/ui/EmptyState';
import { RemoteImage } from '../../components/RemoteImage';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useUpdateBusinessAddons, useBusinessBillingSnapshot } from '../../hooks/useOpsExtended';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPet } from '@ie-platform/sdk';
import { hasPetsPack, PETS_PACK_PRICE_INR } from '../../utils/products';
import { shopListRefreshControl } from './shopRefreshControl';

export function ShopPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId, activeBusiness, refreshWorkspace } = useWorkspace();
  const { customers } = useCustomers();
  const addons = useUpdateBusinessAddons();
  const { billing } = useBusinessBillingSnapshot();
  const petsPriceInr = Math.round(
    (billing?.pricing?.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100) / 100,
  );
  const petsSubscribed = hasPetsPack(activeBusiness?.product_subscriptions);
  const [pets, setPets] = useState<ShopPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    try {
      if (petsSubscribed) {
        const petsRes = await client.shop.listPets({ business_id: businessId });
        setPets(petsRes.data);
      } else {
        setPets([]);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load pets');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, petsSubscribed]);

  const subscribePets = useCallback(async () => {
    const shopie = activeBusiness?.product_subscriptions?.find(
      (subscription) =>
        subscription.product_code === 'shopie' &&
        (subscription.status === 'active' || subscription.status === 'trialing'),
    );
    if (!shopie) {
      setMessage('Subscribe to ShopIE first, then add the Pets pack.');
      return;
    }
    setSubscribing(true);
    setMessage(null);
    try {
      await addons.update('shopie', {
        extra_staff: shopie.extra_staff ?? 0,
        extra_offices: shopie.extra_offices ?? 0,
        pets_pack_enabled: true,
      });
      await refreshWorkspace();
      setMessage(`Pets pack subscribed · ₹${petsPriceInr}/month`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to subscribe to Pets pack');
    } finally {
      setSubscribing(false);
    }
  }, [activeBusiness?.product_subscriptions, addons, petsPriceInr, refreshWorkspace]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        petsSubscribed ? (
          <Pressable
            onPress={() => navigation.navigate('ShopPetForm')}
            accessibilityRole="button"
            accessibilityLabel="Add pet"
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Feather name="plus" size={20} color={colors.primary} />
          </Pressable>
        ) : null,
    });
  }, [navigation, petsSubscribed]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await refreshWorkspace();
    await load();
  });

  const speciesOptions = useMemo(() => {
    const values = Array.from(
      new Set(pets.map((pet) => (pet.species || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    return [{ value: '', label: 'All species' }, ...values.map((value) => ({ value, label: value }))];
  }, [pets]);

  const customerOptions = useMemo(() => {
    const fromPets = pets
      .map((pet) => ({
        value: pet.customer,
        label: pet.customer_name || pet.customer,
      }))
      .filter((item) => item.value);
    const fromCustomers = (customers ?? []).map((customer) => ({
      value: customer.id,
      label:
        customer.full_name ||
        customer.display_name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
        customer.email ||
        customer.phone_number ||
        customer.id,
    }));
    const map = new Map<string, string>();
    for (const option of [...fromPets, ...fromCustomers]) {
      if (!map.has(option.value)) map.set(option.value, option.label);
    }
    return [
      { value: '', label: 'All owners' },
      ...Array.from(map.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [pets, customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pets.filter((pet) => {
      if (speciesFilter && (pet.species || '').toLowerCase() !== speciesFilter.toLowerCase()) {
        return false;
      }
      if (customerFilter && pet.customer !== customerFilter) return false;
      if (!term) return true;
      return [pet.name, pet.species ?? '', pet.breed ?? '', pet.customer_name ?? '', pet.medical_notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [pets, search, speciesFilter, customerFilter]);

  const activeFilterCount = [speciesFilter, customerFilter, search.trim()].filter(Boolean).length;

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        {message ? <Text style={styles.meta}>{message}</Text> : null}

        {!petsSubscribed ? (
          <RefreshableScrollView
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + spacing.xl }}
          >
            <Text style={styles.title}>Pets pack</Text>
            <Text style={styles.meta}>
              Manage pet profiles, photos, birthdays, and owner alerts. Birthday reminders go out 5 days
              ahead to the pet owner (in-app + email) and to business owners/managers.
            </Text>
            <Text style={styles.price}>₹{petsPriceInr}/month</Text>
            <Pressable
              style={[styles.button, subscribing && styles.buttonDisabled]}
              onPress={() => void subscribePets()}
              disabled={subscribing}
            >
              <Text style={styles.buttonText}>
                {subscribing ? 'Subscribing…' : `Subscribe · ₹${petsPriceInr}/mo`}
              </Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ProductSettings')}>
              <Text style={styles.link}>Or manage from Product settings</Text>
            </Pressable>
          </RefreshableScrollView>
        ) : (
          <>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search pet, breed, owner…"
              style={styles.search}
            />
            <View style={styles.filters}>
              <View style={styles.filterHalf}>
                <SelectField
                  label="Species"
                  value={speciesFilter}
                  options={speciesOptions}
                  onChange={setSpeciesFilter}
                />
              </View>
              <View style={styles.filterHalf}>
                <SelectField
                  label="Owner"
                  value={customerFilter}
                  options={customerOptions}
                  onChange={setCustomerFilter}
                  searchable
                />
              </View>
            </View>
            {activeFilterCount ? (
              <View style={styles.filterMetaRow}>
                <Text style={styles.meta}>
                  {filtered.length} pet{filtered.length === 1 ? '' : 's'}
                  {` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`}
                </Text>
                <Pressable
                  onPress={() => {
                    setSearch('');
                    setSpeciesFilter('');
                    setCustomerFilter('');
                  }}
                >
                  <Text style={styles.clearFilters}>Clear filters</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.meta, styles.countMeta]}>
                {filtered.length} pet{filtered.length === 1 ? '' : 's'}
              </Text>
            )}

            {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              refreshControl={shopListRefreshControl(refreshing, onRefresh)}
              contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
              renderItem={({ item }) => {
                const photoUri = resolveMediaUrl(item.photo_url);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => navigation.navigate('ShopPetDetail', { petId: item.id })}
                  >
                    <View style={styles.rowInner}>
                      {photoUri ? (
                        <RemoteImage uri={photoUri} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]}>
                          <Feather name="heart" size={18} color={colors.mutedForeground} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{item.name}</Text>
                        <Text style={styles.meta}>
                          {[item.species, item.breed].filter(Boolean).join(' · ') || 'No species'}
                          {item.birthday ? ` · birthday ${item.birthday}` : ''}
                        </Text>
                        <Text style={styles.meta}>
                          {item.customer_name ? `Owner: ${item.customer_name}` : 'No owner name'}
                          {item.sex ? ` · ${item.sex}` : ''}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                !loading ? (
                  <EmptyState
                    icon="heart"
                    title={pets.length ? 'No matching pets' : 'No pets yet'}
                    message={
                      pets.length
                        ? 'Try another search or clear filters.'
                        : 'Add a pet profile with photo, birthday, and owner details.'
                    }
                    actionLabel={pets.length ? undefined : 'Add pet'}
                    onAction={pets.length ? undefined : () => navigation.navigate('ShopPetForm')}
                  />
                ) : null
              }
            />
          </>
        )}
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  search: { marginBottom: spacing.sm },
  filters: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
  filterHalf: { flex: 1 },
  filterMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  countMeta: { marginBottom: spacing.sm },
  clearFilters: { color: colors.primary, fontWeight: '600' },
  title: { fontWeight: '700', fontSize: 22, color: colors.foreground },
  price: { fontWeight: '700', fontSize: 28, color: colors.foreground, marginVertical: spacing.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { color: colors.primary, fontWeight: '600', marginTop: spacing.md },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbEmpty: {
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
});
