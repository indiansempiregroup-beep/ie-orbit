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
import { useTranslation } from 'react-i18next';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useCustomers } from '../../hooks/useOpsData';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, spacing } from '../../theme/tokens';
import type { Customer, ShopOrder } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatDateTime } from '../../utils/format';
import { shopListRefreshControl } from './shopRefreshControl';
import {
  formatMoney,
  formatShopOrderFulfillment,
  formatShopOrderPayment,
  getShopOrderPosMeta,
  isShopOrderBorrowDue,
  nextShopOrderAction,
  SHOP_ORDER_STATUS_OPTIONS,
  shopOrderStatusStyle,
} from './posPayment';

/** Online shopping only — counter Sale (POS) lives in Books as GST invoices. */
const ONLINE_MODES = new Set(['pickup', 'delivery']);

const FULFILLMENT_OPTIONS = [
  { value: '', label: 'All online' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

const PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'borrow', label: 'Borrow' },
  { value: 'due', label: 'Borrow due' },
];

function formatCustomerAddress(customer?: Customer | null): string {
  if (!customer) return '';
  if (customer.full_address?.trim()) return customer.full_address.trim();
  const nested = customer.address;
  if (nested?.full_address?.trim()) return nested.full_address.trim();
  const parts = [nested?.line1, nested?.line2, nested?.city, nested?.state, nested?.postal_code]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  const fallback = customer.addresses?.find((row) => row.is_default) ?? customer.addresses?.[0];
  if (fallback?.full_address?.trim()) return fallback.full_address.trim();
  return [fallback?.line1, fallback?.line2, fallback?.city, fallback?.state, fallback?.postal_code]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function orderDeliveryAddress(order: ShopOrder, customer?: Customer | null): string {
  const delivery = String(order.delivery_address || '').trim();
  if (delivery) return delivery;
  return formatCustomerAddress(customer);
}

export function ShopOrdersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const { customers } = useCustomers();
  const toast = useToast();
  const customerMap = useMemo(() => buildNameMap(customers), [customers]);
  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const [items, setItems] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [payment, setPayment] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listOrders({ business_id: businessId });
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
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

  const onlineOrders = useMemo(
    () => items.filter((order) => ONLINE_MODES.has(String(order.fulfillment_mode || '').toLowerCase())),
    [items],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return onlineOrders.filter((order) => {
      if (status && String(order.status || '').toLowerCase() !== status) return false;
      if (fulfillment && order.fulfillment_mode !== fulfillment) return false;
      if (payment) {
        const method = String(getShopOrderPosMeta(order).payment_method || order.payment_method || '').toLowerCase();
        if (payment === 'due') {
          if (!isShopOrderBorrowDue(order)) return false;
        } else if (method !== payment) {
          return false;
        }
      }
      if (!term) return true;
      const customer = order.customer_id
        ? entityLabel(customerMap, order.customer_id, '')
        : 'walk-in';
      const address = orderDeliveryAddress(
        order,
        order.customer_id ? customersById.get(order.customer_id) : null,
      );
      const haystack = [
        order.order_number,
        order.status,
        order.fulfillment_mode,
        String(order.total),
        formatShopOrderPayment(order),
        customer,
        address,
        ...(order.lines ?? []).map((line) => line.product_name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [onlineOrders, search, status, fulfillment, payment, customerMap, customersById]);

  const activeFilterCount = Number(Boolean(status)) + Number(Boolean(fulfillment)) + Number(Boolean(payment));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setFulfillment('');
    setPayment('');
  }

  async function advanceOrder(order: ShopOrder) {
    const next = nextShopOrderAction(order.status, order.fulfillment_mode);
    if (!client || !next) return;
    setBusyId(order.id);
    try {
      const response = await client.shop.setOrderStatus(order.id, { status: next.status });
      setItems((current) => current.map((item) => (item.id === order.id ? response.data : item)));
      toast.push(`${order.order_number} · ${next.label}`, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to update order', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.pageHint}>
          Online pickup &amp; delivery only. Counter bills are under Books → Sale invoice.
        </Text>
        <SearchBar
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search order #, product, customer, address…"
        />

        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <SelectField
              label="Status"
              value={status}
              options={SHOP_ORDER_STATUS_OPTIONS}
              onChange={setStatus}
              searchable={false}
            />
          </View>
          <View style={styles.filterField}>
            <SelectField
              label="Fulfillment"
              value={fulfillment}
              options={FULFILLMENT_OPTIONS}
              onChange={setFulfillment}
              searchable={false}
            />
          </View>
          <View style={styles.filterField}>
            <SelectField
              label="Payment"
              value={payment}
              options={PAYMENT_OPTIONS}
              onChange={setPayment}
              searchable={false}
            />
          </View>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {filtered.length} online order{filtered.length === 1 ? '' : 's'}
            {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
          </Text>
          {search || activeFilterCount ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const paymentLabel = formatShopOrderPayment(item);
            const due = isShopOrderBorrowDue(item);
            const customerRow = item.customer_id ? customersById.get(item.customer_id) : null;
            const customer = item.customer_id
              ? entityLabel(customerMap, item.customer_id, 'Customer')
              : 'Walk-in';
            const address = orderDeliveryAddress(item, customerRow);
            const preview = (item.lines ?? [])
              .slice(0, 2)
              .map((line) => `${line.product_name} × ${line.quantity}`)
              .join(', ');
            const next = nextShopOrderAction(item.status, item.fulfillment_mode);
            const badge = shopOrderStatusStyle(item.status);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('ShopOrderDetail', { orderId: item.id })}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.order_number}</Text>
                  <Text style={styles.total}>
                    {item.currency || 'INR'} {formatMoney(item.total)}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {formatShopOrderFulfillment(item.fulfillment_mode)} · {customer}
                  </Text>
                </View>
                {address ? <Text style={styles.address}>{address}</Text> : null}
                {item.created_at ? (
                  <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
                ) : null}
                {paymentLabel ? (
                  <Text style={[styles.meta, due && styles.due]}>{paymentLabel}</Text>
                ) : null}
                {preview ? <Text style={styles.preview}>{preview}</Text> : null}
                {next ? (
                  <Pressable
                    style={[styles.nextBtn, busyId === item.id && styles.nextBtnBusy]}
                    disabled={busyId === item.id}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      void advanceOrder(item);
                    }}
                  >
                    <Text style={styles.nextBtnText}>
                      {busyId === item.id ? 'Updating…' : next.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.openHint}>Tap for order detail</Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.meta}>
                {onlineOrders.length
                  ? 'No online orders match these filters.'
                  : `No ${t('nav.shopOrders').toLowerCase()} yet.`}
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
  pageHint: { color: colors.mutedForeground, fontSize: 12, marginBottom: spacing.sm, lineHeight: 16 },
  search: { marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.sm },
  filterField: { flexGrow: 1, minWidth: 140, flexBasis: '30%' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  count: { color: colors.mutedForeground, fontSize: 13 },
  clear: { color: colors.primary, fontWeight: '700', fontSize: 13 },
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
  address: { color: colors.foreground, fontSize: 13, lineHeight: 18 },
  preview: { color: colors.foreground, fontSize: 13, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  nextBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  nextBtnBusy: { opacity: 0.55 },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  openHint: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 4 },
  due: { color: colors.destructive, fontWeight: '600' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
