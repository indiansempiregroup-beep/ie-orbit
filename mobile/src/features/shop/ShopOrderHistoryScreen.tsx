import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  SHOP_ORDER_FULFILLMENT_FILTERS,
  SHOP_ORDER_PERIOD_FILTERS,
  SHOP_ORDER_STATUS_FILTERS,
  formatShopMoney,
  formatShopOrderPlaced,
  formatShopQty,
  shopOrderNeedsAppPayment,
  shopOrderNeedsGatewayPayment,
  shopFulfillmentLabel,
  shopOrderDeliverySummary,
  shopOrderHeadline,
  shopOrderMatchesFilters,
  shopOrderStatusColors,
  type ShopOrderFulfillmentFilter,
  type ShopOrderPaymentFilter,
  type ShopOrderPeriodFilter,
  type ShopOrderStatusFilter,
} from './shopHelpers';
import { DeliveryProgressStepper } from './DeliveryProgressStepper';
import type { ShopOrder, ShopOrderLine } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type FilterSection = 'status' | 'period' | 'fulfillment' | 'payment';

type OrderFilterDraft = {
  status: ShopOrderStatusFilter;
  period: ShopOrderPeriodFilter;
  fulfillment: ShopOrderFulfillmentFilter;
  payment: ShopOrderPaymentFilter;
};

const PAYMENT_FILTERS: Array<{ id: ShopOrderPaymentFilter; label: string }> = [
  { id: 'all', label: 'Any payment' },
  { id: 'unpaid', label: 'Needs payment' },
];

function countActiveOrderFilters(filters: OrderFilterDraft): number {
  let count = 0;
  if (filters.status !== 'all') count += 1;
  if (filters.period !== 'all') count += 1;
  if (filters.fulfillment !== 'all') count += 1;
  if (filters.payment !== 'all') count += 1;
  return count;
}

function ProductThumb({ uri }: { uri?: string | null }) {
  const resolved = resolveMediaUrl(uri);
  if (resolved) {
    return <Image source={{ uri: resolved }} style={styles.thumb} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder]}>
      <Feather name="package" size={18} color={colors.mutedForeground} />
    </View>
  );
}

