import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopDeliveryZone } from '@ie-orbit/sdk';
import { shopListRefreshControl } from './shopRefreshControl';

const STATUS_OPTIONS = [
  { value: '', label: 'All zones' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

export function ShopDeliveryZonesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [zones, setZones] = useState<ShopDeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopDeliveryZoneForm', {})}
          accessibilityRole="button"
          accessibilityLabel="Add zone"
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listDeliveryZones({ business_id: businessId });
      setZones(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load zones');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return zones.filter((zone) => {
      if (enabledFilter === 'enabled' && !zone.enabled) return false;
      if (enabledFilter === 'disabled' && zone.enabled) return false;
      if (!term) return true;
      return [zone.name, ...(zone.cities ?? []), ...(zone.postal_prefixes ?? []), zone.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [zones, search, enabledFilter]);

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.topBar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search zone, city, postal…"
            style={styles.searchFlex}
          />
          <FilterButton count={Number(Boolean(enabledFilter))} onPress={() => setFiltersOpen(true)} />
        </View>
        {enabledFilter ? (
          <Pressable onPress={() => setEnabledFilter('')} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        ) : null}

        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => setEnabledFilter('')}
        >
          <FilterChoiceGroup
            label="Availability"
            value={enabledFilter}
            options={STATUS_OPTIONS}
            onChange={setEnabledFilter}
          />
        </FilterSheet>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <BooksDocumentRow
              title={item.name}
              amount={`fee ${item.fee ?? 0}`}
              meta={`${(item.cities ?? []).join(', ') || 'Any city'} · Prefixes ${(item.postal_prefixes ?? []).join(', ') || 'any'}${item.min_order_total && Number(item.min_order_total) ? ` · min ${item.min_order_total}` : ''}`}
              badge={item.enabled ? 'Enabled' : 'Disabled'}
              badgeKind={item.enabled ? 'paid' : 'void'}
              icon="map-pin"
              iconTone="coral"
              dimmed={!item.enabled}
              onPress={() => navigation.navigate('ShopDeliveryZoneForm', { zoneId: item.id })}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="map-pin"
                title={zones.length ? 'No matching zones' : 'No zones yet'}
                message={
                  zones.length
                    ? 'Try another search or clear filters.'
                    : 'Add a delivery zone so checkout can match city and postal codes.'
                }
                actionLabel={zones.length ? undefined : 'Add zone'}
                onAction={zones.length ? undefined : () => navigation.navigate('ShopDeliveryZoneForm', {})}
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
  clearFilters: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  clearFiltersText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
