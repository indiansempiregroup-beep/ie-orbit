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
import { SelectField } from '../../components/SelectField';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomers } from '../../hooks/useOpsData';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, spacing } from '../../theme/tokens';
import type { ShopOrder, ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatDateTime } from '../../utils/format';
import { shopListRefreshControl } from './shopRefreshControl';
import { formatMoney } from './posPayment';

const RESTOCK_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'yes', label: 'Restocked' },
  { value: 'no', label: 'No restock' },
];

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
  const { businessId } = useWorkspace();
  const { customers } = useCustomers();
  const customerMap = useMemo(() => buildNameMap(customers), [customers]);

  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [restock, setRestock] = useState('');

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
      const [returnsRes, ordersRes] = await Promise.all([
        client.shop.listReturns({ business_id: businessId }),
        client.shop.listOrders({ business_id: businessId }),
      ]);
      setReturns(returnsRes.data ?? []);
      setOrders(ordersRes.data ?? []);
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
    return returns.filter((item) => {
      if (restock === 'yes' && !item.restock) return false;
      if (restock === 'no' && item.restock) return false;

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
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [returns, search, restock, orderMap, customerMap]);

  function clearFilters() {
    setSearch('');
    setRestock('');
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <SearchBar
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search return #, order, product…"
        />

        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <SelectField
              label="Inventory"
              value={restock}
              options={RESTOCK_OPTIONS}
              onChange={setRestock}
              searchable={false}
            />
          </View>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {filtered.length} return{filtered.length === 1 ? '' : 's'}
          </Text>
          {search || restock ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.hint}>Process returns from an order’s bill detail.</Text>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
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
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  if (order?.id) {
                    navigation.navigate('ShopOrderDetail', { orderId: order.id });
                  }
                }}
                disabled={!order?.id}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.return_number}</Text>
                  <Text style={styles.total}>
                    {item.currency || 'INR'} {formatMoney(item.refund_total)}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {order?.order_number ? `${order.order_number} · ` : ''}
                  {customer}
                </Text>
                {item.created_at ? (
                  <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
                ) : null}
                <Text style={styles.meta}>
                  {item.restock ? 'Restocked to inventory' : 'No restock'}
                  {item.reason ? ` · ${item.reason}` : ''}
                </Text>
                {products ? <Text style={styles.preview}>{products}</Text> : null}
                {order?.id ? <Text style={styles.openHint}>Tap to open bill</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.meta}>
                {returns.length ? 'No returns match these filters.' : 'No returns yet.'}
              </Text>
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
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