export function ShopOrderHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ShopOrderStatusFilter>('all');
  const [period, setPeriod] = useState<ShopOrderPeriodFilter>('all');
  const [fulfillment, setFulfillment] = useState<ShopOrderFulfillmentFilter>('all');
  const [payment, setPayment] = useState<ShopOrderPaymentFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<FilterSection>('status');
  const [valueQuery, setValueQuery] = useState('');
  const [draft, setDraft] = useState<OrderFilterDraft>({
    status: 'all',
    period: 'all',
    fulfillment: 'all',
    payment: 'all',
  });
  const hasLoadedRef = useRef(false);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      // Only drive the native RefreshControl from an explicit pull. Setting
      // `refreshing` on focus often leaves the top spinner stuck on iOS.
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'initial' && !hasLoadedRef.current) setLoading(true);
      try {
        const res = await mobileClient.mobile.listShopOrders({
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setOrders(res.data);
        hasLoadedRef.current = true;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessCode, tenantSlug],
  );

  useFocusEffect(
    useCallback(() => {
      void load(hasLoadedRef.current ? 'silent' : 'initial');
    }, [load]),
  );

  const appliedFilters: OrderFilterDraft = useMemo(
    () => ({ status, period, fulfillment, payment }),
    [fulfillment, payment, period, status],
  );
  const activeFilterCount = countActiveOrderFilters(appliedFilters);

  const visibleOrders = useMemo(
    () =>
      orders
        .filter((order) =>
          shopOrderMatchesFilters(order, { query: search, status, period, fulfillment, payment }),
        )
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        ),
    [fulfillment, orders, payment, period, search, status],
  );

  const statusLabel = SHOP_ORDER_STATUS_FILTERS.find((item) => item.id === status)?.label ?? 'All';
  const periodLabel = SHOP_ORDER_PERIOD_FILTERS.find((item) => item.id === period)?.label ?? 'All time';
  const fulfillmentLabel =
    SHOP_ORDER_FULFILLMENT_FILTERS.find((item) => item.id === fulfillment)?.label ?? 'Any type';
  const paymentLabel = PAYMENT_FILTERS.find((item) => item.id === payment)?.label ?? 'Any payment';

  const filterSections = useMemo(
    () => [
      { id: 'status' as const, label: 'Status', count: draft.status !== 'all' ? 1 : 0 },
      { id: 'period' as const, label: 'Order date', count: draft.period !== 'all' ? 1 : 0 },
      { id: 'fulfillment' as const, label: 'Order type', count: draft.fulfillment !== 'all' ? 1 : 0 },
      { id: 'payment' as const, label: 'Payment', count: draft.payment !== 'all' ? 1 : 0 },
    ],
    [draft.fulfillment, draft.payment, draft.period, draft.status],
  );

  const sectionValues = useMemo(() => {
    if (activeSection === 'status') return SHOP_ORDER_STATUS_FILTERS;
    if (activeSection === 'period') return SHOP_ORDER_PERIOD_FILTERS;
    if (activeSection === 'fulfillment') return SHOP_ORDER_FULFILLMENT_FILTERS;
    return PAYMENT_FILTERS;
  }, [activeSection]);

  const filteredSectionValues = useMemo(() => {
    const needle = valueQuery.trim().toLowerCase();
    if (!needle) return sectionValues;
    return sectionValues.filter((item) => item.label.toLowerCase().includes(needle));
  }, [sectionValues, valueQuery]);

  function openFilters(section: FilterSection = 'status') {
    setDraft(appliedFilters);
    setActiveSection(section);
    setValueQuery('');
    setFilterOpen(true);
  }

  function closeFilters() {
    setFilterOpen(false);
    setValueQuery('');
  }

  function isValueSelected(id: string): boolean {
    if (activeSection === 'status') return draft.status === id;
    if (activeSection === 'period') return draft.period === id;
    if (activeSection === 'fulfillment') return draft.fulfillment === id;
    return draft.payment === id;
  }

  function selectValue(id: string) {
    setDraft((current) => {
      if (activeSection === 'status') return { ...current, status: id as ShopOrderStatusFilter };
      if (activeSection === 'period') return { ...current, period: id as ShopOrderPeriodFilter };
      if (activeSection === 'fulfillment') {
        return { ...current, fulfillment: id as ShopOrderFulfillmentFilter };
      }
      return { ...current, payment: id as ShopOrderPaymentFilter };
    });
  }

  function applyFilters() {
    setStatus(draft.status);
    setPeriod(draft.period);
    setFulfillment(draft.fulfillment);
    setPayment(draft.payment);
    closeFilters();
  }

  function clearDraftFilters() {
    setDraft({ status: 'all', period: 'all', fulfillment: 'all', payment: 'all' });
  }

  function clearAppliedFilters() {
    setStatus('all');
    setPeriod('all');
    setFulfillment('all');
    setPayment('all');
    setSearch('');
  }

  function renderOrder({ item }: { item: ShopOrder }) {
    const headline = shopOrderHeadline(item);
    const tone = shopOrderStatusColors(headline.tone);
    const lines = item.lines ?? [];
    const preview = lines.slice(0, 2);
    const extra = Math.max(0, lines.length - preview.length);
    const deliverySummary = shopOrderDeliverySummary(item);

    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('ShopOrderDetail', { orderId: item.id })}
      >
        <View style={styles.cardMetaRow}>
          <View style={styles.cardMeta}>
            <Text style={styles.metaKicker}>ORDER PLACED</Text>
            <Text style={styles.metaValue}>{formatShopOrderPlaced(item.created_at)}</Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.metaKicker}>TOTAL</Text>
            <Text style={styles.metaValue}>{formatShopMoney(item.total, item.currency)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
            <Text style={[styles.statusText, { color: tone.text }]} numberOfLines={1}>
              {deliverySummary?.statusLabel || headline.title}
              {deliverySummary?.etaLabel ? ` · ETA ${deliverySummary.etaLabel}` : ''}
            </Text>
            {shopOrderNeedsAppPayment(item) || shopOrderNeedsGatewayPayment(item) ? (
              <Text style={styles.unpaidHint}> · Pay now</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.orderNo}>Order #{item.order_number}</Text>

        {deliverySummary?.active ? (
          <DeliveryProgressStepper order={item} primary={primary} compact />
        ) : null}

        {preview.map((line: ShopOrderLine) => (
          <View key={line.id} style={styles.lineRow}>
            <ProductThumb uri={line.product_image_url} />
            <View style={styles.lineBody}>
              <Text style={styles.lineName} numberOfLines={2}>
                {line.product_name}
              </Text>
              <Text style={styles.lineMeta}>
                Qty {formatShopQty(line.quantity)} · {formatShopMoney(line.line_total, item.currency)}
              </Text>
            </View>
          </View>
        ))}
        {!preview.length ? (
          <View style={styles.lineRow}>
            <ProductThumb />
            <View style={styles.lineBody}>
              <Text style={styles.lineName}>View order items</Text>
              <Text style={styles.lineMeta}>{shopFulfillmentLabel(item.fulfillment_mode)}</Text>
            </View>
          </View>
        ) : null}
        {extra > 0 ? <Text style={styles.moreItems}>+{extra} more item{extra === 1 ? '' : 's'}</Text> : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('shop.myOrders')} onBack={() => navigation.goBack()} />

      <View style={styles.toolbar}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={styles.search}
              placeholder="Search orders or products"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[styles.filterIconBtn, activeFilterCount > 0 && { borderColor: primary, backgroundColor: `${primary}12` }]}
            onPress={() => openFilters()}
            accessibilityLabel="Filters"
          >
            <Feather name="sliders" size={18} color={activeFilterCount > 0 ? primary : colors.foreground} />
            {activeFilterCount > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: primary }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {activeFilterCount > 0 ? (
          <View style={styles.activeFilterBar}>
            <Pressable style={styles.activeFilterSummary} onPress={() => openFilters()}>
              <Feather name="filter" size={12} color={primary} />
              <Text style={[styles.activeFilterSummaryText, { color: primary }]} numberOfLines={1}>
                {[
                  status !== 'all' ? statusLabel : null,
                  period !== 'all' ? periodLabel : null,
                  fulfillment !== 'all' ? fulfillmentLabel : null,
                  payment !== 'all' ? paymentLabel : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
            <Pressable onPress={clearAppliedFilters} hitSlop={8}>
              <Text style={[styles.clearFilters, { color: primary }]}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading ? (
          <Text style={styles.count}>
            {visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}
          </Text>
        ) : null}
      </View>

      {loading && !orders.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}

      <FlatList
        data={visibleOrders}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + 40,
          flexGrow: 1,
          gap: 6,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={primary}
            colors={[primary]}
          />
        }
        renderItem={renderOrder}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="package"
              title={orders.length || search || activeFilterCount ? 'No matching orders' : 'No orders yet'}
              description={
                orders.length || search || activeFilterCount
                  ? 'Try another search or clear the filters.'
                  : 'When you place an order in the shop, it will show up here.'
              }
            />
          ) : null
        }
      />

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={closeFilters}>
        <View style={styles.filterModalRoot}>
          <Pressable style={styles.filterBackdrop} onPress={closeFilters} />
          <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable onPress={closeFilters} hitSlop={8} accessibilityLabel="Close filters">
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.filterBody}>
              <View style={styles.filterLeft}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {filterSections.map((section) => {
                    const selected = activeSection === section.id;
                    return (
                      <Pressable
                        key={section.id}
                        style={[
                          styles.filterNavItem,
                          selected && [styles.filterNavItemOn, { borderLeftColor: primary }],
                        ]}
                        onPress={() => {
                          setActiveSection(section.id);
                          setValueQuery('');
                        }}
                      >
                        <Text
                          style={[
                            styles.filterNavText,
                            selected && { color: primary, fontWeight: '700' },
                          ]}
                        >
                          {section.label}
                        </Text>
                        {section.count > 0 ? (
                          <View style={[styles.sectionDot, { backgroundColor: primary }]} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.filterRight}>
                <View style={styles.valueSearchWrap}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={styles.valueSearch}
                    placeholder={`Search ${filterSections.find((item) => item.id === activeSection)?.label ?? 'filters'}`}
                    placeholderTextColor={colors.mutedForeground}
                    value={valueQuery}
                    onChangeText={setValueQuery}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {valueQuery ? (
                    <Pressable onPress={() => setValueQuery('')} hitSlop={8}>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView
                  style={styles.valueList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredSectionValues.length ? (
                    filteredSectionValues.map((option) => {
                      const selected = isValueSelected(option.id);
                      return (
                        <Pressable
                          key={option.id}
                          style={styles.valueRow}
                          onPress={() => selectValue(option.id)}
                        >
                          <View style={[styles.radio, selected && { borderColor: primary }]}>
                            {selected ? <View style={[styles.radioDot, { backgroundColor: primary }]} /> : null}
                          </View>
                          <Text
                            style={[
                              styles.valueText,
                              selected && { color: primary, fontWeight: '700' },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.valueEmpty}>No matching options</Text>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={styles.filterFooter}>
              <Pressable style={styles.clearBtn} onPress={clearDraftFilters}>
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </Pressable>
              <Pressable style={[styles.applyBtn, { backgroundColor: primary }]} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>
                  Apply{countActiveOrderFilters(draft) ? ` (${countActiveOrderFilters(draft)})` : ''}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  toolbar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  activeFilterSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  activeFilterSummaryText: { ...typography.tiny, fontWeight: '700', flexShrink: 1 },
  clearFilters: { ...typography.tiny, fontWeight: '800' },
  count: { ...typography.caption, color: colors.mutedForeground },
  filterModalRoot: { flex: 1, justifyContent: 'flex-end' },
  filterBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.4)' },
  filterSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    minHeight: '72%',
    overflow: 'hidden',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTitle: { ...typography.title, color: colors.foreground, fontSize: 20 },
  filterBody: { flex: 1, flexDirection: 'row', minHeight: 320 },
  filterLeft: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '40%',
    width: '40%',
    maxWidth: '40%',
    backgroundColor: colors.muted,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  filterNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  filterNavItemOn: {
    backgroundColor: colors.card,
  },
  filterNavText: { ...typography.caption, color: colors.foreground, fontWeight: '600', flex: 1 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  filterRight: { flexGrow: 1, flexShrink: 1, flexBasis: '60%', width: '60%', backgroundColor: colors.card },
  valueSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    backgroundColor: colors.background,
  },
  valueSearch: { flex: 1, ...typography.caption, color: colors.foreground, paddingVertical: 8 },
  valueList: { flex: 1, paddingHorizontal: spacing.md },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  valueText: { ...typography.body, color: colors.foreground, flex: 1 },
  valueEmpty: {
    ...typography.caption,
    color: colors.mutedForeground,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  filterFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clearBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  clearBtnText: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  applyBtn: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { ...typography.label, color: '#fff', fontWeight: '800' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  cardMeta: { minWidth: 78 },
  metaKicker: {
    ...typography.tiny,
    color: colors.mutedForeground,
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  metaValue: { ...typography.caption, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  orderNo: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm, marginBottom: spacing.sm },
  statusPill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '48%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.caption, fontWeight: '800', flexShrink: 1 },
  unpaidHint: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  lineRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, justifyContent: 'center' },
  lineName: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  lineMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  moreItems: { ...typography.caption, color: colors.mutedForeground, marginBottom: spacing.sm },
});
