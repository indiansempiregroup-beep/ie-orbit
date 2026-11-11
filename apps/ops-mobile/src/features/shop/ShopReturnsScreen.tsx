import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useCustomers } from '../../hooks/useOpsData';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, spacing } from '../../theme/tokens';
import { clampPageSize, toPagedResult, type ShopReturn } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatDateTime, getApiErrorMessage } from '../../utils/format';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { shopListRefreshControl } from './shopRefreshControl';
import { formatMoney } from './posPayment';
import type { TFunction } from 'i18next';
import { ArrangeReturnPickupSheet } from './ArrangeReturnPickupSheet';

function restockOptions(t: TFunction) {
  return [
    { value: '', label: t('common.all') },
    { value: 'yes', label: t('opsApp.shop.returns.restocked') },
    { value: 'no', label: t('opsApp.shop.returns.noRestock') },
  ];
}

function statusOptions(t: TFunction) {
  return [
    { value: '', label: t('common.all') },
    { value: 'pending', label: t('shop.returnsPage.statusLabels.pending') },
    { value: 'awaiting_customer', label: t('opsApp.shop.returns.awaitingCustomer') },
    { value: 'approved', label: t('shop.returnsPage.statusLabels.pickupArranged') },
    { value: 'completed', label: t('shop.returnsPage.statusLabels.completed') },
    { value: 'rejected', label: t('shop.returnsPage.statusLabels.rejected') },
  ];
}

function returnMethodLabel(method: string | null | undefined, t: TFunction) {
  if (method === 'dropoff') return t('shop.returnsPage.methods.dropoff');
  if (method === 'reverse_pickup') return t('shop.returnsPage.methods.reverse_pickup');
  if (method === 'instant_pickup') return t('shop.returnsPage.methods.instant_pickup');
  if (method === 'in_store') return t('shop.returnsPage.methods.in_store');
  return '';
}

function returnStatusLabel(item: ShopReturn, t: TFunction) {
  const status = String(item.status || '').toLowerCase();
  if (status === 'completed') return t('shop.returnsPage.statusLabels.completed');
  if (status === 'rejected') return t('shop.returnsPage.statusLabels.rejected');
  if (status === 'awaiting_customer') return t('opsApp.shop.returns.awaitingCustomer');
  if (status === 'approved' || item.pickup_arranged_at) {
    return item.return_method === 'instant_pickup'
      ? t('shop.returnsPage.statusLabels.riderDispatched')
      : t('shop.returnsPage.statusLabels.pickupArranged');
  }
  if (item.return_method === 'dropoff') return t('shop.returnsPage.statusLabels.awaitingDropoff');
  if (item.return_method === 'instant_pickup') return t('shop.returnsPage.statusLabels.awaitingDispatch');
  if (item.return_method === 'reverse_pickup') return t('shop.returnsPage.statusLabels.awaitingPickup');
  return status || t('shop.returnsPage.statusLabels.pending');
}

function canOpenArrangeSheet(item: ShopReturn) {
  if (String(item.status || '') !== 'pending') return false;
  return (
    item.return_method === 'reverse_pickup' ||
    item.return_method === 'instant_pickup' ||
    item.return_method === 'dropoff'
  );
}

function returnIsOpen(item: ShopReturn) {
  const status = String(item.status || '').toLowerCase();
  return status === 'pending' || status === 'awaiting_customer' || status === 'approved';
}

