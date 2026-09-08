import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import {
  filterSaleVouchers,
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  isVoucherFullyPaid,
  summarizeVouchers,
  voucherBalanceDue,
  voucherPartyLabel,
  type VoucherPayFilter,
  type VoucherPeriodFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';

export function ShopBooksPurchaseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<VoucherPayFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<VoucherPeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: 'purchase' })}
          accessibilityRole="button"
          accessibilityLabel="New purchase"
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
      const vouchersRes = await client.shop.listVouchers({ business_id: businessId, type: 'purchase' });
      setVouchers(vouchersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchases');
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

  const filteredVouchers = useMemo(() => {
    const list = filterSaleVouchers(vouchers, {
      pay: payFilter,
      period: periodFilter,
      search,
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.voucher_date || '').localeCompare(String(b.voucher_date || ''));
      if (sortBy === 'amount_desc') return Number(b.total ?? 0) - Number(a.total ?? 0);
      if (sortBy === 'amount_asc') return Number(a.total ?? 0) - Number(b.total ?? 0);
      return String(b.voucher_date || '').localeCompare(String(a.voucher_date || ''));
    });
  }, [vouchers, payFilter, periodFilter, search, sortBy]);
  const summary = useMemo(() => summarizeVouchers(filteredVouchers), [filteredVouchers]);
  const activeFilterCount =
    Number(payFilter !== 'all') + Number(periodFilter !== 'all') + Number(sortBy !== 'newest');

  function clearFilters() {
    setPayFilter('all');
    setPeriodFilter('all');
    setSearch('');
    setSortBy('newest');
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void purchase', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Purchase voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void purchase', 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          summary={summary}
          mode="purchase"
          onPressTotal={() => setPayFilter('all')}
          onPressPaid={() => setPayFilter((current) => (current === 'paid' ? 'all' : 'paid'))}
          onPressUnpaid={() => setPayFilter((current) => (current === 'unpaid' ? 'all' : 'unpaid'))}
        />
        <View style={styles.topBar}>
          <SearchBar
            style={styles.searchFlex}
            value={search}
            onChangeText={setSearch}
            placeholder="Search bills"
          />
          <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        </View>
        {activeFilterCount || search.trim() ? (
          <Pressable onPress={clearFilters} hitSlop={8} style={styles.resetRow}>
            <Text style={styles.clear}>Clear search & filters</Text>
          </Pressable>
        ) : null}
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={clearFilters}
        >
          <FilterChoiceGroup
            label="Period"
            value={periodFilter}
            options={[
              { value: 'all', label: 'All time' },
              { value: 'today', label: 'Today' },
              { value: '7d', label: 'Last 7 days' },
              { value: 'month', label: 'This month' },
            ]}
            onChange={(value) => setPeriodFilter(value as VoucherPeriodFilter)}
          />
          <FilterChoiceGroup
            label="Payment"
            value={payFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'unpaid', label: 'Unpaid' },
            ]}
            onChange={(value) => setPayFilter(value as VoucherPayFilter)}
          />
          <FilterChoiceGroup
            label="Sort"
            value={sortBy}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
              { value: 'amount_desc', label: 'Amount high–low' },
              { value: 'amount_asc', label: 'Amount low–high' },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filteredVouchers.length, styles.list)}
          data={filteredVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const voided = isVoidedVoucher(item.status);
            const paid = isVoucherFullyPaid(item);
            const balance = voucherBalanceDue(item);
            const party = voucherPartyLabel(item);
            return (
              <BooksDocumentRow
                title={party === '—' ? 'Supplier bill' : party}
                amount={formatMoney(item.total)}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={voided ? item.status : paid ? 'Paid' : `To pay ${formatMoney(balance)}`}
                badgeKind={voided ? 'void' : paid ? 'paid' : 'due'}
                icon={voided ? 'slash' : 'truck'}
                iconTone={voided ? 'rose' : paid ? 'green' : 'amber'}
                dimmed={voided}
                actionLabel={!voided ? 'Void' : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="truck"
                title={activeFilterCount ? 'No matching purchases' : 'No purchases yet'}
                message={
                  activeFilterCount
                    ? 'Try clearing filters or adjusting period / payment.'
                    : 'Record supplier bills to track what you owe.'
                }
                actionLabel={activeFilterCount ? 'Clear filters' : 'Record a purchase'}
                onAction={
                  activeFilterCount
                    ? clearFilters
                    : () => navigation.navigate('ShopPos', { mode: 'purchase' })
                }
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
  list: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
  resetRow: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  clear: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  dueMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.destructive },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
