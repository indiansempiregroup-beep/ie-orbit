import React, { useCallback, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { clampPageSize, toPagedResult, type ShopDeliveryZone } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import { shopListRefreshControl } from './shopRefreshControl';

function statusOptions(t: TFunction) {
  return [
    { value: '', label: t('shop.deliveryZones.allZones') },
    { value: 'enabled', label: t('shop.deliveryZones.enabled') },
    { value: 'disabled', label: t('shop.deliveryZones.disabled') },
  ];
}

export function ShopDeliveryZonesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [zones, setZones] = useState<ShopDeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabledFilter, setEnabledFilter] = useState('');
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [enabledFilter],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopDeliveryZoneForm', {})}
          accessibilityRole="button"
          accessibilityLabel={t('shop.deliveryZones.addZone')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listDeliveryZones({
        business_id: businessId,
        q,
        enabled: enabledFilter === 'enabled' ? 'true' : enabledFilter === 'disabled' ? 'false' : undefined,
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(response, pageSize);
      setZones(page.items);
      setPageMeta(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.zones.loadFailed'));
      setZones([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, q, enabledFilter, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = zones;
  const hasFilters = Boolean(search.trim()) || Boolean(enabledFilter);

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.topBar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('shop.deliveryZones.searchPlaceholder')}
            style={styles.searchFlex}
          />
          <FilterButton count={Number(Boolean(enabledFilter))} onPress={() => setFiltersOpen(true)} />
        </View>
        {enabledFilter ? (
          <Pressable onPress={() => setEnabledFilter('')} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>{t('opsApp.shop.common.clearFilters')}</Text>
          </Pressable>
        ) : null}

        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => setEnabledFilter('')}
        >
          <FilterChoiceGroup
            label={t('shop.deliveryZones.availability')}
            value={enabledFilter}
            options={statusOptions(t)}
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
              amount={t('shop.deliveryZones.fee', { amount: item.fee ?? 0 })}
              meta={`${(item.cities ?? []).join(', ') || t('shop.deliveryZones.anyCity')} · ${t('shop.deliveryZones.prefixes', { list: (item.postal_prefixes ?? []).join(', ') || t('shop.deliveryZones.any') })}${item.min_order_total && Number(item.min_order_total) ? ` · ${t('shop.deliveryZones.minOrderShort', { amount: item.min_order_total })}` : ''}`}
              badge={item.enabled ? t('shop.deliveryZones.enabled') : t('shop.deliveryZones.disabled')}
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
                title={hasFilters ? t('opsApp.shop.zones.noMatching') : t('opsApp.shop.zones.noZones')}
                message={
                  hasFilters
                    ? t('opsApp.shop.zones.tryAnother')
                    : t('opsApp.shop.zones.emptyHint')
                }
                actionLabel={hasFilters ? undefined : t('shop.deliveryZones.addZone')}
                onAction={hasFilters ? undefined : () => navigation.navigate('ShopDeliveryZoneForm', {})}
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filtered.length}
              label={t('shop.deliveryZones.paginationLabel', { defaultValue: 'zones' })}
              disabled={loading}
            />
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
