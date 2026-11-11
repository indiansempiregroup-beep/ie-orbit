import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
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
import { clampPageSize, toPagedResult, type ShopBooksVoucher } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import {
  filterSaleVouchers,
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  isVoucherFullyPaid,
  summarizeVouchers,
  voucherBalanceDue,
  voucherListFilters,
  voucherPartyLabel,
  type VoucherPayFilter,
  type VoucherPeriodFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { PurchaseInvoiceDetailModal } from './PurchaseInvoiceDetailModal';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { PlanFeature } from '../../utils/planFeatures';
import { confirmAction } from '../../utils/confirmAction';
import { getApiErrorMessage } from '../../utils/format';

export function ShopBooksPurchaseScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopBooksPurchase'>>();
  const openVoucherId = route.params?.voucherId;
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const { has } = usePlanFeatures();
  const canScan = has(PlanFeature.shopieInvoiceScan);

  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<VoucherPayFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<VoucherPeriodFilter>('all');
  const [sortBy, setSortBy] = useState('newest');
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [payFilter, periodFilter],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailVoucher, setDetailVoucher] = useState<ShopBooksVoucher | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {canScan ? (
            <Pressable
              onPress={() => navigation.navigate('ShopInvoiceScan')}
              accessibilityRole="button"
              accessibilityLabel={t('shop.vouchers.scanInvoice')}
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Feather name="camera" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.navigate('ShopPos', { mode: 'purchase' })}
            accessibilityRole="button"
            accessibilityLabel={t('shop.vouchers.newPurchase')}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Feather name="plus" size={20} color={colors.primary} />
          </Pressable>
        </View>
      ),
    });
  }, [canScan, navigation, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const vouchersRes = await client.shop.listVouchers({
        business_id: businessId,
        type: 'purchase',
        q,
        ...voucherListFilters({ pay: payFilter, period: periodFilter }),
        page_size: clampPageSize(pageSize),
        cursor,
      });
      const page = toPagedResult(vouchersRes, pageSize);
      setVouchers(page.items);
      setPageMeta(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.purchase.loadFailed'));
      setVouchers([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, q, payFilter, periodFilter, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!openVoucherId || !client) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getVoucher(openVoucherId);
        if (!cancelled && response.data) setDetailVoucher(response.data);
      } catch (err) {
        if (!cancelled) {
          toast.push(getApiErrorMessage(err, t('opsApp.shop.purchase.openFailed')), 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openVoucherId, client, toast, t]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  function closeDetail() {
    setDetailVoucher(null);
    if (route.params?.voucherId) {
      navigation.setParams({ voucherId: undefined });
    }
  }

  const filteredVouchers = useMemo(() => {
    // Search, period and pay status are applied by the API; `pay` is re-checked here so rows
    // with return adjustments match the badge shown on each row.
    const list = filterSaleVouchers(vouchers, { pay: payFilter });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.voucher_date || '').localeCompare(String(b.voucher_date || ''));
      if (sortBy === 'amount_desc') return Number(b.total ?? 0) - Number(a.total ?? 0);
      if (sortBy === 'amount_asc') return Number(a.total ?? 0) - Number(b.total ?? 0);
      return String(b.voucher_date || '').localeCompare(String(a.voucher_date || ''));
    });
  }, [vouchers, payFilter, sortBy]);
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
    const ok = await confirmAction({
      title: t('opsApp.shop.purchase.voidTitle'),
      message: t('shop.vouchers.confirmVoid', { number: voucher.voucher_number }),
      confirmLabel: t('opsApp.shop.sale.void'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.shop.voidVoucher(voucher.id);
      toast.push(t('opsApp.shop.purchase.voided'), 'success');
      closeDetail();
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('opsApp.shop.purchase.voidFailed')), 'error');
    }
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
            placeholder={t('shop.vouchers.searchBills')}
          />
          <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        </View>
        {activeFilterCount || search.trim() ? (
          <Pressable onPress={clearFilters} hitSlop={8} style={styles.resetRow}>
            <Text style={styles.clear}>{t('shop.vouchers.clearFilters')}</Text>
          </Pressable>
        ) : null}
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={clearFilters}
        >
          <FilterChoiceGroup
            label={t('opsApp.shop.common.period')}
            value={periodFilter}
            options={[
              { value: 'all', label: t('opsApp.shop.common.allTime') },
              { value: 'today', label: t('common.today') },
              { value: '7d', label: t('opsApp.shop.common.last7Days') },
              { value: 'month', label: t('opsApp.shop.common.thisMonth') },
            ]}
            onChange={(value) => setPeriodFilter(value as VoucherPeriodFilter)}
          />
          <FilterChoiceGroup
            label={t('shop.vouchers.paymentFilter')}
            value={payFilter}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'paid', label: t('shop.vouchers.stripPaid') },
              { value: 'unpaid', label: t('shop.vouchers.unpaid') },
            ]}
            onChange={(value) => setPayFilter(value as VoucherPayFilter)}
          />
          <FilterChoiceGroup
            label={t('opsApp.shop.common.sort')}
            value={sortBy}
            options={[
              { value: 'newest', label: t('opsApp.shop.common.newest') },
              { value: 'oldest', label: t('opsApp.shop.common.oldest') },
              { value: 'amount_desc', label: t('opsApp.shop.common.amountHighLow') },
              { value: 'amount_asc', label: t('opsApp.shop.common.amountLowHigh') },
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
                title={party === '—' ? t('opsApp.shop.purchase.supplierBill') : party}
                amount={formatMoney(item.total)}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={
                  voided
                    ? t(`shop.vouchers.status.${item.status}`, { defaultValue: item.status })
                    : paid
                      ? t('shop.vouchers.stripPaid')
                      : `${t('shop.vouchers.stripToPay')} ${formatMoney(balance)}`
                }
                badgeKind={voided ? 'void' : paid ? 'paid' : 'due'}
                icon={voided ? 'slash' : 'truck'}
                iconTone={voided ? 'rose' : paid ? 'green' : 'amber'}
                dimmed={voided}
                onPress={() => setDetailVoucher(item)}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="truck"
                title={
                  activeFilterCount || search.trim()
                    ? t('opsApp.shop.purchase.noMatching')
                    : t('opsApp.shop.purchase.noPurchases')
                }
                message={
                  activeFilterCount || search.trim()
                    ? t('opsApp.shop.purchase.tryClearing')
                    : t('opsApp.shop.purchase.emptyHint')
                }
                actionLabel={
                  activeFilterCount || search.trim()
                    ? t('opsApp.shop.common.clearFilters')
                    : t('opsApp.shop.purchase.record')
                }
                onAction={
                  activeFilterCount || search.trim()
                    ? clearFilters
                    : () => navigation.navigate('ShopPos', { mode: 'purchase' })
                }
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filteredVouchers.length}
              label={t('shop.vouchers.paginationLabel', { defaultValue: 'bills' })}
              disabled={loading}
            />
          }
        />

        <PurchaseInvoiceDetailModal
          voucher={detailVoucher}
          visible={Boolean(detailVoucher)}
          onClose={closeDetail}
          onVoid={(voucher) => void onVoid(voucher)}
          onPaid={async (updated) => {
            setDetailVoucher(updated);
            await load();
          }}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
