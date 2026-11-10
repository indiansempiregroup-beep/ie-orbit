import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { DesktopPage } from '../../components/DesktopPage';
import { EmptyState } from '../../components/ui/EmptyState';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { RemoteImage } from '../../components/RemoteImage';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useUpdateBusinessAddons, useBusinessBillingSnapshot } from '../../hooks/useOpsExtended';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPet } from '@ie-orbit/sdk';
import { hasPetsPack, PETS_PACK_PRICE_INR } from '../../utils/products';
import { shopListRefreshControl } from './shopRefreshControl';

export function ShopPetsScreen() {
  const { t } = useTranslation();
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
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      setMessage(err instanceof Error ? err.message : t('opsApp.shop.pets.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, petsSubscribed, t]);

  const subscribePets = useCallback(async () => {
    const shopie = activeBusiness?.product_subscriptions?.find(
      (subscription) =>
        subscription.product_code === 'shopie' &&
        (subscription.status === 'active' || subscription.status === 'trialing'),
    );
    if (!shopie) {
      setMessage(t('shop.pets.errSubscribeFirst'));
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
      setMessage(t('shop.pets.toastSubscribed', { price: `₹${petsPriceInr}` }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('shop.pets.errSubscribe'));
    } finally {
      setSubscribing(false);
    }
  }, [activeBusiness?.product_subscriptions, addons, petsPriceInr, refreshWorkspace, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        petsSubscribed ? (
          <Pressable
            onPress={() => navigation.navigate('ShopPetForm')}
            accessibilityRole="button"
            accessibilityLabel={t('shop.pets.addPet')}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Feather name="plus" size={20} color={colors.primary} />
          </Pressable>
        ) : null,
    });
  }, [navigation, petsSubscribed, t]);

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
    return [{ value: '', label: t('shop.pets.allSpecies') }, ...values.map((value) => ({ value, label: value }))];
  }, [pets, t]);

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
      { value: '', label: t('opsApp.shop.pets.allOwners') },
      ...Array.from(map.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [pets, customers, t]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = pets.filter((pet) => {
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
    return [...list].sort((a, b) => {
      if (sortBy === 'name_desc') return String(b.name).localeCompare(String(a.name));
      if (sortBy === 'species') return String(a.species || '').localeCompare(String(b.species || ''));
      return String(a.name).localeCompare(String(b.name));
    });
  }, [pets, search, speciesFilter, customerFilter, sortBy]);

  const activeFilterCount =
    Number(Boolean(speciesFilter)) + Number(Boolean(customerFilter)) + Number(sortBy !== 'name_asc');

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
            <Text style={styles.title}>{t('opsApp.shop.pets.packTitle')}</Text>
            <Text style={styles.meta}>
              {t('opsApp.shop.pets.packIntro')}
            </Text>
            <Text style={styles.price}>{t('opsApp.shop.pets.perMonth', { price: `₹${petsPriceInr}` })}</Text>
            <Pressable
              style={[styles.button, subscribing && styles.buttonDisabled]}
              onPress={() => void subscribePets()}
              disabled={subscribing}
            >
              <Text style={styles.buttonText}>
                {subscribing ? t('shop.pets.subscribing') : t('shop.pets.subscribeButton', { price: `₹${petsPriceInr}` })}
              </Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ProductSettings')}>
              <Text style={styles.link}>{t('opsApp.shop.pets.manageFromSettings')}</Text>
            </Pressable>
          </RefreshableScrollView>
        ) : (
          <>
            <View style={styles.topBar}>
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder={t('opsApp.shop.pets.searchLong')}
                style={styles.searchFlex}
              />
              <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
            </View>
            <FilterSheet
              visible={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              onReset={() => {
                setSpeciesFilter('');
                setCustomerFilter('');
                setSortBy('name_asc');
              }}
            >
              <FilterChoiceGroup label={t('shop.pets.species')} value={speciesFilter} options={speciesOptions} onChange={setSpeciesFilter} />
              <FilterChoiceGroup
                label={t('opsApp.shop.pets.owner')}
                value={customerFilter}
                options={customerOptions}
                onChange={setCustomerFilter}
                searchable
              />
              <FilterChoiceGroup
                label={t('shop.products.filterSort')}
                value={sortBy}
                options={[
                  { value: 'name_asc', label: t('shop.products.sort.nameAsc') },
                  { value: 'name_desc', label: t('shop.products.sort.nameDesc') },
                  { value: 'species', label: t('shop.pets.species') },
                ]}
                onChange={setSortBy}
              />
            </FilterSheet>
            {activeFilterCount ? (
              <View style={styles.filterMetaRow}>
                <Text style={styles.meta}>
                  {t('opsApp.shop.pets.petsCount', { count: filtered.length })}
                  {` · ${t('opsApp.shop.pets.filtersCount', { count: activeFilterCount })}`}
                </Text>
                <Pressable
                  onPress={() => {
                    setSearch('');
                    setSpeciesFilter('');
                    setCustomerFilter('');
                  }}
                >
                  <Text style={styles.clearFilters}>{t('shop.products.clearFilters')}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.meta, styles.countMeta]}>
                {t('opsApp.shop.pets.petsCount', { count: filtered.length })}
              </Text>
            )}

            {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
            <FlatList
              {...groupedListProps(filtered.length)}
              data={filtered}
              keyExtractor={(item) => item.id}
              refreshControl={shopListRefreshControl(refreshing, onRefresh)}
              contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
              renderItem={({ item }) => {
                const owner = item.customer_name
                  ? t('opsApp.shop.pets.ownerLine', { name: item.customer_name })
                  : t('opsApp.shop.pets.noOwnerName');
                return (
                  <BooksDocumentRow
                    title={item.name}
                    meta={[[item.species, item.breed].filter(Boolean).join(' · ') || t('shop.pets.noSpecies'), item.birthday ? t('shop.pets.birthdayShort', { date: item.birthday }) : '', owner, item.sex]
                      .filter(Boolean)
                      .join(' · ')}
                    badge={item.species || t('shop.pets.defaultPet')}
                    icon="heart"
                    iconTone="rose"
                    onPress={() => navigation.navigate('ShopPetDetail', { petId: item.id })}
                  />
                );
              }}
              ListEmptyComponent={
                !loading ? (
                  <EmptyState
                    icon="heart"
                    title={pets.length ? t('opsApp.shop.pets.emptyNoMatch') : t('opsApp.shop.pets.emptyNoneTitle')}
                    message={
                      pets.length
                        ? t('opsApp.shop.pets.emptyTryAnother')
                        : t('opsApp.shop.pets.emptyNoneMessage')
                    }
                    actionLabel={pets.length ? undefined : t('shop.pets.addPet')}
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
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
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
