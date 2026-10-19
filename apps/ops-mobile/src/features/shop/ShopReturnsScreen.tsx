import React, { useCallback, useMemo, useState } from 'react';
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
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, spacing } from '../../theme/tokens';
import type { ShopOrder, ShopReturn } from '@ie-orbit/sdk';
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
import { ArrangeReturnPickupSheet } from './ArrangeReturnPickupSheet';

const RESTOCK_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'yes', label: 'Restocked' },
  { value: 'no', label: 'No restock' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_customer', label: 'Awaiting customer' },
  { value: 'approved', label: 'Pickup arranged' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];

function returnMethodLabel(method?: string | null) {
  if (method === 'dropoff') return 'Drop-off';
  if (method === 'reverse_pickup') return 'Reverse pickup';
  if (method === 'instant_pickup') return 'Instant pickup';
  if (method === 'in_store') return 'In store';
  return '';
}

function returnStatusLabel(item: ShopReturn) {
  const status = String(item.status || '').toLowerCase();
  if (status === 'completed') return 'Completed';
  if (status === 'rejected') return 'Rejected';
  if (status === 'awaiting_customer') return 'Awaiting customer';
  if (status === 'approved' || item.pickup_arranged_at) {
    return item.return_method === 'instant_pickup' ? 'Rider dispatched' : 'Pickup arranged';
  }
  if (item.return_method === 'dropoff') return 'Awaiting drop-off';
  if (item.return_method === 'instant_pickup') return 'Awaiting dispatch';
  if (item.return_method === 'reverse_pickup') return 'Awaiting pickup';
  return status || 'Pending';
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const { customers } = useCustomers();
  const customerMap = useMemo(() => buildNameMap(customers), [customers]);

  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [restock, setRestock] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [returnDays, setReturnDays] = useState('0');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [arrangeTarget, setArrangeTarget] = useState<ShopReturn | null>(null);

  const orderMap = useMemo(() => {
    const map = new Map<string, ShopOrder>();
    for (const order of orders) map.set(order.id, order);
    return map;
  }, [orders]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [returnsRes, ordersRes, settingsRes] = await Promise.all([
        client.shop.listReturns({ business_id: businessId }),
        client.shop.listOrders({ business_id: businessId }),
        client.shop.getSettings({ business_id: businessId }),
      ]);
      setReturns(returnsRes.data ?? []);
      setOrders(ordersRes.data ?? []);
      setReturnDays(String(settingsRes.data?.return_days ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load returns');
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
    const list = returns.filter((item) => {
      if (restock === 'yes' && !item.restock) return false;
      if (restock === 'no' && item.restock) return false;
      if (statusFilter && String(item.status || '') !== statusFilter) return false;

      if (!term) return true;
      const order = orderMap.get(String(item.order));
      const customerId = item.customer ? String(item.customer) : order?.customer_id;
      const customer = customerId ? entityLabel(customerMap, customerId, '') : 'walk-in';
      const products = returnLineSummary(item);
      const haystack = [
        item.return_number,
        item.reason,
        String(item.refund_total),
        order?.order_number,
        customer,
        products,
        item.restock ? 'restocked' : 'no restock',
        returnMethodLabel(item.return_method),
        returnStatusLabel(item),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      if (sortBy === 'amount_desc') return Number(b.refund_total ?? 0) - Number(a.refund_total ?? 0);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [returns, search, restock, statusFilter, sortBy, orderMap, customerMap]);

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
        toast.push('Return received — refund and stock updated.', 'success');
      } else {
        await client.shop.rejectReturn(item.id, { business_id: businessId });
        toast.push('Return rejected.', 'success');
      }
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't update this return."), 'error');
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
          ? `Return window set to ${days} day${days === 1 ? '' : 's'}.`
          : 'Return window cleared — no time limit.',
        'success',
      );
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't save return policy."), 'error');
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Return policy</Text>
          <Text style={styles.policyHint}>
            Days after purchase or delivery for POS and online returns. 0 = no limit.
          </Text>
          <View style={styles.policyRow}>
            <View style={styles.policyInput}>
              <Input
                label="Return days"
                value={returnDays}
                onChangeText={setReturnDays}
                keyboardType="number-pad"
              />
            </View>
            <Button
              label={savingPolicy ? 'Saving…' : 'Save'}
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
            placeholder="Search return #, order, product…"
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
            label="Status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
          />
          <FilterChoiceGroup label="Inventory" value={restock} options={RESTOCK_OPTIONS} onChange={setRestock} />
          <FilterChoiceGroup
            label="Sort"
            value={sortBy}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
              { value: 'amount_desc', label: 'Refund high–low' },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {filtered.length} return{filtered.length === 1 ? '' : 's'}
          </Text>
          {search || restock || statusFilter ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.hint}>
          Online returns stay pending until you mark them received. In-store returns can still be processed from an
          order bill.
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
            const order = orderMap.get(String(item.order));
            const customerId = item.customer ? String(item.customer) : order?.customer_id;
            const customer = customerId
              ? entityLabel(customerMap, customerId, 'Customer')
              : 'Walk-in';
            const products = returnLineSummary(item);
            const open = returnIsOpen(item);
            const canArrange = canOpenArrangeSheet(item);
            const busy = actionBusyId === item.id;
            return (
              <BooksDocumentRow
                title={item.return_number}
                amount={formatMoney(item.refund_total, item.currency)}
                meta={[
                  order?.order_number,
                  customer,
                  item.created_at ? formatDateTime(item.created_at) : '',
                  returnMethodLabel(item.return_method),
                  item.status === 'completed'
                    ? item.restock
                      ? 'Restocked'
                      : 'No restock'
                    : null,
                  item.reason,
                  products,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={returnStatusLabel(item)}
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
                                label: 'Arrange pickup',
                                onPress: () => setArrangeTarget(item),
                              },
                            ]
                          : []),
                        {
                          label: busy ? '…' : 'Mark received',
                          onPress: () => void runReturnAction(item, 'receive'),
                        },
                        {
                          label: busy ? '…' : 'Reject',
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
                title={returns.length ? 'No matching returns' : 'No returns yet'}
                message={
                  returns.length
                    ? 'Try a different search or filter.'
                    : 'Process returns from an order’s bill detail.'
                }
              />
            ) : null
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
