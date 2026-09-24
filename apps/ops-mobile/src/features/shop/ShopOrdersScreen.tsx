import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useCustomers } from '../../hooks/useOpsData';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import type { Customer, ShopOrder } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatCustomerAddressLabel } from '../../utils/customerAddress';
import { formatRelativeTime } from '../../utils/format';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconBadge } from '../../components/ui/IconBadge';
import {
  formatMoney,
  formatShopOrderFulfillment,
  formatShopOrderPayment,
  getShopOrderPosMeta,
  isShopOrderBorrowDue,
  nextShopOrderAction,
  SHOP_ORDER_STATUS_OPTIONS,
  shopOrderBadgeStyle,
} from './posPayment';
import { deliveryMethodForOrder } from './deliveryTracking';

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
  const label = formatCustomerAddressLabel(customer);
  return label === '—' ? '' : label;
}

function orderDeliveryAddress(order: ShopOrder, customer?: Customer | null): string {
  const delivery = String(order.delivery_address || '').trim();
  if (delivery) return delivery;
  return formatCustomerAddress(customer);
}

export function ShopOrdersScreen() {
  const { t } = useTranslation();
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
  const [sortBy, setSortBy] = useState('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    const list = onlineOrders.filter((order) => {
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
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      if (sortBy === 'amount_desc') return Number(b.total ?? 0) - Number(a.total ?? 0);
      if (sortBy === 'amount_asc') return Number(a.total ?? 0) - Number(b.total ?? 0);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [onlineOrders, search, status, fulfillment, payment, sortBy, customerMap, customersById]);

  const activeFilterCount =
    Number(Boolean(status)) + Number(Boolean(fulfillment)) + Number(Boolean(payment)) + Number(sortBy !== 'newest');

  function clearFilters() {
    setSearch('');
    setStatus('');
    setFulfillment('');
    setPayment('');
    setSortBy('newest');
  }

  async function advanceOrder(order: ShopOrder) {
    const next = nextShopOrderAction(
      order.status,
      order.fulfillment_mode,
      deliveryMethodForOrder(order),
    );
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
      <View style={styles.toolbar}>
        <SearchBar
          style={styles.searchFlex}
          value={search}
          onChangeText={setSearch}
          placeholder="Search order #, product, customer, address…"
        />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
      </View>
      <View style={styles.actionRow}>
        <Text style={styles.count}>
          {filtered.length} online order{filtered.length === 1 ? '' : 's'}
          {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ''}
        </Text>
        {search || activeFilterCount ? (
          <Pressable onPress={clearFilters} hitSlop={8} accessibilityRole="button">
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setStatus('');
          setFulfillment('');
          setPayment('');
          setSortBy('newest');
        }}
      >
        <FilterChoiceGroup label="Status" value={status} options={SHOP_ORDER_STATUS_OPTIONS} onChange={setStatus} />
        <FilterChoiceGroup label="Fulfillment" value={fulfillment} options={FULFILLMENT_OPTIONS} onChange={setFulfillment} />
        <FilterChoiceGroup label="Payment" value={payment} options={PAYMENT_OPTIONS} onChange={setPayment} />
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

      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.pageHint}>
          Online pickup &amp; delivery only. Counter bills are under Books → Sale invoice.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="shopping-bag"
            title={onlineOrders.length ? 'No matching orders' : `No ${t('nav.shopOrders').toLowerCase()} yet`}
            message={
              onlineOrders.length
                ? 'Try a different search or filter.'
                : 'Online pickup and delivery orders will show up here.'
            }
          />
        ) : null}

        {filtered.length ? (
          <View style={styles.group}>
            {filtered.map((item, index) => {
              const due = isShopOrderBorrowDue(item);
              const customerRow = item.customer_id ? customersById.get(item.customer_id) : null;
              const customer = item.customer_id
                ? entityLabel(customerMap, item.customer_id, 'Customer')
                : 'Walk-in';
              const customerPhone = item.customer_phone || customerRow?.phone_number || '';
              const address = orderDeliveryAddress(item, customerRow);
              const preview = (item.lines ?? [])
                .slice(0, 2)
                .map((line) => `${line.product_name} × ${line.quantity}`)
                .join(', ');
              const deliveryMethod = deliveryMethodForOrder(item);
              const next =
                deliveryMethod === 'instant' && item.status === 'delivery_failed'
                  ? null
                  : nextShopOrderAction(item.status, item.fulfillment_mode, deliveryMethod);
              const badge = shopOrderBadgeStyle(item);
              const fulfillmentLabel =
                String(item.fulfillment_mode).toLowerCase() === 'delivery'
                  ? deliveryMethod === 'instant'
                    ? 'Deliver now'
                    : 'Delivery'
                  : formatShopOrderFulfillment(item.fulfillment_mode);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => navigation.navigate('ShopOrderDetail', { orderId: item.id })}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <View style={[styles.row, index > 0 && styles.rowDivider]}>
                    <IconBadge
                      icon={String(item.fulfillment_mode).toLowerCase() === 'delivery' ? 'truck' : 'shopping-bag'}
                      tone={due ? 'amber' : 'navy'}
                    />
                    <View style={styles.copy}>
                      <View style={styles.metaRow}>
                        <Text style={styles.typeLabel}>{badge.label}</Text>
                        <Text style={styles.time}>
                          {item.created_at ? formatRelativeTime(item.created_at) : ''}
                        </Text>
                      </View>
                      <View style={styles.titleRow}>
                        <Text style={styles.subject} numberOfLines={1}>
                          {customer}
                        </Text>
                        <Text style={[styles.amount, due && styles.amountDue]} numberOfLines={1}>
                          {item.currency || 'INR'} {formatMoney(item.total)}
                        </Text>
                      </View>
                      <Text style={styles.body} numberOfLines={2}>
                        {[item.order_number, fulfillmentLabel, customerPhone, preview].filter(Boolean).join(' · ')}
                      </Text>
                      {address ? (
                        <Text style={styles.address} numberOfLines={1}>
                          {address}
                        </Text>
                      ) : null}
                      {next ? (
                        <Pressable
                          onPress={() => void advanceOrder(item)}
                          hitSlop={8}
                          disabled={busyId === item.id}
                        >
                          <Text style={styles.action}>{busyId === item.id ? 'Updating…' : next.label}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchFlex: { flex: 1 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  count: { ...typography.caption, color: colors.mutedForeground },
  clear: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  pageHint: { color: colors.mutedForeground, fontSize: 12, lineHeight: 16 },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  copy: { flex: 1, minWidth: 0, paddingTop: 2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  typeLabel: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  time: { ...typography.caption, color: colors.mutedForeground },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subject: { flex: 1, ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 15 },
  amount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  amountDue: { color: colors.destructive },
  body: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 },
  address: { ...typography.caption, color: colors.foreground, marginTop: 2, lineHeight: 18 },
  action: { color: colors.primary, fontSize: 13, fontFamily: fonts.bodySemi, marginTop: 8 },
  pressed: { opacity: 0.92 },
  error: { color: colors.destructive },
});
