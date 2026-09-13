import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { BillingOrder, BillingPlanCatalogItem, BusinessProductSubscription } from '@ie-orbit/sdk';
import { FormHero } from '../../components/FormHero';
import { FormScreen } from '../../components/FormScreen';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { SearchBar } from '../../components/SearchBar';
import { ScreenState } from '../../components/ScreenState';
import { SoftLockBanner } from '../../components/SoftLockBanner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormSection } from '../../components/ui/FormSection';
import { IconBadge } from '../../components/ui/IconBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createScopedClient, opsClient } from '../../api/client';
import {
  SubscriptionUpiPaySheet,
  type SubscriptionUpiPayRequest,
} from './SubscriptionUpiPaySheet';
import {
  useBillingOrders,
  useBusinessBillingSnapshot,
  useProductMutations,
  useProductPlans,
  useTenantSettings,
  useUpdateBusinessAddons,
} from '../../hooks/useOpsExtended';
import { colors, fonts, radius, shadows, spacing, typography, type IconTone } from '../../theme/tokens';
import { formatDate, formatRelativeTime, getApiErrorMessage } from '../../utils/format';
import { resolveBillingProofUrl } from '../../utils/mediaUrl';
import { isLoyaltyEntitled, readLoyaltyPrefs as parseLoyaltyPrefs } from '../../utils/loyalty';
import {
  daysUntil,
  filterBillingOrders,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryBucket,
  orderHistoryCounts,
  orderStatusLabel,
  renewCtaLabel,
  subscriptionDueAt,
  subscriptionStatusLabel,
  subscriptionUxStatus,
  trackerStepIndex,
  trackerSteps,
  type OrderHistoryRange,
  type OrderHistoryStatusFilter,
  type SubscriptionUxStatus,
} from '../../utils/subscriptionUx';
import {
  formatInrFromPaise,
  formatPlanDisplayName,
  getProductName,
  getRecommendedPlanCode,
  getSubscribedProducts,
  isRecommendedPlanCode,
  allowedExtraCount,
  starterAddonCapHint,
  PETS_PACK_PRICE_INR,
  PRODUCT_CATALOG,
} from '../../utils/products';

const HUB_FILTERS = [
  ['all', 'All'],
  ['due', 'Due soon'],
  ['review', 'Under review'],
  ['locked', 'Locked'],
] as const;

