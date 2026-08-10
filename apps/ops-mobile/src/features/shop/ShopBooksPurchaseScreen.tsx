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
import { SelectField } from '../../components/SelectField';
import { SearchBar } from '../../components/SearchBar';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher } from '@ie-platform/sdk';
import {
  filterSaleVouchers,
  formatMoney,
  isVoidedVoucher,
  isVoucherFullyPaid,
  summarizeVouchers,
  voucherBalanceDue,
  voucherPartyLabel,
  voucherStatusStyle,
  type VoucherPayFilter,
  type VoucherPeriodFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';

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
  const [periodFilter, setPeriodFilter] = useState<VoucherPeriodFilter>('month');
  const [search, setSearch] = useState('');

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

  const filteredVouchers = useMemo(
    () =>
      filterSaleVouchers(vouchers, {
        pay: payFilter,
        period: periodFilter,
        search,
      }),
    [vouchers, payFilter, periodFilter, search],
  );
  const summary = useMemo(() => summarizeVouchers(filteredVouchers), [filteredVouchers]);
  const activeFilterCount =
    Number(payFilter !== 'all') + Number(periodFilter !== 'all') + Number(Boolean(search.trim()));

  function clearFilters() {
    setPayFilter('all');
    setPeriodFilter('all');
    setSearch('');
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
        <SearchBar
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search bill #, supplier, notes…"
        />
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <SelectField
              label="Period"
              value={periodFilter}
              options={[
                { value: 'all', label: 'All time' },
                { value: 'today', label: 'Today' },
                { value: '7d', label: 'Last 7 days' },
                { value: 'month', label: 'This month' },
              ]}
              onChange={(value) => setPeriodFilter(value as VoucherPeriodFilter)}
              searchable={false}
            />
          </View>
          <View style={styles.filterField}>
            <SelectField
              label="Payment"
              value={payFilter}
              options={[
                { value: 'all', label: 'All payments' },
                { value: 'paid', label: 'Paid' },
                { value: 'unpaid', label: 'Unpaid' },
              ]}
              onChange={(value) => setPayFilter(value as VoucherPayFilter)}
              searchable={false}
            />
          </View>
        </View>
        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {filteredVouchers.length} bill{filteredVouchers.length === 1 ? '' : 's'}
            {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
          </Text>
          {activeFilterCount ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {vouchers.length ? <VoucherSummaryCards summary={summary} mode="purchase" /> : null}
        <FlatList
          style={styles.list}
          data={filteredVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const canVoid = !isVoidedVoucher(item.status);
            const paid = isVoucherFullyPaid(item);
            const balance = voucherBalanceDue(item);
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.voucher_number}</Text>
                  <Text style={styles.total}>{formatMoney(item.total)}</Text>
                </View>
                <Text style={styles.meta}>
                  {voucherPartyLabel(item)}
                  {item.voucher_date ? ` · ${item.voucher_date}` : ''}
                </Text>
                {!paid && balance > 0 ? (
                  <Text style={styles.dueMeta}>To pay {formatMoney(balance)}</Text>
                ) : null}
                <View style={styles.rowBottom}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                    </View>
                    {!isVoidedVoucher(item.status) ? (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: paid ? colors.successSoft : colors.destructiveSoft },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: paid ? '#047857' : '#B91C1C' }]}>
                          {paid ? 'Paid' : 'Unpaid'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {canVoid ? (
                    <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                      <Text style={styles.voidText}>Void</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
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
  search: { marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
  filterField: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  count: { color: colors.mutedForeground, fontSize: 13 },
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
