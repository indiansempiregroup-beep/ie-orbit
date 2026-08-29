import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { BillingPlanCatalogItem, BusinessProductSubscription } from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { createScopedClient, opsClient } from '../../api/client';
import { SoftLockBanner, PENDING_UPI_CLAIM_KEY } from '../../components/SoftLockBanner';
import { setPersistentItem } from '../../utils/persistentStore';
import {
  SubscriptionUpiPaySheet,
  type SubscriptionUpiPayRequest,
} from './SubscriptionUpiPaySheet';
import {
  useBusinessBillingSnapshot,
  useProductMutations,
  useProductPlans,
  useTenantSettings,
  useUpdateBusinessAddons,
} from '../../hooks/useOpsExtended';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDate, getApiErrorMessage } from '../../utils/format';
import { isLoyaltyEntitled, readLoyaltyPrefs as parseLoyaltyPrefs } from '../../utils/loyalty';
import {
  formatInrFromPaise,
  formatPlanDisplayName,
  getProductName,
  getRecommendedPlanCode,
  getSubscribedProducts,
  isRecommendedPlanCode,
  PETS_PACK_PRICE_INR,
  PRODUCT_CATALOG,
} from '../../utils/products';

function StatusChip({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'success' | 'warning' | 'info' }) {
  return (
    <View style={[styles.chip, tone === 'success' && styles.chipSuccess, tone === 'warning' && styles.chipWarning, tone === 'info' && styles.chipInfo]}>
      <Text
        style={[
          styles.chipText,
          tone === 'success' && styles.chipTextSuccess,
          tone === 'warning' && styles.chipTextWarning,
          tone === 'info' && styles.chipTextInfo,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function subscriptionTone(status?: string | null): 'muted' | 'success' | 'warning' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'trialing') return 'warning';
  if (status === 'soft_locked') return 'warning';
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

function ProductCycleDates({
  subscription,
  amountLabel,
}: {
  subscription: BusinessProductSubscription;
  amountLabel?: string | null;
}) {
  const isTrial = subscription.status === 'trialing';
  const due = subscription.current_period_ends_at;
  return (
    <View style={styles.cycleBox}>
      <View style={styles.cycleGrid}>
        <View style={styles.cycleCell}>
          <Text style={styles.cycleLabel}>Started</Text>
          <Text style={styles.cycleValue}>{formatDate(subscription.subscribed_at)}</Text>
        </View>
        {isTrial ? (
          <View style={styles.cycleCell}>
            <Text style={styles.cycleLabel}>Trial ends</Text>
            <Text style={styles.cycleValue}>{formatDate(subscription.trial_ends_at)}</Text>
          </View>
        ) : (
          <View style={styles.cycleCell}>
            <Text style={styles.cycleLabel}>This period</Text>
            <Text style={styles.cycleValue}>
              {formatDate(subscription.current_period_starts_at)} – {formatDate(due)}
            </Text>
          </View>
        )}
        <View style={styles.cycleCell}>
          <Text style={styles.cycleLabel}>{isTrial ? 'Pay by' : 'Renews on'}</Text>
          <Text style={styles.cycleValue}>{formatDate(isTrial ? subscription.trial_ends_at : due)}</Text>
        </View>
        {amountLabel ? (
          <View style={styles.cycleCell}>
            <Text style={styles.cycleLabel}>This product</Text>
            <Text style={styles.cycleValue}>{amountLabel}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cycleNote}>
        Billed on its own cycle{subscription.billing_interval ? ` · ${subscription.billing_interval}` : ''}.
        We do not auto-charge{isTrial ? ' after the trial.' : '.'} Pay this product by the date above to keep it
        unlocked.
      </Text>
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
  const [lockBannerKey, setLockBannerKey] = useState(0);

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
    if (!snapshot.soft_locked) {
      void setPersistentItem(PENDING_UPI_CLAIM_KEY, null);
    }
  }, [snapshot?.extra_staff, snapshot?.extra_offices, snapshot?.pets_pack_enabled, snapshot?.soft_locked]);

  if (loading && !settings) {
    return (
      <DesktopPage>
        <ScreenState loading />
      </DesktopPage>
    );
  }

  async function afterMutation(successMessage: string) {
    await Promise.all([refreshWorkspace(), reloadSnapshot()]);
    toast.push(successMessage, 'success');
  }

  function showError(err: unknown, fallback: string) {
    toast.push(getApiErrorMessage(err, fallback), 'error');
  }

  const checkoutProductCode = billingFocus || subscribedProducts[0]?.id || 'appointie';
  const scopedClient =
    token && tenantId && businessId ? createScopedClient(token, tenantId, businessId) : null;

  return (
    <DesktopPage>
    <RefreshableScrollView
      contentContainerStyle={styles.wrap}
      onRefresh={async () => {
        await Promise.all([refreshWorkspace(), reloadSnapshot()]);
      }}
    >
      <SoftLockBanner key={lockBannerKey} />

      {upiPayRequest && scopedClient && token && tenantId && businessId ? (
        <SubscriptionUpiPaySheet
          client={scopedClient}
          token={token}
          tenantId={tenantId}
          businessId={businessId}
          request={upiPayRequest}
          onClose={() => setUpiPayRequest(null)}
          onClaimed={async () => {
            await setPersistentItem(PENDING_UPI_CLAIM_KEY, '1');
            await Promise.all([refreshWorkspace(), reloadSnapshot()]);
            setLockBannerKey((value) => value + 1);
            toast.push('Payment submitted. Waiting for platform confirmation.', 'success');
          }}
          onError={(message) => toast.push(message, 'error')}
        />
      ) : null}

      <Card>
        <SectionHeader title="Products & billing" />
        <Text style={styles.meta}>
          Subscribe to Orbit Appoint, Orbit Mart, or both. Each product has its own bill and due date. If you
          start them on different days, you pay them on different days — we never merge them into one charge.
        </Text>
        {PRODUCT_CATALOG.map((product, index) => {
          const subscription = subscriptionByProduct.get(product.id);
          const productPlans = plansByProduct.get(product.id) ?? [];
          const selectedPlanCode =
            pendingPlanByProduct[product.id] ||
            subscription?.plan_code ||
            getRecommendedPlanCode(productPlans);
          const isSubscribed = Boolean(subscription);
          const isSoftLocked = subscription?.status === 'soft_locked';
          const pendingPlanCode = subscription?.pending_cancel
            ? 'canceled'
            : subscription?.pending_plan_code ?? null;
          const selectedTitle = formatPlanDisplayName(
            productPlans.find((plan) => plan.code === selectedPlanCode)?.name,
            selectedPlanCode,
          );
          return (
            <View key={product.id} style={[styles.productBlock, index === 0 && styles.productBlockFirst]}>
              <View style={styles.productHeader}>
                <Text style={styles.productName}>{product.name}</Text>
                <View style={styles.chipRow}>
                  <StatusChip
                    label={
                      isSoftLocked
                        ? 'Locked'
                        : subscription?.status === 'trialing'
                          ? 'Trial'
                          : isSubscribed
                            ? 'Your plan'
                            : 'Not subscribed'
                    }
                    tone={isSubscribed ? subscriptionTone(subscription?.status) : 'muted'}
                  />
                  {subscription?.plan_code ? (
                    <StatusChip
                      label={formatPlanDisplayName(subscription.plan_name, subscription.plan_code)}
                      tone="info"
                    />
                  ) : null}
                </View>
              </View>
              <Text style={styles.meta}>{product.description}</Text>
              {subscription ? (
                <ProductCycleDates
                  subscription={subscription}
                  amountLabel={`${formatInrFromPaise(
                    estimateProductTotalPaise(
                      subscription,
                      catalogPlans.find((item) => item.plan_code === subscription.plan_code),
                      catalogAddons,
                    ),
                  ) ?? '—'}/${subscription.billing_interval === 'yearly' ? 'year' : 'month'}`}
                />
              ) : (
                <Text style={styles.meta}>
                  Trial starts the day you subscribe. After that, this product renews on its own 30-day cycle.
                </Text>
              )}
              {pendingPlanCode ? (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingTitle}>
                    {pendingPlanCode === 'canceled'
                      ? 'Cancellation scheduled'
                      : `${formatPlanDisplayName(subscription?.plan_name, subscription?.plan_code)} until ${formatDate(
                          subscription?.current_period_ends_at,
                        )}, then ${formatPlanDisplayName(subscription?.pending_plan_name, pendingPlanCode)}`}
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
              {isSoftLocked ? (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingTitle}>Upgrade to unlock</Text>
                  <Text style={styles.meta}>New bookings, staff, and offices stay locked until you upgrade.</Text>
                </View>
              ) : null}
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
                      <Text style={styles.productName}>{formatPlanDisplayName(catalog?.name ?? plan.name, plan.code)}</Text>
                      <Text style={styles.planPrice}>{price ? `${price}/month` : 'Trial first'}</Text>
                      <Text style={styles.meta}>
                        {catalog?.max_staff ?? plan.max_staff ?? 1} staff · {catalog?.max_branches ?? plan.max_branches ?? 1}{' '}
                        office{(catalog?.max_branches ?? plan.max_branches ?? 1) === 1 ? '' : 's'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.stack}>
                {isSubscribed ? (
                  <>
                    <Button
                      label={
                        selectedPlanCode === subscription?.plan_code
                          ? 'Current plan'
                          : isSoftLocked
                            ? `Upgrade to ${selectedTitle}`
                            : `Switch to ${selectedTitle}`
                      }
                      loading={busy === `plan-${product.id}`}
                      disabled={selectedPlanCode === subscription?.plan_code || selectedPlanCode === pendingPlanCode}
                      fullWidth
                      onPress={() => {
                        const runChange = async () => {
                          setBusy(`plan-${product.id}`);
                          try {
                            await mutations.changePlan(product.id, selectedPlanCode);
                            await afterMutation(
                              selectedPlanCode.includes('starter') && (subscription?.plan_code ?? '').includes('pro')
                                ? `${product.name} will switch to ${selectedTitle} at period end.`
                                : `${product.name} is now on ${selectedTitle}.`,
                            );
                          } catch (err) {
                            showError(err, 'Unable to change plan. Check staff and office limits.');
                          } finally {
                            setBusy(null);
                          }
                        };
                        if ((subscription?.plan_code ?? '').includes('pro') && selectedPlanCode.includes('starter')) {
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
                      label="Pay with UPI to update"
                      variant="outline"
                      fullWidth
                      onPress={() => {
                        const plan = productPlans.find((item) => item.code === selectedPlanCode);
                        setBillingFocus(product.id);
                        setUpiPayRequest({
                          productCode: product.id,
                          planCode: selectedPlanCode,
                          productName: product.name,
                          planName: formatPlanDisplayName(plan?.name, selectedPlanCode),
                          extraStaff,
                          extraOffices,
                          petsPackEnabled: product.id === 'shopie' ? petsPackEnabled : false,
                          mode: 'change_plan',
                        });
                      }}
                    />
                    <Button
                      label="Unsubscribe"
                      variant="outline"
                      loading={busy === `unsub-${product.id}`}
                      fullWidth
                      onPress={() => {
                        Alert.alert(
                          `Unsubscribe ${product.name}?`,
                          'Billing for this product stops immediately.',
                          [
                            { text: 'Cancel', style: 'cancel' },
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
                          ],
                        );
                      }}
                    />
                  </>
                ) : (
                  <>
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
                      label="Pay with UPI to subscribe"
                      variant="outline"
                      fullWidth
                      onPress={() => {
                        if (!selectedPlanCode) {
                          showError(new Error('Select a plan first.'), 'Select a plan first.');
                          return;
                        }
                        const plan = productPlans.find((item) => item.code === selectedPlanCode);
                        setBillingFocus(product.id);
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
                  </>
                )}
              </View>
            </View>
          );
        })}
        {subscriptionByProduct.size > 1 ? (
          <View style={styles.splitBill}>
            <Text style={styles.splitBillTitle}>Two products, two bills</Text>
            {[...subscriptionByProduct.values()].map((item) => (
              <Text key={item.product_code} style={styles.splitBillRow}>
                {getProductName(item.product_code)} · {item.status === 'trialing' ? 'trial ends' : 'pay by'}{' '}
                {formatDate(item.status === 'trialing' ? item.trial_ends_at : item.current_period_ends_at)} ·{' '}
                {formatInrFromPaise(
                  estimateProductTotalPaise(
                    item,
                    catalogPlans.find((plan) => plan.plan_code === item.plan_code),
                    catalogAddons,
                  ),
                ) ?? '—'}
                /{item.billing_interval === 'yearly' ? 'year' : 'month'}
              </Text>
            ))}
            <Text style={styles.cycleNote}>
              Pay each product on its own date. A late Orbit Mart payment does not lock Orbit Appoint, and the reverse.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title="Staff, offices & add-ons" />
        <Text style={styles.meta}>
          Your plan includes a set number of people and locations. Add more only if you need them.
        </Text>
        {subscribedProducts.length > 1 ? (
          <View style={styles.productSwitch}>
            {subscribedProducts.map((product) => (
              <Pressable
                key={product.id}
                onPress={() => setBillingFocus(product.id)}
                style={[styles.productSwitchChip, billingFocus === product.id && styles.productSwitchChipOn]}
              >
                <Text style={[styles.productSwitchText, billingFocus === product.id && styles.productSwitchTextOn]}>
                  {product.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {snapshot && subscribedProducts.length > 0 ? (
          <View style={styles.stack}>
            <View style={styles.usageHero}>
              <View>
                <Text style={styles.usageHeroKicker}>
                  {getProductName(snapshot.product_code || checkoutProductCode)} ·{' '}
                  {formatPlanDisplayName(undefined, snapshot.plan_code)}
                </Text>
                <Text style={styles.usageHeroTitle}>
                  {formatInrFromPaise(snapshot.pricing.total_amount_paise) ?? '—'}
                  <Text style={styles.usageHeroPeriod}>
                    /{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}
                  </Text>
                </Text>
                <Text style={styles.meta}>
                  {snapshot.soft_locked
                    ? 'Locked until you upgrade or renew.'
                    : snapshot.status === 'trialing'
                      ? `This product's trial ends ${formatDate(snapshot.trial_ends_at)}. Pay it separately — we do not charge automatically.`
                      : `This product renews ${formatDate(snapshot.renews_at ?? snapshot.current_period_ends_at)}. Other products keep their own due date.`}
                </Text>
              </View>
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

            <Text style={styles.addonSectionTitle}>Need more?</Text>
            <AddonStepper
              label="Extra staff"
              hint={`${formatInrFromPaise(snapshot.pricing.addon_staff_unit_paise) ?? '₹199'} each / month`}
              value={extraStaff}
              onChange={setExtraStaff}
              disabled={snapshot.soft_locked}
            />
            <AddonStepper
              label="Extra offices"
              hint={`${formatInrFromPaise(snapshot.pricing.addon_office_unit_paise) ?? '₹299'} each / month`}
              value={extraOffices}
              onChange={setExtraOffices}
              disabled={snapshot.soft_locked}
            />
            {checkoutProductCode === 'shopie' ? (
              <View style={styles.addonRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.label}>Pets pack</Text>
                  <Text style={styles.meta}>
                    {formatInrFromPaise(snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100)} / month ·
                    pet profiles and owner alerts
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
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>
                {formatInrFromPaise(
                  (snapshot.pricing.base_amount_paise ?? 0) +
                    extraStaff * (snapshot.pricing.addon_staff_unit_paise ?? 0) +
                    extraOffices * (snapshot.pricing.addon_office_unit_paise ?? 0) +
                    (checkoutProductCode === 'shopie' && petsPackEnabled
                      ? snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100
                      : 0),
                )}
                <Text style={styles.usageHeroPeriod}>/{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}</Text>
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
            <Button
              label="Pay this total with UPI"
              variant="outline"
              disabled={snapshot.soft_locked === false && snapshot.status === 'canceled'}
              fullWidth
              onPress={() => {
                const planCode =
                  snapshot.plan_code ||
                  subscriptionByProduct.get(checkoutProductCode)?.plan_code ||
                  getRecommendedPlanCode(plansByProduct.get(checkoutProductCode) ?? []);
                if (!planCode) {
                  showError(new Error('No plan selected.'), 'Choose a plan above first.');
                  return;
                }
                setUpiPayRequest({
                  productCode: checkoutProductCode,
                  planCode,
                  productName: getProductName(checkoutProductCode),
                  planName: formatPlanDisplayName(undefined, planCode),
                  extraStaff,
                  extraOffices,
                  petsPackEnabled: checkoutProductCode === 'shopie' ? petsPackEnabled : false,
                  mode: 'addons',
                  autoStart: true,
                });
              }}
            />
          </View>
        ) : (
          <Text style={styles.meta}>Subscribe to a product above to see seats and add extras.</Text>
        )}
      </Card>

      <Card>
        <View style={styles.loyaltyHeader}>
          <View style={styles.loyaltyHeaderCopy}>
            <Text style={styles.loyaltyTitle}>Reward points</Text>
            <Text style={styles.meta}>
              One customer balance for bookings, online orders, POS, and Books sales.
            </Text>
          </View>
          {rewardPointsEntitled ? (
            <StatusChip label={loyaltyEnabled ? 'On' : 'Off'} tone={loyaltyEnabled ? 'success' : 'muted'} />
          ) : (
            <StatusChip label="Pro" tone="warning" />
          )}
        </View>

        {!rewardPointsEntitled ? (
          <View style={styles.loyaltyNotice}>
            <Text style={styles.loyaltyNoticeTitle}>Plan upgrade required</Text>
            <Text style={styles.meta}>Upgrade your plan above to unlock customer reward points.</Text>
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.loyaltyToggleRow}>
              <View style={styles.loyaltyToggleCopy}>
                <Text style={styles.loyaltyToggleTitle}>Enable for customers</Text>
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
              <Text style={styles.loyaltyExampleLabel}>Example</Text>
              <Text style={styles.loyaltyExampleText}>
                {Math.max(1, Number(pointsPerUnit) || 10)} points = ₹1 · max {Math.min(100, Math.max(0, Number(maxRedeemPercent) || 0))}% off
                · min {Math.max(0, Number(minRedeemPoints) || 0)} pts · {Math.max(0, Number(earnPointsPer100) || 0)} pts per ₹100 spent
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
      </Card>

    </RefreshableScrollView>
    </DesktopPage>
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
        <View style={[styles.meterFill, { width: `${usagePercent(used, max)}%` }]} />
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
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.addonRow}>
      <View style={{ flex: 1, gap: 2 }}>
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
          disabled={disabled}
          style={[styles.stepperBtn, disabled && styles.stepperBtnOff]}
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
  wrap: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  stack: { gap: spacing.lg },
  meta: { ...typography.body, color: colors.mutedForeground },
  label: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  productBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  productBlockFirst: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  productName: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground, flex: 1 },
  productSwitch: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  productSwitchChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  productSwitchChipOn: { borderColor: colors.primary, backgroundColor: colors.muted },
  productSwitchText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  productSwitchTextOn: { color: colors.primary },
  usageHero: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    gap: spacing.xs,
  },
  usageHeroKicker: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  usageHeroTitle: { ...typography.title, fontFamily: fonts.displayMedium, color: colors.foreground },
  usageHeroPeriod: { ...typography.body, color: colors.mutedForeground, fontFamily: fonts.bodySemi },
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
  addonSectionTitle: {
    ...typography.body,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    marginTop: spacing.xs,
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
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
  stepperValue: { minWidth: 24, textAlign: 'center', ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  totalBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  totalLabel: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.mutedForeground, textTransform: 'uppercase' },
  totalValue: { ...typography.title, fontFamily: fonts.displayMedium, color: colors.foreground },
  cycleBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    gap: spacing.sm,
  },
  cycleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cycleCell: {
    flexGrow: 1,
    flexBasis: '42%',
    minWidth: 120,
    gap: 2,
  },
  cycleLabel: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cycleValue: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  cycleNote: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  splitBill: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.muted,
    gap: 6,
  },
  splitBillTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  splitBillRow: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
  pendingBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    gap: spacing.sm,
  },
  pendingTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: '#9A3412' },
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
    backgroundColor: colors.muted,
  },
  planBadge: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planPrice: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  chipSuccess: { backgroundColor: '#D1FAE5' },
  chipWarning: { backgroundColor: '#FEF3C7' },
  chipInfo: { backgroundColor: '#DBEAFE' },
  chipText: { ...typography.tiny, fontFamily: fonts.bodySemi, color: colors.mutedForeground, textTransform: 'capitalize' },
  chipTextSuccess: { color: '#047857' },
  chipTextWarning: { color: '#B45309' },
  chipTextInfo: { color: '#1D4ED8' },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  detailList: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  detailListTight: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  detail: {
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground, textAlign: 'right', flexShrink: 1 },
  catalogCard: { opacity: 0.92 },
  catalogRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 2,
  },
  catalogRowFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  catalogName: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  catalogDesc: { ...typography.caption, color: colors.mutedForeground },
  loyaltyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  loyaltyHeaderCopy: { flex: 1, gap: spacing.xs },
  loyaltyTitle: {
    ...typography.title,
    fontFamily: fonts.displayMedium,
    color: colors.foreground,
  },
  loyaltyNotice: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    gap: 4,
  },
  loyaltyNoticeTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: '#92400E' },
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
  loyaltyToggleCopy: { flex: 1, gap: 2 },
  loyaltyToggleTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  loyaltyExample: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    gap: 4,
  },
  loyaltyExampleLabel: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
  },
  loyaltyExampleText: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
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