function returnLineSummary(item: ShopReturn): string {
  const lines = Array.isArray(item.line_items) ? item.line_items : [];
  return lines
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return '';
      const row = raw as { name?: string; quantity?: string | number };
      const name = String(row.name || '').trim();
      const qty = row.quantity != null ? String(row.quantity) : '';
      if (!name) return '';
      return qty ? `${name} × ${qty}` : name;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

export function ShopReturnsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const { customers } = useCustomers();
  const customerMap = useMemo(() => buildNameMap(customers), [customers]);

  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restock, setRestock] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [restock, statusFilter],
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [returnDays, setReturnDays] = useState('0');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [arrangeTarget, setArrangeTarget] = useState<ShopReturn | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [returnsRes, settingsRes] = await Promise.all([
        client.shop.listReturns({
          business_id: businessId,
          q,
          status: statusFilter || undefined,
          restock: restock === 'yes' ? 'true' : restock === 'no' ? 'false' : undefined,
          page_size: clampPageSize(pageSize),
          cursor,
        }),
        client.shop.getSettings({ business_id: businessId }),
      ]);
      const page = toPagedResult(returnsRes, pageSize);
      setReturns(page.items);
      setPageMeta(page);
      setReturnDays(String(settingsRes.data?.return_days ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.returns.loadFailed'));
      setReturns([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, q, statusFilter, restock, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(
    () =>
      [...returns].sort((a, b) => {
        if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        if (sortBy === 'amount_desc') return Number(b.refund_total ?? 0) - Number(a.refund_total ?? 0);
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      }),
    [returns, sortBy],
  );

  function clearFilters() {
    setSearch('');
    setRestock('');
    setStatusFilter('');
  }

  async function runReturnAction(item: ShopReturn, action: 'receive' | 'reject') {
    if (!client || !businessId) return;
    setActionBusyId(item.id);
    try {
      if (action === 'receive') {
        await client.shop.receiveReturn(item.id, { business_id: businessId });
        toast.push(t('shop.returnsPage.received'), 'success');
      } else {
        await client.shop.rejectReturn(item.id, { business_id: businessId });
        toast.push(t('shop.returnsPage.rejected'), 'success');
      }
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.returnsPage.updateFailed')), 'error');
    } finally {
      setActionBusyId(null);
    }
  }

  async function saveReturnPolicy() {
    if (!client || !businessId) return;
    const days = Math.max(0, Math.min(3650, Math.floor(Number(returnDays) || 0)));
    setSavingPolicy(true);
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        return_days: days,
      });
      setReturnDays(String(response.data?.return_days ?? days));
      toast.push(
        days > 0
          ? t('shop.returnsPage.windowSet', { count: days })
          : t('shop.returnsPage.windowCleared'),
        'success',
      );
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.returnsPage.policyFailed')), 'error');
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>{t('shop.returnsPage.policyTitle')}</Text>
          <Text style={styles.policyHint}>
            {t('opsApp.shop.returns.policyHint')}
          </Text>
          <View style={styles.policyRow}>
            <View style={styles.policyInput}>
              <Input
                label={t('shop.returnsPage.returnDays')}
                value={returnDays}
                onChangeText={setReturnDays}
                keyboardType="number-pad"
              />
            </View>
            <Button
              label={savingPolicy ? t('common.saving') : t('common.save')}
              loading={savingPolicy}
              onPress={() => void saveReturnPolicy()}
              disabled={savingPolicy}
              style={styles.policySave}
            />
          </View>
        </View>

        <View style={styles.topBar}>
          <SearchBar
            style={styles.searchFlex}
            value={search}
            onChangeText={setSearch}
            placeholder={t('opsApp.shop.returns.searchPlaceholder')}
          />
          <FilterButton
            count={
              Number(Boolean(restock)) + Number(Boolean(statusFilter)) + Number(sortBy !== 'newest')
            }
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => {
            setRestock('');
            setStatusFilter('');
            setSortBy('newest');
          }}
        >
          <FilterChoiceGroup
            label={t('common.status')}
            value={statusFilter}
            options={statusOptions(t)}
            onChange={setStatusFilter}
          />
          <FilterChoiceGroup
            label={t('opsApp.shop.returns.inventory')}
            value={restock}
            options={restockOptions(t)}
            onChange={setRestock}
          />
          <FilterChoiceGroup
            label={t('opsApp.shop.common.sort')}
            value={sortBy}
            options={[
              { value: 'newest', label: t('opsApp.shop.common.newest') },
              { value: 'oldest', label: t('opsApp.shop.common.oldest') },
              { value: 'amount_desc', label: t('opsApp.shop.returns.refundHighLow') },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {t('opsApp.shop.returns.count', { count: filtered.length })}
          </Text>
          {search || restock || statusFilter ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>{t('common.clear')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.hint}>
          {t('opsApp.shop.returns.onlineHint')}
        </Text>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const customerId = item.customer ? String(item.customer) : '';
            const customer = customerId
              ? entityLabel(customerMap, customerId, item.customer_name || t('opsApp.shop.common.customer'))
              : item.customer_name || t('shop.vouchers.walkIn');
            const products = returnLineSummary(item);
            const open = returnIsOpen(item);
            const canArrange = canOpenArrangeSheet(item);
            const busy = actionBusyId === item.id;
            return (
              <BooksDocumentRow
                title={item.return_number}
                amount={formatMoney(item.refund_total, item.currency)}
                meta={[
                  item.order_number,
                  customer,
                  item.created_at ? formatDateTime(item.created_at) : '',
                  returnMethodLabel(item.return_method, t),
                  item.status === 'completed'
                    ? item.restock
                      ? t('opsApp.shop.returns.restocked')
                      : t('opsApp.shop.returns.noRestock')
                    : null,
                  item.reason,
                  products,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={returnStatusLabel(item, t)}
                badgeKind={
                  item.status === 'completed'
                    ? 'paid'
                    : item.status === 'rejected'
                      ? 'void'
                      : open
                        ? 'due'
                        : 'neutral'
                }
                icon="rotate-ccw"
                iconTone="coral"
                onPress={() => navigation.navigate('ShopReturnDetail', { returnId: item.id })}
                extraActions={
                  open
                    ? [
                        ...(canArrange
                          ? [
                              {
                                label: t('opsApp.shop.returns.arrangePickup'),
                                onPress: () => setArrangeTarget(item),
                              },
                            ]
                          : []),
                        {
                          label: busy ? '…' : t('opsApp.shop.returns.markReceived'),
                          onPress: () => void runReturnAction(item, 'receive'),
                        },
                        {
                          label: busy ? '…' : t('opsApp.shop.returns.reject'),
                          onPress: () => void runReturnAction(item, 'reject'),
                          destructive: true,
                        },
                      ]
                    : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="rotate-ccw"
                title={
                  search || restock || statusFilter
                    ? t('opsApp.shop.returns.noMatching')
                    : t('opsApp.shop.returns.noReturnsTitle')
                }
                message={
                  search || restock || statusFilter
                    ? t('opsApp.shop.returns.tryDifferent')
                    : t('opsApp.shop.returns.processHint')
                }
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filtered.length}
              label={t('shop.returnsPage.paginationLabel', { defaultValue: 'returns' })}
              disabled={loading}
            />
          }
        />
      </View>
      {businessId ? (
        <ArrangeReturnPickupSheet
          visible={Boolean(arrangeTarget)}
          shopReturn={arrangeTarget}
          businessId={businessId}
          onClose={() => setArrangeTarget(null)}
          onDone={() => {
            setArrangeTarget(null);
            void load();
          }}
        />
      ) : null}
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  policyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  policyTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  policyHint: { color: colors.mutedForeground, fontSize: 12, marginBottom: 4 },
  policyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  policyInput: { flex: 1 },
  policySave: { marginBottom: 2 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
  search: { marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
  filterField: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  count: { color: colors.mutedForeground, fontSize: 13 },
  clear: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  hint: { color: colors.mutedForeground, fontSize: 12, marginBottom: spacing.sm },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  name: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground, flex: 1 },
  total: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  preview: { color: colors.foreground, fontSize: 13, marginTop: 2 },
  openHint: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 4 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
