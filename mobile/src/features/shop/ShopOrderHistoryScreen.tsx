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
import { Chip } from '../../components/ui/Chip';
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
  shopOrderIsCashOnHandover,
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

type FilterMenu = 'period' | 'fulfillment' | null;

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
  const [menuOpen, setMenuOpen] = useState<FilterMenu>(null);
  const hasLoadedRef = useRef(false);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      else if (!hasLoadedRef.current) setLoading(true);
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
      void load(hasLoadedRef.current ? 'refresh' : 'initial');
    }, [load]),
  );

  const visibleOrders = useMemo(
    () =>
      orders.filter((order) =>
        shopOrderMatchesFilters(order, { query: search, status, period, fulfillment, payment }),
      ),
    [fulfillment, orders, payment, period, search, status],
  );

  const filtersActive = status !== 'all' || period !== 'all' || fulfillment !== 'all' || payment !== 'all';
  const periodLabel = SHOP_ORDER_PERIOD_FILTERS.find((item) => item.id === period)?.label ?? 'All time';
  const fulfillmentLabel =
    SHOP_ORDER_FULFILLMENT_FILTERS.find((item) => item.id === fulfillment)?.label ?? 'Any type';
  const menuOptions = menuOpen === 'period' ? SHOP_ORDER_PERIOD_FILTERS : SHOP_ORDER_FULFILLMENT_FILTERS;
  const menuSelected = menuOpen === 'period' ? period : fulfillment;

  function resetFilters() {
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
    const firstProductId = lines[0]?.product;
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
          <View style={[styles.cardMeta, { flex: 1 }]}>
            <Text style={styles.metaKicker}>
              {String(item.fulfillment_mode).toLowerCase() === 'delivery' ? 'SHIP TO' : 'FULFILLMENT'}
            </Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {String(item.fulfillment_mode).toLowerCase() === 'delivery'
                ? item.delivery_address || 'Delivery'
                : shopFulfillmentLabel(item.fulfillment_mode)}
            </Text>
          </View>
        </View>

        <Text style={styles.orderNo}>Order #{item.order_number}</Text>

        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
          <Text style={[styles.statusText, { color: tone.text }]}>
            {deliverySummary?.statusLabel || headline.title}
          </Text>
          {deliverySummary?.etaLabel ? (
            <Text style={[styles.statusText, { color: tone.text }]}> · ETA {deliverySummary.etaLabel}</Text>
          ) : null}
          {shopOrderNeedsAppPayment(item) ? <Text style={styles.unpaidHint}> · Pay now</Text> : null}
        </View>

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

        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ShopOrderDetail', { orderId: item.id })}
          >
            <Text style={styles.actionBtnText}>
              {deliverySummary?.active ? `${deliverySummary.actionLabel} delivery` : 'View details'}
            </Text>
          </Pressable>
          {firstProductId ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary, { borderColor: primary, backgroundColor: `${primary}12` }]}
              onPress={() => navigation.navigate('ShopProductDetail', { productId: String(firstProductId) })}
            >
              <Text style={[styles.actionBtnText, { color: primary }]}>Buy again</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('shop.myOrders')} onBack={() => navigation.goBack()} />

      <View style={styles.toolbar}>
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {SHOP_ORDER_STATUS_FILTERS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              active={status === item.id}
              onPress={() => setStatus(item.id)}
              primaryColor={primary}
            />
          ))}
        </ScrollView>

        <View style={styles.filterRow}>
          <Pressable style={styles.filterBtn} onPress={() => setMenuOpen('period')}>
            <Feather name="calendar" size={14} color={colors.foreground} />
            <Text style={styles.filterBtnText} numberOfLines={1}>
              {periodLabel}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable style={styles.filterBtn} onPress={() => setMenuOpen('fulfillment')}>
            <Feather name="truck" size={14} color={colors.foreground} />
            <Text style={styles.filterBtnText} numberOfLines={1}>
              {fulfillmentLabel}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={[styles.payChip, payment === 'unpaid' && { backgroundColor: primary, borderColor: primary }]}
            onPress={() => setPayment((value) => (value === 'unpaid' ? 'all' : 'unpaid'))}
          >
            <Text style={[styles.payChipText, payment === 'unpaid' && styles.payChipTextOn]}>Needs payment</Text>
          </Pressable>
          {filtersActive || search ? (
            <Pressable onPress={resetFilters}>
              <Text style={[styles.clearFilters, { color: primary }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
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
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
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
              title={orders.length ? 'No matching orders' : 'No orders yet'}
              description={
                orders.length
                  ? 'Try another search or clear the filters.'
                  : 'When you place an order in the shop, it will show up here.'
              }
            />
          ) : null
        }
      />

      <Modal visible={menuOpen != null} transparent animationType="fade" onRequestClose={() => setMenuOpen(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{menuOpen === 'period' ? 'Order date' : 'Order type'}</Text>
            {menuOptions.map((option) => {
              const selected = menuSelected === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={styles.modalRow}
                  onPress={() => {
                    if (menuOpen === 'period') setPeriod(option.id as ShopOrderPeriodFilter);
                    else setFulfillment(option.id as ShopOrderFulfillmentFilter);
                    setMenuOpen(null);
                  }}
                >
                  <Text style={[styles.modalRowText, selected && { color: primary, fontWeight: '700' }]}>
                    {option.label}
                  </Text>
                  {selected ? <Feather name="check" size={16} color={primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
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
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '46%',
  },
  filterBtnText: { ...typography.caption, color: colors.foreground, fontWeight: '600', flexShrink: 1 },
  payChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  payChipText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  payChipTextOn: { color: '#fff' },
  clearFilters: { ...typography.caption, fontWeight: '700' },
  count: { ...typography.caption, color: colors.mutedForeground },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMetaRow: { flexDirection: 'row', gap: spacing.md },
  cardMeta: { minWidth: 78 },
  metaKicker: {
    ...typography.tiny,
    color: colors.mutedForeground,
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  metaValue: { ...typography.caption, color: colors.foreground, fontWeight: '700', marginTop: 2 },
  orderNo: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.md },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...typography.caption, fontWeight: '800' },
  unpaidHint: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  lineRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  lineBody: { flex: 1, justifyContent: 'center' },
  lineName: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  lineMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  moreItems: { ...typography.caption, color: colors.mutedForeground, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  actionBtnPrimary: {},
  actionBtnText: { ...typography.caption, fontWeight: '700', color: colors.foreground },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,22,35,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: 4,
  },
  modalTitle: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  modalRowText: { ...typography.body, color: colors.foreground },
});
