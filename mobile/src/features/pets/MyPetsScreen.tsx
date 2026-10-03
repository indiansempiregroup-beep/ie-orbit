import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { AmazonFilterSheet, SearchFilterToolbar } from '../../components/AmazonFilterSheet';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { groupedListProps } from '../../components/ui/GroupedList';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { PET_SEX, PET_SPECIES, birthdayLabel, daysUntilBirthday, upcomingBirthdayPets } from './petHelpers';
import type { ShopPet } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type PetFilterDraft = {
  species: string;
  sex: string;
  birthday: string;
};

const BIRTHDAY_OPTIONS = [
  { id: 'all', label: 'Any birthday' },
  { id: 'upcoming', label: 'Coming up (7 days)' },
];

function countActivePetFilters(filters: PetFilterDraft): number {
  let count = 0;
  if (filters.species !== 'all') count += 1;
  if (filters.sex !== 'all') count += 1;
  if (filters.birthday !== 'all') count += 1;
  return count;
}

const EMPTY_FILTERS: PetFilterDraft = { species: 'all', sex: 'all', birthday: 'all' };

export function MyPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [pets, setPets] = useState<ShopPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState('all');
  const [sex, setSex] = useState('all');
  const [birthday, setBirthday] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<PetFilterDraft>(EMPTY_FILTERS);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const res = await mobileClient.mobile.listMyPets({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setPets(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const appliedFilters: PetFilterDraft = useMemo(
    () => ({ species, sex, birthday }),
    [birthday, sex, species],
  );
  const activeFilterCount = countActivePetFilters(appliedFilters);

  const speciesOptions = useMemo(() => {
    const fromPets = Array.from(
      new Set(pets.map((pet) => String(pet.species || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    const labels = fromPets.length ? fromPets : [...PET_SPECIES];
    return [{ id: 'all', label: 'Any species' }, ...labels.map((label) => ({ id: label, label }))];
  }, [pets]);

  const sexOptions = useMemo(
    () => [{ id: 'all', label: 'Any sex' }, ...PET_SEX.map((label) => ({ id: label, label }))],
    [],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pets.filter((pet) => {
      if (species !== 'all' && String(pet.species || '').toLowerCase() !== species.toLowerCase()) {
        return false;
      }
      if (sex !== 'all' && String(pet.sex || '').toLowerCase() !== sex.toLowerCase()) return false;
      if (birthday === 'upcoming') {
        const days = daysUntilBirthday(pet.birthday);
        if (days == null || days > 7) return false;
      }
      if (!needle) return true;
      return [pet.name, pet.species, pet.breed, pet.sex]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [birthday, pets, search, sex, species]);

  const upcoming = useMemo(() => upcomingBirthdayPets(pets), [pets]);

  const activeSummary = [
    species !== 'all' ? species : null,
    sex !== 'all' ? sex : null,
    birthday !== 'all' ? BIRTHDAY_OPTIONS.find((item) => item.id === birthday)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function openFilters() {
    setDraft(appliedFilters);
    setFilterOpen(true);
  }

  function clearAppliedFilters() {
    setSpecies('all');
    setSex('all');
    setBirthday('all');
    setSearch('');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My Pets"
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => navigation.navigate('PetForm', {})}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add pet"
          >
            <Feather name="plus" size={22} color={primary} />
          </Pressable>
        }
      />
      <SearchFilterToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search pets"
        primaryColor={primary}
        activeFilterCount={activeFilterCount}
        onOpenFilters={openFilters}
        activeSummary={activeSummary || undefined}
        onClearFilters={clearAppliedFilters}
        countLabel={loading ? null : `${visible.length} ${visible.length === 1 ? 'pet' : 'pets'}`}
        autoCorrect
      />
      {loading && !pets.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      {upcoming.length ? (
        <Pressable
          style={[styles.birthdayBanner, { borderColor: `${primary}44` }]}
          onPress={() => navigation.navigate('PetDetail', { petId: upcoming[0].id })}
        >
          <View style={[styles.giftIcon, { backgroundColor: `${primary}14` }]}>
            <Feather name="gift" size={18} color={primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {upcoming[0].name}
              {upcoming.length > 1 ? ` and ${upcoming.length - 1} more` : ''}
            </Text>
            <Text style={styles.bannerMeta}>
              {birthdayLabel(upcoming[0].birthday)}. Reminders also show in Notifications.
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        {...groupedListProps(visible.length, styles.listGroup)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={primary}
            colors={[primary]}
          />
        }
        renderItem={({ item }) => {
          const photo = resolveMediaUrl(item.photo_url);
          const details = [item.species, item.breed, item.sex].filter(Boolean).join(' · ');
          const nextBirthday = birthdayLabel(item.birthday);
          return (
            <Pressable style={styles.row} onPress={() => navigation.navigate('PetDetail', { petId: item.id })}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Feather name="heart" size={22} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{details || 'Tap to add breed, birthday, and notes'}</Text>
                {nextBirthday ? (
                  <View style={styles.birthdayRow}>
                    <Feather name="gift" size={12} color={primary} />
                    <Text style={[styles.birthdayText, { color: primary }]}>{nextBirthday}</Text>
                  </View>
                ) : null}
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="heart"
              title={pets.length || search || activeFilterCount ? 'No matching pets' : 'Add your first pet'}
              description={
                pets.length || search || activeFilterCount
                  ? 'Try another search or clear the filters.'
                  : 'Save a profile so the shop knows them, and we’ll remind you 5 days before their birthday.'
              }
            />
          ) : null
        }
      />
      {!loading ? (
        <Pressable
          style={[styles.addBtn, { borderColor: primary }]}
          onPress={() => navigation.navigate('PetForm', {})}
        >
          <Feather name="plus" size={16} color={primary} />
          <Text style={[styles.addText, { color: primary }]}>Add a pet</Text>
        </Pressable>
      ) : null}

      <AmazonFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        primaryColor={primary}
        sections={[
          { id: 'species', label: 'Species', options: speciesOptions },
          { id: 'sex', label: 'Sex', options: sexOptions },
          { id: 'birthday', label: 'Birthday', options: BIRTHDAY_OPTIONS },
        ]}
        values={draft}
        onSelect={(sectionId, optionId) =>
          setDraft((current) => ({ ...current, [sectionId]: optionId }))
        }
        onClear={() => setDraft(EMPTY_FILTERS)}
        applyCount={countActivePetFilters(draft)}
        onApply={() => {
          setSpecies(draft.species);
          setSex(draft.sex);
          setBirthday(draft.birthday);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  listGroup: { marginHorizontal: spacing.lg, marginTop: spacing.lg, flex: 1 },
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  giftIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { ...typography.label, fontWeight: '800', color: colors.foreground },
  bannerMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  photo: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.muted },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  name: { ...typography.label, fontWeight: '800', color: colors.foreground, fontSize: 16 },
  meta: { marginTop: 4, ...typography.caption, color: colors.mutedForeground },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  birthdayText: { ...typography.caption, fontWeight: '700' },
  addBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
  },
  addText: { fontWeight: '700' },
});
