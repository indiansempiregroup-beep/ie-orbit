import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { groupedListProps } from '../../components/ui/GroupedList';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatShopMoney, formatShopOrderPlaced, formatShopQty } from './shopHelpers';
import type { ShopReturn } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['id'];

type ReturnLine = { name?: string; quantity?: string | number };

function returnTone(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'approved') {
    return { bg: '#ECFDF5', text: '#047857', dot: '#047857', label: 'Completed' };
  }
  if (value === 'rejected') {
    return { bg: '#FEF2F2', text: '#B91C1C', dot: '#B91C1C', label: 'Rejected' };
  }
  return { bg: '#FFFBEB', text: '#B45309', dot: '#B45309', label: 'Pending' };
}

function returnLines(item: ShopReturn): ReturnLine[] {
  return (Array.isArray(item.line_items) ? item.line_items : []).flatMap((raw) =>
    raw && typeof raw === 'object' ? [raw as ReturnLine] : [],
  );
}

function itemCount(item: ShopReturn) {
  return returnLines(item).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
}

function itemPreview(item: ShopReturn): string {
  return returnLines(item)
    .map((row) => (row.name ? `${row.name} × ${formatShopQty(row.quantity ?? 1)}` : ''))
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
}

function countActive(status: StatusFilter) {
  return status !== 'all' ? 1 : 0;
}

export function MyReturnsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [items, setItems] = useState<ShopReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<{ status: StatusFilter }>({ status: 'all' });
  const primary = branding?.primaryColor ?? colors.primary;
  const activeFilterCount = countActive(status);
  const statusLabel = STATUS_FILTERS.find((item) => item.id === status)?.label ?? 'All';

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const res = await mobileClient.mobile.listMyReturns({
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setItems(res.data);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessCode, tenantSlug],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== 'all' && String(item.status || '').toLowerCase() !== status) return false;
      if (!needle) return true;
      return [item.return_number, item.status, item.reason, itemPreview(item)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [items, search, status]);

  function openFilters() {
    setDraft({ status });
    setFilterOpen(true);
  }

  function clearAppliedFilters() {
    setStatus('all');
    setSearch('');
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Returns" onBack={() => navigation.goBack()} />
      <SearchFilterToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search return number or item"
        primaryColor={primary}
        activeFilterCount={activeFilterCount}
        onOpenFilters={openFilters}
        activeSummary={status !== 'all' ? statusLabel : undefined}
        onClearFilters={clearAppliedFilters}
        countLabel={
          loading ? null : `${visible.length} ${visible.length === 1 ? 'return' : 'returns'}`
        }
      />
      {loading && !items.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        {...groupedListProps(visible.length, styles.listGroup)}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={primary}
            colors={[primary]}
          />
        }
        renderItem={({ item }) => {
          const tone = returnTone(item.status);
          const preview = itemPreview(item);
          const count = itemCount(item);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => navigation.navigate('ReturnDetail', { returnId: item.id })}
            >
              <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
                <Feather
                  name={tone.label === 'Completed' ? 'check-circle' : tone.label === 'Rejected' ? 'x-circle' : 'rotate-ccw'}
                  size={18}
                  color={tone.text}
                />
              </View>
              <View style={styles.body}>
                <View style={styles.topRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    #{item.return_number}
                  </Text>
                  <Text style={styles.total}>{formatShopMoney(item.refund_total, item.currency)}</Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatShopOrderPlaced(item.created_at)}
                  {count ? ` · ${count} item${count === 1 ? '' : 's'}` : ''}
                </Text>
                {preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {preview}
                  </Text>
                ) : null}
                <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                  <View style={[styles.dot, { backgroundColor: tone.dot }]} />
                  <Text style={[styles.pillText, { color: tone.text }]}>{tone.label}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="rotate-ccw"
              title={items.length || search || activeFilterCount ? 'No matching returns' : 'No returns yet'}
              description={
                items.length || search || activeFilterCount
                  ? 'Try another search or clear the filters.'
                  : 'Open a completed order and tap Return items if you need to send something back.'
              }
            />
          ) : null
        }
      />

      <AmazonFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        primaryColor={primary}
        sections={[{ id: 'status', label: 'Status', options: [...STATUS_FILTERS] }]}
        values={{ status: draft.status }}
        onSelect={(_sectionId, optionId) => setDraft({ status: optionId as StatusFilter })}
        onClear={() => setDraft({ status: 'all' })}
        applyCount={countActive(draft.status)}
        onApply={() => {
          setStatus(draft.status);
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  listGroup: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  pressed: { opacity: 0.92 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.label, fontWeight: '800', color: colors.foreground, flex: 1 },
  total: { ...typography.label, fontWeight: '800', color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  preview: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...typography.caption, fontWeight: '800' },
});
