import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { birthdayLabel, upcomingBirthdayPets } from './petHelpers';
import type { ShopPet } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function MyPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [pets, setPets] = useState<ShopPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
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

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return pets;
    return pets.filter((pet) =>
      [pet.name, pet.species, pet.breed, pet.sex].filter(Boolean).join(' ').toLowerCase().includes(needle),
    );
  }, [pets, search]);
  const upcoming = useMemo(() => upcomingBirthdayPets(pets), [pets]);

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
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.search}
            placeholder="Search pets"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {!loading ? (
          <Text style={styles.count}>
            {visible.length} {visible.length === 1 ? 'pet' : 'pets'}
          </Text>
        ) : null}
      </View>
      {loading && !pets.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={primary}
            colors={[primary]}
          />
        }
        ListHeaderComponent={
          upcoming.length ? (
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
          ) : null
        }
        renderItem={({ item }) => {
          const photo = resolveMediaUrl(item.photo_url);
          const details = [item.species, item.breed, item.sex].filter(Boolean).join(' · ');
          const birthday = birthdayLabel(item.birthday);
          return (
            <Pressable style={styles.card} onPress={() => navigation.navigate('PetDetail', { petId: item.id })}>
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
                {birthday ? (
                  <View style={styles.birthdayRow}>
                    <Feather name="gift" size={12} color={primary} />
                    <Text style={[styles.birthdayText, { color: primary }]}>{birthday}</Text>
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
              title={search ? 'No matching pets' : 'Add your first pet'}
              description={
                search
                  ? 'Try another name or breed.'
                  : 'Save a profile so the shop knows them, and we’ll remind you 5 days before their birthday.'
              }
            />
          ) : null
        }
        ListFooterComponent={
          !loading ? (
            <Pressable
              style={[styles.addBtn, { borderColor: primary }]}
              onPress={() => navigation.navigate('PetForm', {})}
            >
              <Feather name="plus" size={16} color={primary} />
              <Text style={[styles.addText, { color: primary }]}>Add a pet</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  count: { ...typography.caption, color: colors.mutedForeground },
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
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
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.card,
  },
  addText: { fontWeight: '700' },
});