function StatusChip({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'success' | 'warning' | 'info' | 'danger';
}) {
  return (
    <View
      style={[
        styles.chip,
        tone === 'success' && styles.chipSuccess,
        tone === 'warning' && styles.chipWarning,
        tone === 'info' && styles.chipInfo,
        tone === 'danger' && styles.chipDanger,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          tone === 'success' && styles.chipTextSuccess,
          tone === 'warning' && styles.chipTextWarning,
          tone === 'info' && styles.chipTextInfo,
          tone === 'danger' && styles.chipTextDanger,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function statusTone(status: SubscriptionUxStatus): 'muted' | 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'active' || status === 'trial') return 'success';
  if (status === 'locked') return 'danger';
  if (status === 'payment_pending' || status === 'due_soon') return 'warning';
  return 'muted';
}

function estimateProductTotalPaise(
  subscription: BusinessProductSubscription,
  catalog: BillingPlanCatalogItem | undefined,
  addons: { staff: number; office: number; pets: number },
) {
  const yearly = subscription.billing_interval === 'yearly';
  const base = yearly
    ? catalog?.yearly_amount_paise ?? (catalog?.amount_paise ?? 0) * 10
    : catalog?.amount_paise ?? 0;
  const multiplier = yearly ? 10 : 1;
  return (
    (base ?? 0) +
    (subscription.extra_staff ?? 0) * addons.staff * multiplier +
    (subscription.extra_offices ?? 0) * addons.office * multiplier +
    (subscription.product_code === 'shopie' && subscription.pets_pack_enabled ? addons.pets * multiplier : 0)
  );
}

function FactGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.factGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.factCell}>
          <Text style={styles.factLabel}>{item.label}</Text>
          <Text style={styles.factValue} numberOfLines={2}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PaymentTracker({ status, dueLabel }: { status: SubscriptionUxStatus; dueLabel?: string | null }) {
  const current = trackerStepIndex(status);
  const steps = trackerSteps(status, dueLabel);
  return (
    <View style={styles.tracker} accessibilityLabel="Payment tracker">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={`${index}-${label}`}>
            <View style={styles.trackerRow}>
              <View
                style={[
                  styles.trackerDot,
                  done && styles.trackerDotDone,
                  active && styles.trackerDotCurrent,
                ]}
              >
                {done ? (
                  <Feather name="check" size={10} color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.trackerDotText, active && styles.trackerDotTextCurrent]}>{index + 1}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.trackerText,
                  done && styles.trackerTextDone,
                  active && styles.trackerTextCurrent,
                ]}
              >
                {label}
              </Text>
            </View>
            {index < steps.length - 1 ? (
              <View style={[styles.trackerLine, done && styles.trackerLineDone]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function orderProducts(order: BillingOrder) {
  const codes = order.product_codes?.length
    ? order.product_codes
    : order.line_items?.map((item) => item.product_code) ?? [order.product_code];
  return (codes.filter(Boolean) as string[]).map((code) => getProductName(code)).join(' + ');
}

function billingHistoryIcon(bucket: ReturnType<typeof orderHistoryBucket>): keyof typeof Feather.glyphMap {
  if (bucket === 'paid') return 'check-circle';
  if (bucket === 'rejected') return 'x-circle';
  if (bucket === 'review') return 'clock';
  return 'credit-card';
}

function fitProofSize(
  natural: { width: number; height: number } | null,
  maxWidth: number,
  maxHeight: number,
) {
  if (!natural || natural.width <= 0 || natural.height <= 0) {
    return { width: maxWidth, height: Math.min(220, maxHeight) };
  }
  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

function billingHistoryTone(bucket: ReturnType<typeof orderHistoryBucket>): IconTone {
  if (bucket === 'paid') return 'green';
  if (bucket === 'rejected') return 'rose';
  if (bucket === 'review') return 'amber';
  return 'navy';
}

function BillingOrderRow({
  order,
  divider,
  onViewProof,
}: {
  order: BillingOrder;
  divider?: boolean;
  onViewProof?: (url: string) => void;
}) {
  const bucket = orderHistoryBucket(order);
  const proofUrl = resolveBillingProofUrl(order);
  const orderNo = String(order.order_number || order.id.slice(0, 8).toUpperCase()).replace(/^#/, '');
  const meta = [
    `#${orderNo}`,
    `UTR ${order.upi_utr || 'not provided'}`,
    order.claimed_at ? `Submitted ${formatDate(order.claimed_at)}` : null,
    order.paid_at ? `Confirmed ${formatDate(order.paid_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.historyRow, divider && styles.historyRowDivider]}>
      <IconBadge icon={billingHistoryIcon(bucket)} tone={billingHistoryTone(bucket)} />
      <View style={styles.historyCopy}>
        <View style={styles.historyMetaRow}>
          <Text style={styles.historyType}>{orderStatusLabel(order.payment_status, order.status)}</Text>
          <Text style={styles.historyTime}>{formatRelativeTime(order.claimed_at || order.created_at)}</Text>
        </View>
        <View style={styles.historyTitleRow}>
          <Text style={styles.historySubject} numberOfLines={1}>
            {orderProducts(order)}
          </Text>
          <Text style={styles.historyAmount} numberOfLines={1}>
            {formatInrFromPaise(order.amount_paise) ?? '—'}
          </Text>
        </View>
        <Text style={styles.historyBody} numberOfLines={2}>
          {meta}
        </Text>
        {order.note ? (
          <Text style={styles.historyBody} numberOfLines={1}>
            {order.note}
          </Text>
        ) : null}
        {proofUrl ? (
          <Pressable onPress={() => onViewProof?.(proofUrl)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.historyAction}>View screenshot</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function readLoyaltyPrefs(business: { settings?: Record<string, unknown> | null } | null | undefined) {
  const prefs = parseLoyaltyPrefs(business?.settings as Record<string, unknown> | undefined);
  return {
    enabled: prefs.enabled,
    points_per_currency_unit: String(prefs.points_per_currency_unit),
    max_redeem_percent: String(prefs.max_redeem_percent),
    min_redeem_points: String(prefs.min_redeem_points),
    earn_points_per_100: String(prefs.earn_points_per_100),
  };
}

export function ProductSettingsScreen() {
  const toast = useToast();
  const { token } = useAuth();
  const { activeBusiness, refreshWorkspace, businessId, tenantId } = useWorkspace();
  const { settings, loading } = useTenantSettings();
  const [billingFocus, setBillingFocus] = useState(activeBusiness?.selected_product ?? 'appointie');
  const { billing: snapshot, reload: reloadSnapshot } = useBusinessBillingSnapshot(billingFocus);
  const { orders, reload: reloadOrders } = useBillingOrders();
  const addons = useUpdateBusinessAddons();
  const { plans } = useProductPlans();
  const mutations = useProductMutations();
  const [extraStaff, setExtraStaff] = useState(0);
  const [extraOffices, setExtraOffices] = useState(0);
  const [petsPackEnabled, setPetsPackEnabled] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [pointsPerUnit, setPointsPerUnit] = useState('10');
  const [maxRedeemPercent, setMaxRedeemPercent] = useState('50');
  const [minRedeemPoints, setMinRedeemPoints] = useState('10');
  const [earnPointsPer100, setEarnPointsPer100] = useState('1');
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const subscribedProducts = useMemo(
    () => getSubscribedProducts(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );

  const subscriptionByProduct = useMemo(() => {
    const map = new Map<string, BusinessProductSubscription>();
    activeBusiness?.product_subscriptions?.forEach((subscription) => {
      if (subscription.status === 'trialing' || subscription.status === 'active' || subscription.status === 'soft_locked') {
        map.set(subscription.product_code, subscription);
      }
    });
    return map;
  }, [activeBusiness?.product_subscriptions]);

  const plansByProduct = useMemo(() => {
    const map = new Map<string, typeof plans>();
    plans.forEach((plan) => {
      const productCode = plan.product_code;
      if (!productCode) return;
      const current = map.get(productCode) ?? [];
      current.push(plan);
      map.set(productCode, current);
    });
    return map;
  }, [plans]);

  const [pendingPlanByProduct, setPendingPlanByProduct] = useState<Record<string, string>>({});
  const [catalogPlans, setCatalogPlans] = useState<BillingPlanCatalogItem[]>([]);
  const [catalogAddons, setCatalogAddons] = useState({
    staff: 19900,
    office: 29900,
    pets: PETS_PACK_PRICE_INR * 100,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [upiPayRequest, setUpiPayRequest] = useState<SubscriptionUpiPayRequest | null>(null);
  const [selectedPay, setSelectedPay] = useState<string[]>([]);
  const [hubTab, setHubTab] = useState<'subscriptions' | 'orders'>('subscriptions');
  const [hubFilter, setHubFilter] = useState<'all' | 'due' | 'review' | 'locked'>('all');
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderHistoryStatusFilter>('all');
  const [orderRange, setOrderRange] = useState<OrderHistoryRange>('all');
  const [orderProduct, setOrderProduct] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [proofNatural, setProofNatural] = useState<{ width: number; height: number } | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const proofMaxWidth = Math.max(240, windowWidth - spacing.xl * 2 - spacing.md * 2);
  const proofMaxHeight = Math.max(180, Math.round(windowHeight * 0.65));
  const proofSize = fitProofSize(proofNatural, proofMaxWidth, proofMaxHeight);

  useEffect(() => {
    setProofFailed(false);
    setProofNatural(null);
    if (!proofPreviewUrl) return;
    let cancelled = false;
    Image.getSize(
      proofPreviewUrl,
      (width, height) => {
        if (!cancelled) setProofNatural({ width, height });
      },
      () => {
        if (!cancelled) setProofFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [proofPreviewUrl]);

  useEffect(() => {
    if (subscribedProducts.some((product) => product.id === billingFocus)) return;
    setBillingFocus(subscribedProducts[0]?.id ?? 'appointie');
  }, [subscribedProducts, billingFocus]);

  useEffect(() => {
    let cancelled = false;
    opsClient.billing
      .publicPlans()
      .then((response) => {
        if (!cancelled) {
          setCatalogPlans(response.data.plans ?? []);
          setCatalogAddons({
            staff: response.data.addon_staff_price_paise ?? 19900,
            office: response.data.addon_office_price_paise ?? 29900,
            pets: response.data.addon_pets_price_paise ?? PETS_PACK_PRICE_INR * 100,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const prefs = readLoyaltyPrefs(activeBusiness as { settings?: Record<string, unknown> } | null);
    setLoyaltyEnabled(prefs.enabled);
    setPointsPerUnit(prefs.points_per_currency_unit);
    setMaxRedeemPercent(prefs.max_redeem_percent);
    setMinRedeemPoints(prefs.min_redeem_points);
    setEarnPointsPer100(prefs.earn_points_per_100);
  }, [activeBusiness]);

  const rewardPointsEntitled = isLoyaltyEntitled([
    ...((snapshot?.entitled_features as string[] | undefined) ?? []),
    ...((snapshot?.features as string[] | undefined) ?? []),
  ]);
  const canConfigureLoyalty = rewardPointsEntitled && !snapshot?.soft_locked;
  const filteredOrders = useMemo(
    () =>
      filterBillingOrders(orders, {
        query: orderQuery,
        status: orderStatus,
        range: orderRange,
        productCode: orderProduct,
        productName: getProductName,
      }),
    [orders, orderQuery, orderStatus, orderRange, orderProduct],
  );
  const orderCounts = useMemo(() => orderHistoryCounts(orders), [orders]);
  const extraFilterCount =
    Number(orderStatus !== 'all') + Number(orderRange !== 'all') + Number(Boolean(orderProduct));
  const historyFiltersActive = Boolean(orderQuery.trim() || extraFilterCount);

  useEffect(() => {
    setPendingPlanByProduct((current) => {
      const next = { ...current };
      PRODUCT_CATALOG.forEach((product) => {
        if (next[product.id]) return;
        const subscription = subscriptionByProduct.get(product.id);
        const productPlans = plansByProduct.get(product.id) ?? [];
        next[product.id] = subscription?.plan_code || getRecommendedPlanCode(productPlans);
      });
      return next;
    });
  }, [subscriptionByProduct, plansByProduct]);

  useEffect(() => {
    if (!snapshot) return;
    setExtraStaff(snapshot.extra_staff ?? 0);
    setExtraOffices(snapshot.extra_offices ?? 0);
    setPetsPackEnabled(Boolean(snapshot.pets_pack_enabled));
  }, [snapshot?.extra_staff, snapshot?.extra_offices, snapshot?.pets_pack_enabled, snapshot?.soft_locked]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([refreshWorkspace(), reloadSnapshot(), reloadOrders()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function afterMutation(successMessage: string) {
    await Promise.all([refreshWorkspace(), reloadSnapshot(), reloadOrders()]);
    toast.push(successMessage, 'success');
  }

  function showError(err: unknown, fallback: string) {
    toast.push(getApiErrorMessage(err, fallback), 'error');
  }

  function clearHistoryFilters() {
    setOrderQuery('');
    setOrderStatus('all');
    setOrderRange('all');
    setOrderProduct('');
  }

  const checkoutProductCode = billingFocus || subscribedProducts[0]?.id || 'appointie';
  const scopedClient =
    token && tenantId && businessId ? createScopedClient(token, tenantId, businessId) : null;
  const pendingClaims = snapshot?.pending_upi_claims ?? [];
  const unsubscribedProducts = PRODUCT_CATALOG.filter((product) => !subscriptionByProduct.has(product.id));

  const visibleSubscriptions = PRODUCT_CATALOG.filter((product) => {
    const subscription = subscriptionByProduct.get(product.id);
    if (!subscription) return false;
    const paymentPending = pendingClaims.some((row) =>
      (row.product_codes ?? [row.product_code]).includes(product.id),
    );
    const uxStatus = subscriptionUxStatus(subscription, paymentPending);
    if (hubFilter === 'due' && uxStatus !== 'due_soon') return false;
    if (hubFilter === 'review' && uxStatus !== 'payment_pending') return false;
    if (hubFilter === 'locked' && uxStatus !== 'locked') return false;
    return true;
  });

  if (loading && !settings) {
    return (
      <FormScreen>
        <ScreenState loading />
      </FormScreen>
    );
  }

  return (
    <FormScreen refreshing={refreshing} onRefresh={refreshAll}>
      <SoftLockBanner />

      {upiPayRequest && scopedClient && token && tenantId && businessId ? (
        <SubscriptionUpiPaySheet
          client={scopedClient}
          token={token}
          tenantId={tenantId}
          businessId={businessId}
          request={upiPayRequest}
          onClose={() => setUpiPayRequest(null)}
          onClaimed={async () => {
            await Promise.all([refreshWorkspace(), reloadSnapshot(), reloadOrders()]);
            toast.push('Payment received — waiting for IE to confirm (usually same day).', 'success');
            setHubTab('orders');
          }}
          onError={(message) => toast.push(message, 'error')}
        />
      ) : null}

      <FormHero subtitle="Each product has its own bill and due date. We never charge automatically." />

      <View style={styles.segment}>
        <Pressable
          onPress={() => setHubTab('subscriptions')}
          style={[styles.segmentBtn, hubTab === 'subscriptions' && styles.segmentBtnOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: hubTab === 'subscriptions' }}
        >
          <Text style={[styles.segmentText, hubTab === 'subscriptions' && styles.segmentTextOn]}>Subscriptions</Text>
        </Pressable>
        <Pressable
          onPress={() => setHubTab('orders')}
          style={[styles.segmentBtn, hubTab === 'orders' && styles.segmentBtnOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: hubTab === 'orders' }}
        >
          <Text style={[styles.segmentText, hubTab === 'orders' && styles.segmentTextOn]}>History</Text>
          {orders.length ? (
            <View style={[styles.segmentBadge, hubTab === 'orders' && styles.segmentBadgeOn]}>
              <Text style={[styles.segmentBadgeText, hubTab === 'orders' && styles.segmentBadgeTextOn]}>
                {orders.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {hubTab === 'orders' ? (
        <View style={styles.stack}>
          <View style={styles.toolbar}>
            <SearchBar
              value={orderQuery}
              onChangeText={setOrderQuery}
              placeholder="Order #, UTR, or product"
              style={styles.searchFlex}
            />
            <FilterButton count={extraFilterCount} onPress={() => setFiltersOpen(true)} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
            {ORDER_STATUS_FILTERS.map((item) => (
              <Chip
                key={item.id}
                label={orderCounts[item.id] ? `${item.label} · ${orderCounts[item.id]}` : item.label}
                active={orderStatus === item.id}
                onPress={() => setOrderStatus(item.id)}
              />
            ))}
          </ScrollView>
          <View style={styles.historyCountRow}>
            <Text style={styles.historyCount}>
              {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'}
              {orders.length !== filteredOrders.length ? ` of ${orders.length}` : ''}
              {orderRange !== 'all' ? ` · ${ORDER_RANGE_FILTERS.find((item) => item.id === orderRange)?.label}` : ''}
              {orderProduct ? ` · ${getProductName(orderProduct)}` : ''}
            </Text>
            {historyFiltersActive ? (
              <Pressable onPress={clearHistoryFilters} hitSlop={8} accessibilityRole="button">
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {orders.length === 0 ? (
            <EmptyState
              icon="file-text"
              tone="navy"
              title="No orders yet"
              message="When you pay with UPI, the order appears here with UTR, screenshot, and status."
            />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon="search"
              tone="navy"
              title="No matching orders"
              message="Try another order number, UTR, product, or date range."
              actionLabel="Clear filters"
              onAction={clearHistoryFilters}
            />
          ) : (
            <View style={styles.historyGroup}>
              {filteredOrders.map((order, index) => (
                <BillingOrderRow
                  key={order.id}
                  order={order}
                  divider={index > 0}
                  onViewProof={setProofPreviewUrl}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.stack}>
          {subscriptionByProduct.size > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
              {HUB_FILTERS.map(([id, label]) => (
                <Chip key={id} label={label} active={hubFilter === id} onPress={() => setHubFilter(id)} />
              ))}
            </ScrollView>
          ) : null}

          {subscriptionByProduct.size === 0 ? (
            <EmptyState
              icon="package"
              tone="navy"
              title="No subscriptions yet"
              message="Start a product below. Each one has its own bill and due date."
            />
          ) : visibleSubscriptions.length === 0 ? (
            <EmptyState
              icon="filter"
              tone="navy"
              title="Nothing in this filter"
              message="Try All to see every subscribed product."
              actionLabel="Show all"
              onAction={() => setHubFilter('all')}
            />
          ) : (
            visibleSubscriptions.map((product) => {
              const subscription = subscriptionByProduct.get(product.id);
              if (!subscription) return null;
              const productPlans = plansByProduct.get(product.id) ?? [];
              const selectedPlanCode =
                pendingPlanByProduct[product.id] ||
                subscription.plan_code ||
                getRecommendedPlanCode(productPlans);
              const paymentPending = pendingClaims.some((row) =>
                (row.product_codes ?? [row.product_code]).includes(product.id),
              );
              const uxStatus = subscriptionUxStatus(subscription, paymentPending);
              const isSoftLocked = uxStatus === 'locked';
              const pendingPlanCode = subscription.pending_cancel ? 'canceled' : subscription.pending_plan_code ?? null;
              const selectedTitle = formatPlanDisplayName(
                productPlans.find((plan) => plan.code === selectedPlanCode)?.name,
                selectedPlanCode,
              );
              const dueDays = daysUntil(subscriptionDueAt(subscription));
              const amountLabel = `${formatInrFromPaise(
                estimateProductTotalPaise(
                  subscription,
                  catalogPlans.find((item) => item.plan_code === subscription.plan_code),
                  catalogAddons,
                ),
              ) ?? '—'}/${subscription.billing_interval === 'yearly' ? 'year' : 'month'}`;
              const dueLabel = formatDate(subscriptionDueAt(subscription));
              const latestOrder = orders.find((order) =>
                (order.product_codes ?? [order.product_code]).includes(product.id),
              );
              const showPlans = Boolean(planOpen[product.id]);
              return (
                <Card
                  key={product.id}
                  style={[
                    styles.cardStack,
                    isSoftLocked ? styles.cardDanger : paymentPending ? styles.cardReview : uxStatus === 'due_soon' ? styles.cardReview : undefined,
                  ]}
                >
                  <View style={styles.cardHead}>
                    <View style={styles.cardHeadCopy}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.planLine}>
                        {formatPlanDisplayName(subscription.plan_name, subscription.plan_code)}
                      </Text>
                    </View>
                    <StatusChip label={subscriptionStatusLabel(uxStatus, dueDays)} tone={statusTone(uxStatus)} />
                  </View>
                  <Text style={styles.amountHero}>{amountLabel}</Text>
                  <Text style={styles.meta}>
                    Next payment due {dueLabel} · {amountLabel}. We do not charge automatically.
                  </Text>
                  <FactGrid
                    items={[
                      { label: 'Next payment', value: dueLabel },
                      { label: 'Started', value: formatDate(subscription.subscribed_at) },
                      {
                        label: 'Last order',
                        value: latestOrder?.order_number || latestOrder?.id.slice(0, 8).toUpperCase() || '—',
                      },
                      { label: 'Bill to', value: activeBusiness?.display_name ?? '—' },
                    ]}
                  />
                  <PaymentTracker status={uxStatus} dueLabel={dueLabel} />
                  {pendingPlanCode ? (
                    <View style={styles.notice}>
                      <Text style={styles.noticeTitle}>
                        {pendingPlanCode === 'canceled'
                          ? 'Cancellation scheduled'
                          : `${formatPlanDisplayName(subscription.plan_name, subscription.plan_code)} until ${formatDate(
                              subscription.current_period_ends_at,
                            )}, then ${formatPlanDisplayName(subscription.pending_plan_name, pendingPlanCode)}`}
                      </Text>
                      <Button
                        label="Keep current plan"
                        variant="outline"
                        loading={busy === `cancel-${product.id}`}
                        onPress={async () => {
                          setBusy(`cancel-${product.id}`);
                          try {
                            await mutations.cancelPendingPlan(product.id);
                            await afterMutation(`Kept the current ${product.name} plan.`);
                          } catch (err) {
                            showError(err, 'Unable to cancel the scheduled plan change.');
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                    </View>
                  ) : null}
                  {paymentPending ? (
                    <View style={styles.notice}>
                      <Text style={styles.noticeTitle}>
                        Payment received — waiting for IE to confirm (usually same day).
                      </Text>
                    </View>
                  ) : null}
                  {isSoftLocked && !paymentPending ? (
                    <View style={[styles.notice, styles.noticeDanger]}>
                      <Text style={[styles.noticeTitle, styles.noticeTitleDanger]}>
                        {renewCtaLabel(product.id)} — pay this period to keep bookings unlocked.
                      </Text>
                    </View>
                  ) : null}
                  {showPlans ? (
                    <View style={styles.planGrid}>
                      {productPlans.map((plan) => {
                        const catalog = catalogPlans.find((item) => item.plan_code === plan.code);
                        const selected = selectedPlanCode === plan.code;
                        const recommended = isRecommendedPlanCode(plan.code);
                        const price = formatInrFromPaise(catalog?.amount_paise);
                        return (
                          <Pressable
                            key={plan.code}
                            onPress={() => {
                              setBillingFocus(product.id);
                              setPendingPlanByProduct((current) => ({ ...current, [product.id]: plan.code }));
                            }}
                            style={[styles.planCard, selected ? styles.planCardSelected : null]}
                          >
                            <Text style={styles.planBadge}>{recommended ? 'Recommended' : 'Starter'}</Text>
                            <Text style={styles.planName}>
                              {formatPlanDisplayName(catalog?.name ?? plan.name, plan.code)}
                            </Text>
                            <Text style={styles.planPrice}>{price ? `${price}/month` : 'Trial first'}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <View style={styles.stackTight}>
                    <Button
                      label={paymentPending ? 'Payment under review' : renewCtaLabel(product.id)}
                      icon="credit-card"
                      disabled={paymentPending || !selectedPlanCode}
                      fullWidth
                      onPress={() => {
                        const plan = productPlans.find((item) => item.code === selectedPlanCode);
                        setBillingFocus(product.id);
                        setUpiPayRequest({
                          productCode: product.id,
                          planCode: selectedPlanCode,
                          productName: product.name,
                          planName: formatPlanDisplayName(plan?.name, selectedPlanCode),
                          extraStaff: product.id === billingFocus ? extraStaff : subscription.extra_staff ?? 0,
                          extraOffices: product.id === billingFocus ? extraOffices : subscription.extra_offices ?? 0,
                          petsPackEnabled:
                            product.id === 'shopie'
                              ? product.id === billingFocus
                                ? petsPackEnabled
                                : Boolean(subscription.pets_pack_enabled)
                              : false,
                          mode: 'renew',
                          autoStart: true,
                        });
                      }}
                    />
                    {isSoftLocked ? null : (
                      <View style={styles.actionRow}>
                        <Button
                          label={
                            !showPlans
                              ? 'Change plan'
                              : selectedPlanCode === subscription.plan_code
                                ? 'Current plan'
                                : `Switch to ${selectedTitle}`
                          }
                          variant="outline"
                          loading={busy === `plan-${product.id}`}
                          disabled={
                            showPlans &&
                            (selectedPlanCode === subscription.plan_code || selectedPlanCode === pendingPlanCode)
                          }
                          style={styles.flexBtn}
                          onPress={() => {
                            if (!showPlans) {
                              setPlanOpen((current) => ({ ...current, [product.id]: true }));
                              return;
                            }
                            const runChange = async () => {
                              setBusy(`plan-${product.id}`);
                              try {
                                await mutations.changePlan(product.id, selectedPlanCode);
                                await afterMutation(
                                  selectedPlanCode.includes('starter') && (subscription.plan_code ?? '').includes('pro')
                                    ? `${product.name} will switch to ${selectedTitle} at period end.`
                                    : `${product.name} is now on ${selectedTitle}.`,
                                );
                                setPlanOpen((current) => ({ ...current, [product.id]: false }));
                              } catch (err) {
                                showError(err, 'Unable to change plan. Check staff and office limits.');
                              } finally {
                                setBusy(null);
                              }
                            };
                            if ((subscription.plan_code ?? '').includes('pro') && selectedPlanCode.includes('starter')) {
                              Alert.alert(
                                'Schedule plan change',
                                'This takes effect at the end of your current billing period. You keep your current plan until then.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Continue', onPress: () => void runChange() },
                                ],
                              );
                              return;
                            }
                            void runChange();
                          }}
                        />
                        <Button
                          label="Unsubscribe"
                          variant="ghost"
                          loading={busy === `unsub-${product.id}`}
                          style={styles.flexBtn}
                          onPress={() => {
                            Alert.alert(`Unsubscribe ${product.name}?`, 'Billing for this product stops immediately.', [
                              { text: 'Keep', style: 'cancel' },
                              {
                                text: 'Unsubscribe',
                                style: 'destructive',
                                onPress: async () => {
                                  setBusy(`unsub-${product.id}`);
                                  try {
                                    await mutations.unsubscribe(product.id);
                                    await afterMutation(`Unsubscribed from ${product.name}.`);
                                  } catch (err) {
                                    showError(err, 'Unable to unsubscribe.');
                                  } finally {
                                    setBusy(null);
                                  }
                                },
                              },
                            ]);
                          }}
                        />
                      </View>
                    )}
                    {showPlans ? (
                      <Pressable
                        onPress={() => setPlanOpen((current) => ({ ...current, [product.id]: false }))}
                        hitSlop={8}
                      >
                        <Text style={styles.clearLink}>Hide plans</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}

          {subscriptionByProduct.size > 1 ? (
            <FormSection
              title="Pay together"
              subtitle="Select items to pay now, like a cart. Each product keeps its own due date."
            >
              <View style={styles.checkList}>
              {[...subscriptionByProduct.values()].map((item) => {
                const selected = selectedPay.includes(item.product_code);
                return (
                  <Pressable
                    key={item.product_code}
                    onPress={() =>
                      setSelectedPay((current) =>
                        current.includes(item.product_code)
                          ? current.filter((id) => id !== item.product_code)
                          : [...current, item.product_code],
                      )
                    }
                    style={[styles.checkRow, selected && styles.checkRowOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Feather
                      name={selected ? 'check-square' : 'square'}
                      size={22}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                    <View style={styles.checkCopy}>
                      <Text style={styles.label}>{getProductName(item.product_code)}</Text>
                      <Text style={styles.meta}>
                        Due {formatDate(subscriptionDueAt(item))} ·{' '}
                        {formatInrFromPaise(
                          estimateProductTotalPaise(
                            item,
                            catalogPlans.find((plan) => plan.plan_code === item.plan_code),
                            catalogAddons,
                          ),
                        ) ?? '—'}
                        /{item.billing_interval === 'yearly' ? 'year' : 'month'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              </View>
              <Button
                label={selectedPay.length ? `Pay ${selectedPay.length} selected with UPI` : 'Pay selected with UPI'}
                icon="credit-card"
                disabled={selectedPay.length === 0}
                fullWidth
                onPress={() => {
                  const items = selectedPay.flatMap((productId) => {
                    const subscription = subscriptionByProduct.get(productId);
                    const productPlans = plansByProduct.get(productId) ?? [];
                    const planCode =
                      pendingPlanByProduct[productId] || subscription?.plan_code || getRecommendedPlanCode(productPlans);
                    if (!planCode) return [];
                    return [
                      {
                        productCode: productId,
                        planCode,
                        extraStaff: productId === billingFocus ? extraStaff : subscription?.extra_staff ?? 0,
                        extraOffices: productId === billingFocus ? extraOffices : subscription?.extra_offices ?? 0,
                        petsPackEnabled:
                          productId === 'shopie'
                            ? productId === billingFocus
                              ? petsPackEnabled
                              : Boolean(subscription?.pets_pack_enabled)
                            : false,
                      },
                    ];
                  });
                  if (items.length === 0) {
                    showError(new Error('Choose a plan first.'), 'Choose a plan first.');
                    return;
                  }
                  setUpiPayRequest({ items, mode: 'renew', autoStart: true });
                }}
              />
            </FormSection>
          ) : null}

          {unsubscribedProducts.length > 0 ? (
            <FormSection title="Add a product" subtitle="Start a trial or pay now. This bill stays separate from products you already have.">
              {unsubscribedProducts.map((product, index) => {
                const productPlans = plansByProduct.get(product.id) ?? [];
                const selectedPlanCode = pendingPlanByProduct[product.id] || getRecommendedPlanCode(productPlans);
                const selectedTitle = formatPlanDisplayName(
                  productPlans.find((plan) => plan.code === selectedPlanCode)?.name,
                  selectedPlanCode,
                );
                return (
                  <View key={product.id} style={[styles.addProduct, index > 0 && styles.addProductDivider]}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.meta}>{product.description}</Text>
                    <View style={styles.planGrid}>
                      {productPlans.map((plan) => {
                        const catalog = catalogPlans.find((item) => item.plan_code === plan.code);
                        const selected = selectedPlanCode === plan.code;
                        const price = formatInrFromPaise(catalog?.amount_paise);
                        return (
                          <Pressable
                            key={plan.code}
                            onPress={() => setPendingPlanByProduct((current) => ({ ...current, [product.id]: plan.code }))}
                            style={[styles.planCard, selected ? styles.planCardSelected : null]}
                          >
                            <Text style={styles.planName}>
                              {formatPlanDisplayName(catalog?.name ?? plan.name, plan.code)}
                            </Text>
                            <Text style={styles.planPrice}>{price ? `${price}/month` : 'Trial first'}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Button
                      label={`Start ${selectedTitle} trial`}
                      loading={busy === `sub-${product.id}`}
                      fullWidth
                      onPress={async () => {
                        if (!selectedPlanCode) {
                          showError(new Error('Select a plan first.'), 'Select a plan first.');
                          return;
                        }
                        setBusy(`sub-${product.id}`);
                        try {
                          await mutations.subscribe(product.id, selectedPlanCode, subscribedProducts.length === 0);
                          await afterMutation(`Subscribed to ${product.name}.`);
                        } catch (err) {
                          showError(err, 'Unable to subscribe to product.');
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                    <Button
                      label="Pay to start"
                      variant="outline"
                      icon="credit-card"
                      fullWidth
                      onPress={() => {
                        if (!selectedPlanCode) {
                          showError(new Error('Select a plan first.'), 'Select a plan first.');
                          return;
                        }
                        const plan = productPlans.find((item) => item.code === selectedPlanCode);
                        setUpiPayRequest({
                          productCode: product.id,
                          planCode: selectedPlanCode,
                          productName: product.name,
                          planName: formatPlanDisplayName(plan?.name, selectedPlanCode),
                          extraStaff: 0,
                          extraOffices: 0,
                          petsPackEnabled: false,
                          mode: 'subscribe',
                        });
                      }}
                    />
                  </View>
                );
              })}
            </FormSection>
          ) : null}

          <FormSection
            title="Staff & add-ons"
            subtitle="Your plan includes a set number of people and locations. Add more only if you need them."
          >
            {subscribedProducts.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroller}>
                {subscribedProducts.map((product) => (
                  <Chip
                    key={product.id}
                    label={product.name}
                    active={billingFocus === product.id}
                    onPress={() => setBillingFocus(product.id)}
                  />
                ))}
              </ScrollView>
            ) : null}
            {snapshot && subscribedProducts.length > 0 ? (
              <View style={styles.stackTight}>
                <View style={styles.usageHero}>
                  <Text style={styles.kicker}>
                    {getProductName(snapshot.product_code || checkoutProductCode)} ·{' '}
                    {formatPlanDisplayName(undefined, snapshot.plan_code)}
                  </Text>
                  <Text style={styles.amountHero}>
                    {formatInrFromPaise(snapshot.pricing.total_amount_paise) ?? '—'}
                    <Text style={styles.amountPeriod}>
                      /{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}
                    </Text>
                  </Text>
                  <Text style={styles.meta}>
                    {snapshot.pending_upi_claim
                      ? 'Payment received — waiting for IE to confirm (usually same day).'
                      : snapshot.soft_locked
                        ? 'Locked until you pay this product. We do not charge automatically.'
                        : snapshot.status === 'trialing'
                          ? `This product's trial ends ${formatDate(snapshot.trial_ends_at)}.`
                          : `Next payment due ${formatDate(snapshot.renews_at ?? snapshot.current_period_ends_at)}.`}
                  </Text>
                </View>
                <UsageMeter
                  label="Staff in use"
                  used={snapshot.used_staff}
                  max={snapshot.effective_max_staff}
                  hint={`${snapshot.included_staff} included in this plan${snapshot.extra_staff ? ` · ${snapshot.extra_staff} extra` : ''}`}
                />
                <UsageMeter
                  label="Offices in use"
                  used={snapshot.used_offices}
                  max={snapshot.effective_max_branches}
                  hint={`${snapshot.included_offices} included in this plan${snapshot.extra_offices ? ` · ${snapshot.extra_offices} extra` : ''}`}
                />
                {starterAddonCapHint(snapshot.max_extra_staff, snapshot.max_extra_offices) ? (
                  <Text style={styles.meta}>
                    {starterAddonCapHint(snapshot.max_extra_staff, snapshot.max_extra_offices)}
                  </Text>
                ) : null}
                <AddonStepper
                  label="Extra staff"
                  hint={`${formatInrFromPaise(snapshot.pricing.addon_staff_unit_paise) ?? '₹199'} each / month`}
                  value={extraStaff}
                  onChange={setExtraStaff}
                  disabled={snapshot.soft_locked}
                  max={allowedExtraCount(snapshot.max_extra_staff, snapshot.extra_staff ?? 0)}
                />
                <AddonStepper
                  label="Extra offices"
                  hint={`${formatInrFromPaise(snapshot.pricing.addon_office_unit_paise) ?? '₹299'} each / month`}
                  value={extraOffices}
                  onChange={setExtraOffices}
                  disabled={snapshot.soft_locked}
                  max={allowedExtraCount(snapshot.max_extra_offices, snapshot.extra_offices ?? 0)}
                />
                {checkoutProductCode === 'shopie' ? (
                  <View style={styles.addonRow}>
                    <View style={styles.checkCopy}>
                      <Text style={styles.label}>Pets pack</Text>
                      <Text style={styles.meta}>
                        {formatInrFromPaise(snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100)} / month
                        · pet profiles and owner alerts
                      </Text>
                    </View>
                    <Switch
                      value={petsPackEnabled}
                      onValueChange={setPetsPackEnabled}
                      disabled={snapshot.soft_locked}
                    />
                  </View>
                ) : null}
                <View style={styles.totalBox}>
                  <Text style={styles.factLabel}>Estimated total</Text>
                  <Text style={styles.amountHero}>
                    {formatInrFromPaise(
                      (snapshot.pricing.base_amount_paise ?? 0) +
                        extraStaff * (snapshot.pricing.addon_staff_unit_paise ?? 0) +
                        extraOffices * (snapshot.pricing.addon_office_unit_paise ?? 0) +
                        (checkoutProductCode === 'shopie' && petsPackEnabled
                          ? snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100
                          : 0),
                    )}
                    <Text style={styles.amountPeriod}>
                      /{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}
                    </Text>
                  </Text>
                  <Text style={styles.meta}>
                    Plan {formatInrFromPaise(snapshot.pricing.base_amount_paise)}
                    {extraStaff || extraOffices || (checkoutProductCode === 'shopie' && petsPackEnabled)
                      ? ' plus the extras above'
                      : ''}
                    .
                  </Text>
                </View>
                <Button
                  label="Save extras"
                  loading={busy === 'addons'}
                  disabled={snapshot.soft_locked}
                  fullWidth
                  onPress={async () => {
                    setBusy('addons');
                    try {
                      await addons.update(checkoutProductCode, {
                        extra_staff: extraStaff,
                        extra_offices: extraOffices,
                        ...(checkoutProductCode === 'shopie' ? { pets_pack_enabled: petsPackEnabled } : {}),
                      });
                      await afterMutation('Extras saved. Your next total is updated.');
                    } catch (err) {
                      showError(err, 'Unable to save extras. Reduce staff or offices first if you are over the limit.');
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
              </View>
            ) : (
              <Text style={styles.meta}>Subscribe to a product above to see seats and add extras.</Text>
            )}
          </FormSection>

          <FormSection
            title="Reward points"
            subtitle="One customer balance for bookings, online orders, POS, and Books sales."
          >
            {!rewardPointsEntitled ? (
              <View style={styles.notice}>
                <View style={styles.cardHead}>
                  <Text style={[styles.noticeTitle, styles.checkCopy]}>Upgrade your plan above to unlock customer reward points.</Text>
                  <StatusChip label="Pro" tone="warning" />
                </View>
              </View>
            ) : (
              <View style={styles.stackTight}>
                <View style={styles.loyaltyToggleRow}>
                  <View style={styles.checkCopy}>
                    <Text style={styles.label}>Enable for customers</Text>
                    <Text style={styles.meta}>
                      {loyaltyEnabled
                        ? 'Program is visible in the customer app.'
                        : 'Turn on to let customers earn and redeem points.'}
                    </Text>
                  </View>
                  <Switch
                    value={loyaltyEnabled}
                    onValueChange={setLoyaltyEnabled}
                    disabled={!canConfigureLoyalty || loyaltyBusy}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
                <View style={styles.loyaltyExample}>
                  <Text style={styles.kicker}>Example</Text>
                  <Text style={styles.meta}>
                    {Math.max(1, Number(pointsPerUnit) || 10)} points = ₹1 · max{' '}
                    {Math.min(100, Math.max(0, Number(maxRedeemPercent) || 0))}% off · min{' '}
                    {Math.max(0, Number(minRedeemPoints) || 0)} pts · {Math.max(0, Number(earnPointsPer100) || 0)} pts
                    per ₹100 spent
                  </Text>
                </View>
                <View style={styles.loyaltyMetrics}>
                  <LoyaltyMetricRow
                    label="Points per ₹1"
                    hint="How many points equal ₹1 off"
                    value={pointsPerUnit}
                    onChangeText={setPointsPerUnit}
                    unit="pts"
                    editable={canConfigureLoyalty && !loyaltyBusy}
                  />
                  <LoyaltyMetricRow
                    label="Max redeem"
                    hint="Share of price customers can cover"
                    value={maxRedeemPercent}
                    onChangeText={setMaxRedeemPercent}
                    unit="%"
                    editable={canConfigureLoyalty && !loyaltyBusy}
                  />
                  <LoyaltyMetricRow
                    label="Minimum redeem"
                    hint="Smallest redeem amount allowed"
                    value={minRedeemPoints}
                    onChangeText={setMinRedeemPoints}
                    unit="pts"
                    editable={canConfigureLoyalty && !loyaltyBusy}
                  />
                  <LoyaltyMetricRow
                    label="Points per ₹100"
                    hint="Earned on shop orders, POS, and Books sales"
                    value={earnPointsPer100}
                    onChangeText={setEarnPointsPer100}
                    unit="pts"
                    editable={canConfigureLoyalty && !loyaltyBusy}
                    last
                  />
                </View>
                <Button
                  label="Save reward points"
                  loading={loyaltyBusy}
                  disabled={!canConfigureLoyalty}
                  fullWidth
                  onPress={async () => {
                    if (!token || !tenantId || !businessId) return;
                    setLoyaltyBusy(true);
                    try {
                      const client = createScopedClient(token, tenantId, businessId);
                      await client.businesses.patch(businessId, {
                        settings: {
                          loyalty_preferences: {
                            enabled: loyaltyEnabled,
                            points_per_currency_unit: Math.max(1, Number(pointsPerUnit) || 10),
                            max_redeem_percent: Math.min(100, Math.max(0, Number(maxRedeemPercent) || 0)),
                            min_redeem_points: Math.max(0, Number(minRedeemPoints) || 0),
                            earn_points_per_100: Math.max(0, Number(earnPointsPer100) || 0),
                          },
                        },
                      });
                      await refreshWorkspace();
                      toast.push('Reward points settings saved.', 'success');
                    } catch (err) {
                      showError(err, 'Unable to save reward points settings.');
                    } finally {
                      setLoyaltyBusy(false);
                    }
                  }}
                />
              </View>
            )}
          </FormSection>
        </View>
      )}

      <FilterSheet
        visible={filtersOpen}
        title="Order filters"
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setOrderStatus('all');
          setOrderRange('all');
          setOrderProduct('');
        }}
      >
        <FilterChoiceGroup
          label="Status"
          value={orderStatus}
          options={ORDER_STATUS_FILTERS.map((item) => ({
            value: item.id,
            label: orderCounts[item.id] ? `${item.label} (${orderCounts[item.id]})` : item.label,
          }))}
          onChange={(value) => setOrderStatus(value as OrderHistoryStatusFilter)}
        />
        <FilterChoiceGroup
          label="Date"
          value={orderRange}
          options={ORDER_RANGE_FILTERS.map((item) => ({ value: item.id, label: item.label }))}
          onChange={(value) => setOrderRange(value as OrderHistoryRange)}
        />
        <FilterChoiceGroup
          label="Product"
          value={orderProduct}
          options={[
            { value: '', label: 'All products' },
            ...PRODUCT_CATALOG.map((product) => ({ value: product.id, label: product.name })),
          ]}
          onChange={setOrderProduct}
        />
      </FilterSheet>

      <Modal
        visible={Boolean(proofPreviewUrl)}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setProofPreviewUrl(null)}
      >
        <Pressable style={styles.proofOverlay} onPress={() => setProofPreviewUrl(null)}>
          <Pressable style={styles.proofSheet} onPress={(event) => event.stopPropagation?.()}>
            <View style={styles.proofHeader}>
              <Text style={styles.proofTitle}>Payment screenshot</Text>
              <Pressable onPress={() => setProofPreviewUrl(null)} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            {proofPreviewUrl ? (
              proofFailed ? (
                <Text style={styles.proofError}>Couldn’t load this screenshot. The file may have been removed.</Text>
              ) : !proofNatural ? null : Platform.OS === 'web' ? (
                React.createElement('img', {
                  src: proofPreviewUrl,
                  alt: 'Payment screenshot',
                  onError: () => setProofFailed(true),
                  style: {
                    width: proofSize.width,
                    height: proofSize.height,
                    objectFit: 'contain',
                    borderRadius: 12,
                    backgroundColor: colors.muted,
                    display: 'block',
                  },
                })
              ) : (
                <Image
                  source={{ uri: proofPreviewUrl }}
                  style={[styles.proofImage, proofSize]}
                  resizeMode="contain"
                  onError={() => setProofFailed(true)}
                />
              )
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </FormScreen>
  );
}

function usagePercent(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function UsageMeter({
  label,
  used,
  max,
  hint,
}: {
  label: string;
  used: number;
  max: number;
  hint: string;
}) {
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.meterCount}>
          {used} of {max}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${usagePercent(used, max)}%` as `${number}%` }]} />
      </View>
      <Text style={styles.meta}>{hint}</Text>
    </View>
  );
}

function AddonStepper({
  label,
  hint,
  value,
  onChange,
  disabled,
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  max?: number | null;
}) {
  const plusDisabled = Boolean(disabled) || (max != null && value >= max);
  return (
    <View style={styles.addonRow}>
      <View style={styles.checkCopy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.meta}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value <= 0}
          style={[styles.stepperBtn, (disabled || value <= 0) && styles.stepperBtnOff]}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(value + 1)}
          disabled={plusDisabled}
          style={[styles.stepperBtn, plusDisabled && styles.stepperBtnOff]}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LoyaltyMetricRow({
  label,
  hint,
  value,
  onChangeText,
  unit,
  editable = true,
  last = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (value: string) => void;
  unit: string;
  editable?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.loyaltyMetricRow, last && styles.loyaltyMetricRowLast]}>
      <View style={styles.loyaltyMetricCopy}>
        <Text style={styles.loyaltyMetricLabel}>{label}</Text>
        <Text style={styles.loyaltyMetricHint}>{hint}</Text>
      </View>
      <View style={[styles.loyaltyMetricControl, !editable && styles.loyaltyMetricControlDisabled]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          editable={editable}
          style={styles.loyaltyMetricInput}
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.loyaltyMetricUnit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  stackTight: { gap: spacing.md },
  meta: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  label: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  kicker: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  segmentBtnOn: { backgroundColor: colors.card },
  segmentText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  segmentTextOn: { color: colors.foreground },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeOn: { backgroundColor: colors.secondary },
  segmentBadgeText: { ...typography.tiny, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  segmentBadgeTextOn: { color: colors.primary },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchFlex: { flex: 1 },
  chipScroller: { gap: spacing.sm, paddingRight: spacing.sm },
  clearLink: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  historyCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyCount: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  historyGroup: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  historyRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  historyCopy: { flex: 1, minWidth: 0, paddingTop: 2 },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  historyType: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  historyTime: { ...typography.caption, color: colors.mutedForeground },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historySubject: {
    flex: 1,
    ...typography.body,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    fontSize: 15,
  },
  historyAmount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  historyBody: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, lineHeight: 18 },
  historyAction: { color: colors.primary, fontSize: 13, fontFamily: fonts.bodySemi, marginTop: 8 },
  proofOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  proofSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  proofTitle: { ...typography.label, color: colors.foreground, flex: 1 },
  proofImage: {
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignSelf: 'center',
  },
  proofError: { ...typography.body, color: colors.mutedForeground, paddingVertical: spacing.md },
  cardStack: { gap: spacing.md },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeadCopy: { flex: 1, gap: 4, minWidth: 0 },
  productName: { ...typography.title, color: colors.foreground },
  planLine: { ...typography.caption, color: colors.mutedForeground },
  amountHero: { ...typography.title, fontFamily: fonts.displayMedium, color: colors.foreground },
  amountPeriod: { ...typography.body, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, rowGap: spacing.lg },
  factCell: { width: '47%', flexGrow: 1, gap: 4 },
  factLabel: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  factValue: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  cardPaid: { borderColor: '#A7F3D0' },
  cardReview: { borderColor: '#FDBA74' },
  cardDanger: { borderColor: '#FECACA' },
  tracker: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    gap: 2,
  },
  trackerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  trackerDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerDotDone: { backgroundColor: colors.success },
  trackerDotCurrent: { backgroundColor: colors.primary },
  trackerDotText: { ...typography.tiny, fontFamily: fonts.bodySemi, color: colors.mutedForeground, fontSize: 10 },
  trackerDotTextCurrent: { color: colors.primaryForeground },
  trackerLine: {
    width: 2,
    height: 12,
    marginLeft: 8,
    backgroundColor: colors.border,
  },
  trackerLineDone: { backgroundColor: colors.success },
  trackerText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  trackerTextDone: { color: colors.success, fontFamily: fonts.bodySemi },
  trackerTextCurrent: { color: colors.primary, fontFamily: fonts.bodySemi },
  notice: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: colors.warningSoft,
    gap: spacing.sm,
  },
  noticeDanger: { borderColor: '#FECACA', backgroundColor: colors.destructiveSoft },
  noticeTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: '#9A3412' },
  noticeTitleDanger: { color: '#991B1B' },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  planCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 4,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.secondary,
  },
  planBadge: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planName: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  planPrice: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  checkList: { gap: spacing.md },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  checkRowOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  checkCopy: { flex: 1, gap: 4, minWidth: 0 },
  addProduct: { gap: spacing.md },
  addProductDivider: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  usageHero: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    gap: spacing.xs,
  },
  meter: { gap: 6 },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meterCount: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  meterTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  stepperBtnOff: { opacity: 0.45 },
  stepperBtnText: { ...typography.title, color: colors.foreground, lineHeight: 22 },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
    ...typography.body,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
  },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    maxWidth: 160,
  },
  chipSuccess: { backgroundColor: colors.successSoft },
  chipWarning: { backgroundColor: colors.warningSoft },
  chipInfo: { backgroundColor: colors.secondary },
  chipDanger: { backgroundColor: colors.destructiveSoft },
  chipText: { ...typography.tiny, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  chipTextSuccess: { color: '#047857' },
  chipTextWarning: { color: '#B45309' },
  chipTextInfo: { color: colors.primary },
  chipTextDanger: { color: '#B91C1C' },
  loyaltyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  loyaltyExample: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    gap: 4,
  },
  loyaltyMetrics: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  loyaltyMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loyaltyMetricRowLast: { borderBottomWidth: 0 },
  loyaltyMetricCopy: { flex: 1, gap: 2, minWidth: 0 },
  loyaltyMetricLabel: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  loyaltyMetricHint: { ...typography.caption, color: colors.mutedForeground },
  loyaltyMetricControl: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 96,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    gap: 4,
  },
  loyaltyMetricControlDisabled: { opacity: 0.6 },
  loyaltyMetricInput: {
    flex: 1,
    ...typography.body,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    textAlign: 'right',
    paddingVertical: 0,
    minWidth: 40,
  },
  loyaltyMetricUnit: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'lowercase',
  },
});
