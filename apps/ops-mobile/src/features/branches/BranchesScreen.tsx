import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Branch } from '@ie-orbit/sdk';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { DesktopPage } from '../../components/DesktopPage';
import { EmptyState } from '../../components/ui/EmptyState';
import { BooksDocumentRow } from '../shop/BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBranches } from '../../hooks/useOpsExtended';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: '', label: 'All statuses' },
];

function isActive(branch: Branch) {
  return (branch.status ?? 'active') === 'active';
}

export function BranchesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branches, loading, reload } = useBranches();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('BranchForm')}
          accessibilityRole="button"
          accessibilityLabel="Add office"
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return branches.filter((branch) => {
      if (status === 'active' && !isActive(branch)) return false;
      if (status === 'inactive' && isActive(branch)) return false;
      if (!term) return true;
      return [
        branch.display_name,
        branch.branch_name,
        branch.address_line1,
        branch.city,
        branch.state,
        branch.postal_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [branches, search, status]);

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.topBar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search offices"
            style={styles.searchFlex}
          />
          <FilterButton count={Number(status !== 'active')} onPress={() => setFiltersOpen(true)} />
        </View>
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => setStatus('active')}
        >
          <FilterChoiceGroup label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </FilterSheet>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const active = isActive(item);
            const hasPin = item.latitude != null && item.longitude != null;
            return (
              <BooksDocumentRow
                title={item.display_name ?? item.branch_name}
                meta={[
                  [item.address_line1, item.city, item.state, item.country].filter(Boolean).join(', ') || 'No address set',
                  hasPin
                    ? `Pin ${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`
                    : 'No map pin',
                  item.phone_number,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={item.is_primary ? 'Primary' : active ? 'Active' : 'Inactive'}
                badgeKind={active ? 'paid' : 'void'}
                icon="map-pin"
                iconTone={active ? 'coral' : 'rose'}
                dimmed={!active}
                onPress={() => navigation.navigate('BranchForm', { branchId: item.id })}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="map-pin"
                title={branches.length ? 'No offices match' : 'No offices yet'}
                message={
                  branches.length
                    ? 'Try a different search or status filter.'
                    : 'Add your first office with a full address and map pin to start taking bookings and orders.'
                }
                actionLabel={branches.length ? undefined : 'Add office'}
                onAction={branches.length ? undefined : () => navigation.navigate('BranchForm')}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  filters: { marginBottom: spacing.sm },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMuted: { backgroundColor: colors.muted },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  primaryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.tint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  metaWarning: { marginTop: 4, color: colors.warning, fontSize: 13 },
});
