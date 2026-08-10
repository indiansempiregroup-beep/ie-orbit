import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { BusinessProductSubscription } from '@ie-platform/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SelectField } from '../../components/SelectField';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Input } from '../../components/ui/Input';
import { createScopedClient } from '../../api/client';
import { SoftLockBanner, PENDING_UPI_CLAIM_KEY } from '../../components/SoftLockBanner';
import { setPersistentItem } from '../../utils/persistentStore';
import {
  SubscriptionUpiPaySheet,
  type SubscriptionUpiPayRequest,
} from './SubscriptionUpiPaySheet';
import {
  useBillingStatus,
  useBusinessBillingSnapshot,
  useProductMutations,
  useProductPlans,
  useTenantSettings,
  useUpdateBusinessAddons,
} from '../../hooks/useOpsExtended';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDate, getApiErrorMessage } from '../../utils/format';
import { getAvailableProducts, getProductName, getSubscribedProducts, PETS_PACK_PRICE_INR, PRODUCT_CATALOG } from '../../utils/products';

function getDefaultPlanCode(plans: { code?: string; is_default?: boolean }[]) {
  return plans.find((plan) => plan.is_default)?.code ?? plans[0]?.code ?? '';
}

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

function readLoyaltyPrefs(business: { settings?: Record<string, unknown> | null } | null | undefined) {
  const raw = business?.settings?.loyalty_preferences;
  const prefs = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: Boolean(prefs.enabled),
    points_per_currency_unit: String(Math.max(1, Number(prefs.points_per_currency_unit ?? 10) || 10)),
    max_redeem_percent: String(Math.min(100, Math.max(0, Number(prefs.max_redeem_percent ?? 50) || 50))),
    min_redeem_points: String(Math.max(0, Number(prefs.min_redeem_points ?? 10) || 10)),
  };
}

export function ProductSettingsScreen() {
  const toast = useToast();
  const { token } = useAuth();
  const { activeBusiness, refreshWorkspace, businessId, tenantId } = useWorkspace();
  const { settings, loading } = useTenantSettings();
  const { status: billing } = useBillingStatus();
  const { billing: snapshot, reload: reloadSnapshot } = useBusinessBillingSnapshot();
  const addons = useUpdateBusinessAddons();
  const { plans } = useProductPlans();
  const mutations = useProductMutations();
  const [extraStaff, setExtraStaff] = useState('0');
  const [extraOffices, setExtraOffices] = useState('0');
  const [petsPackEnabled, setPetsPackEnabled] = useState(false);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [pointsPerUnit, setPointsPerUnit] = useState('10');
  const [maxRedeemPercent, setMaxRedeemPercent] = useState('50');
  const [minRedeemPoints, setMinRedeemPoints] = useState('10');
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);

  const subscribedProducts = useMemo(
    () => getSubscribedProducts(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );
  const availableProducts = useMemo(
    () => getAvailableProducts(activeBusiness?.product_subscriptions),
    [activeBusiness?.product_subscriptions],
  );

  const subscriptionByProduct = useMemo(() => {
    const map = new Map<string, BusinessProductSubscription>();
    activeBusiness?.product_subscriptions?.forEach((subscription) => {
      if (subscription.status === 'trialing' || subscription.status === 'active') {
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

  const [selectedProduct, setSelectedProduct] = useState(activeBusiness?.selected_product ?? subscribedProducts[0]?.id ?? '');
  const [pendingPlanByProduct, setPendingPlanByProduct] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [upiPayRequest, setUpiPayRequest] = useState<SubscriptionUpiPayRequest | null>(null);
  const [lockBannerKey, setLockBannerKey] = useState(0);

  useEffect(() => {
    setSelectedProduct(activeBusiness?.selected_product ?? subscribedProducts[0]?.id ?? '');
  }, [activeBusiness?.selected_product, subscribedProducts]);

  useEffect(() => {
    const prefs = readLoyaltyPrefs(activeBusiness as { settings?: Record<string, unknown> } | null);
    setLoyaltyEnabled(prefs.enabled);
    setPointsPerUnit(prefs.points_per_currency_unit);
    setMaxRedeemPercent(prefs.max_redeem_percent);
    setMinRedeemPoints(prefs.min_redeem_points);
  }, [activeBusiness]);

  const rewardPointsEntitled = Boolean(snapshot?.features?.includes('reward_points'));
  const canConfigureLoyalty = rewardPointsEntitled && !snapshot?.soft_locked;

  useEffect(() => {
    const next: Record<string, string> = {};
    availableProducts.forEach((product) => {
      const productPlans = plansByProduct.get(product.id) ?? [];
      next[product.id] = getDefaultPlanCode(productPlans);
    });
    setPendingPlanByProduct((current) => ({ ...next, ...current }));
  }, [availableProducts, plansByProduct]);

  useEffect(() => {
    if (!snapshot) return;
    setExtraStaff(String(snapshot.extra_staff ?? 0));
    setExtraOffices(String(snapshot.extra_offices ?? 0));
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

  const checkoutProductCode = selectedProduct || subscribedProducts[0]?.id || 'appointie';
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
        <SectionHeader title="Active product" />
        <View style={styles.stack}>
          <SelectField
            label="Selected product"
            value={selectedProduct}
            options={subscribedProducts.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setSelectedProduct}
            placeholder="Choose product"
          />
          <Button
            label="Save active product"
            loading={busy === 'active'}
            fullWidth
            onPress={async () => {
              if (!selectedProduct) return;
              setBusy('active');
              try {
                await mutations.setActiveProduct(selectedProduct);
                await afterMutation(`Active product set to ${getProductName(selectedProduct)}.`);
              } catch (err) {
                showError(err, 'Unable to save product selection.');
              } finally {
                setBusy(null);
              }
            }}
          />
        </View>
        <View style={styles.detailList}>
          <Detail label="Plan" value={settings?.subscription?.plan_name ?? settings?.subscription?.plan ?? '—'} />
          <Detail label="Status" value={settings?.subscription?.status ?? '—'} />
        </View>
      </Card>

      <Card>
        <SectionHeader title="Subscribed products" />
        {subscribedProducts.length === 0 ? (
          <Text style={styles.meta}>No active subscriptions.</Text>
        ) : (
          subscribedProducts.map((product, index) => {
            const subscription = subscriptionByProduct.get(product.id);
            const productPlans = plansByProduct.get(product.id) ?? [];
            const currentPlan = subscription?.plan_code ?? getDefaultPlanCode(productPlans);
            const isActive = activeBusiness?.selected_product === product.id;
            return (
              <View key={product.id} style={[styles.productBlock, index === 0 && styles.productBlockFirst]}>
                <View style={styles.productHeader}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <View style={styles.chipRow}>
                    {isActive ? <StatusChip label="Active" tone="info" /> : null}
                    <StatusChip
                      label={subscription?.status === 'trialing' ? 'Trial' : subscription?.status ?? '—'}
                      tone={subscriptionTone(subscription?.status)}
                    />
                  </View>
                </View>
                <Text style={styles.meta}>
                  {subscription?.plan_name ?? subscription?.plan_code ?? 'Trial'}
                  {subscription?.billing_interval ? ` · ${subscription.billing_interval}` : ''}
                </Text>
                {productPlans.length > 0 ? (
                  <SelectField
                    label="Change plan"
                    value={pendingPlanByProduct[product.id] ?? currentPlan}
                    options={productPlans.map((plan) => ({ value: plan.code, label: plan.name ?? plan.code }))}
                    onChange={(value) => setPendingPlanByProduct((current) => ({ ...current, [product.id]: value }))}
                  />
                ) : null}
                <View style={styles.row}>
                  {productPlans.length > 0 ? (
                    <Button
                      label="Pay & update plan"
                      variant="outline"
                      loading={busy === `plan-${product.id}`}
                      onPress={() => {
                        const planCode = pendingPlanByProduct[product.id] ?? currentPlan;
                        if (!planCode) return;
                        const plan = productPlans.find((item) => item.code === planCode);
                        setUpiPayRequest({
                          productCode: product.id,
                          planCode,
                          productName: product.name,
                          planName: plan?.name ?? planCode,
                          extraStaff: Math.max(0, Number(extraStaff) || 0),
                          extraOffices: Math.max(0, Number(extraOffices) || 0),
                          petsPackEnabled: checkoutProductCode === 'shopie' ? petsPackEnabled : false,
                          mode: 'change_plan',
                        });
                      }}
                    />
                  ) : null}
                  <Button
                    label="Unsubscribe"
                    variant="outline"
                    loading={busy === `unsub-${product.id}`}
                    onPress={async () => {
                      setBusy(`unsub-${product.id}`);
                      try {
                        await mutations.unsubscribe(product.id);
                        await afterMutation(`Unsubscribed from ${product.name}.`);
                      } catch (err) {
                        showError(err, 'Unable to unsubscribe.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  />
                </View>
              </View>
            );
          })
        )}
      </Card>

      {availableProducts.length > 0 ? (
        <Card>
          <SectionHeader title="Add product" />
          <Text style={styles.meta}>Choose a plan to start a trial, or pay with UPI to subscribe immediately.</Text>
          {availableProducts.map((product, index) => {
            const productPlans = plansByProduct.get(product.id) ?? [];
            const planCode =
              pendingPlanByProduct[product.id] ?? getDefaultPlanCode(productPlans);
            const resolvePlanCode = (): string | null => {
              if (planCode) return planCode;
              if (productPlans.length === 0) {
                showError(
                  new Error('Plans still loading.'),
                  'Plans are still loading. Pull to refresh, then try again.',
                );
                return null;
              }
              showError(new Error('Select a plan first.'), 'Select a plan first.');
              return null;
            };
            return (
              <View key={product.id} style={[styles.productBlock, index === 0 && styles.productBlockFirst]}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.meta}>{product.description}</Text>
                {productPlans.length > 0 ? (
                  <SelectField
                    label="Plan"
                    value={planCode}
                    options={productPlans.map((plan) => ({ value: plan.code, label: plan.name ?? plan.code }))}
                    onChange={(value) => setPendingPlanByProduct((current) => ({ ...current, [product.id]: value }))}
                  />
                ) : (
                  <Text style={styles.meta}>Loading plans…</Text>
                )}
                <View style={styles.stack}>
                  <Button
                    label="Start trial"
                    loading={busy === `sub-${product.id}`}
                    fullWidth
                    onPress={async () => {
                      const selectedPlanCode = resolvePlanCode();
                      if (!selectedPlanCode) return;
                      setBusy(`sub-${product.id}`);
                      try {
                        await mutations.subscribe(
                          product.id,
                          selectedPlanCode,
                          subscribedProducts.length === 0,
                        );
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
                    loading={busy === `upi-sub-${product.id}`}
                    fullWidth
                    onPress={() => {
                      const selectedPlanCode = resolvePlanCode();
                      if (!selectedPlanCode) return;
                      const plan = productPlans.find((item) => item.code === selectedPlanCode);
                      setUpiPayRequest({
                        productCode: product.id,
                        planCode: selectedPlanCode,
                        productName: product.name,
                        planName: plan?.name ?? selectedPlanCode,
                        extraStaff: 0,
                        extraOffices: 0,
                        petsPackEnabled: false,
                        mode: 'subscribe',
                      });
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Plan & usage" />
        {snapshot ? (
          <View style={styles.stack}>
            <View style={styles.chipRow}>
              <StatusChip label={`Plan: ${snapshot.plan_code}`} tone="info" />
              <StatusChip
                label={snapshot.status.replace('_', ' ')}
                tone={subscriptionTone(snapshot.status)}
              />
              <StatusChip label={snapshot.billing_interval} />
              {snapshot.soft_locked ? <StatusChip label="Soft locked" tone="warning" /> : null}
            </View>
            <Text style={styles.meta}>
              Staff {snapshot.used_staff}/{snapshot.effective_max_staff} · Offices {snapshot.used_offices}/
              {snapshot.effective_max_branches} · Total ₹{(snapshot.pricing.total_amount_paise / 100).toFixed(0)}
              {snapshot.billing_interval === 'yearly' ? '/year' : '/month'}
            </Text>
            <Text style={styles.meta}>
              Included {snapshot.included_staff} staff / {snapshot.included_offices} offices · Add-ons +
              {snapshot.extra_staff} staff (+₹{(snapshot.pricing.addon_staff_unit_paise / 100).toFixed(0)}) · +
              {snapshot.extra_offices} offices (+₹{(snapshot.pricing.addon_office_unit_paise / 100).toFixed(0)})
              {checkoutProductCode === 'shopie'
                ? ` · Pets ${snapshot.pets_pack_enabled ? 'on' : 'off'} (+₹${((snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100) / 100).toFixed(0)})`
                : ''}
            </Text>
            <View style={styles.detailListTight}>
              <Detail label="Started" value={formatDate(snapshot.subscribed_at)} />
              <Detail
                label={String(snapshot.status || '').includes('trial') ? 'Trial ends' : 'Trial ended'}
                value={formatDate(snapshot.trial_ends_at)}
              />
              <Detail label="Period start" value={formatDate(snapshot.current_period_starts_at)} />
              <Detail label="Period end" value={formatDate(snapshot.current_period_ends_at)} />
              <Detail label="Renews on" value={formatDate(snapshot.renews_at)} />
              {snapshot.canceled_at ? (
                <Detail label="Canceled" value={formatDate(snapshot.canceled_at)} />
              ) : null}
            </View>
            <View style={styles.stack}>
              <Input
                label="Extra staff"
                value={extraStaff}
                onChangeText={setExtraStaff}
                keyboardType="number-pad"
              />
              <Input
                label="Extra offices"
                value={extraOffices}
                onChangeText={setExtraOffices}
                keyboardType="number-pad"
              />
              {checkoutProductCode === 'shopie' ? (
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.label}>Pets pack</Text>
                    <Text style={styles.meta}>₹{PETS_PACK_PRICE_INR}/month · profiles, birthdays, owner alerts</Text>
                  </View>
                  <Switch value={petsPackEnabled} onValueChange={setPetsPackEnabled} />
                </View>
              ) : null}
              <Button
                label="Update add-ons"
                loading={busy === 'addons'}
                fullWidth
                onPress={async () => {
                  setBusy('addons');
                  try {
                    await addons.update(checkoutProductCode, {
                      extra_staff: Math.max(0, Number(extraStaff) || 0),
                      extra_offices: Math.max(0, Number(extraOffices) || 0),
                      ...(checkoutProductCode === 'shopie' ? { pets_pack_enabled: petsPackEnabled } : {}),
                    });
                    await afterMutation('Add-ons updated. Billing total refreshed.');
                  } catch (err) {
                    showError(err, 'Unable to update add-ons. Check usage limits.');
                  } finally {
                    setBusy(null);
                  }
                }}
              />
              <Button
                label="Pay current total via UPI"
                variant="outline"
                fullWidth
                onPress={() => {
                  const planCode =
                    snapshot?.plan_code ||
                    subscriptionByProduct.get(checkoutProductCode)?.plan_code ||
                    getDefaultPlanCode(plansByProduct.get(checkoutProductCode) ?? []);
                  if (!planCode) {
                    showError(new Error('No plan selected.'), 'No plan selected.');
                    return;
                  }
                  setUpiPayRequest({
                    productCode: checkoutProductCode,
                    planCode,
                    productName: getProductName(checkoutProductCode),
                    planName: planCode,
                    extraStaff: Math.max(0, Number(extraStaff) || 0),
                    extraOffices: Math.max(0, Number(extraOffices) || 0),
                    petsPackEnabled: checkoutProductCode === 'shopie' ? petsPackEnabled : false,
                    mode: 'addons',
                    autoStart: true,
                  });
                }}
              />
            </View>
          </View>
        ) : (
          <Text style={styles.meta}>Loading current entitlements…</Text>
        )}
        <View style={styles.detailList}>
          <Detail label="Provider" value={billing?.provider ?? '—'} />
          <Detail label="Currency" value={billing?.currency ?? '—'} />
          <Detail label="Mock mode" value={billing?.mock_mode ? 'Yes' : 'No'} />
        </View>
      </Card>

      <Card>
        <View style={styles.loyaltyHeader}>
          <View style={styles.loyaltyHeaderCopy}>
            <Text style={styles.loyaltyTitle}>Reward points</Text>
            <Text style={styles.meta}>
              Customers earn points per completed service and redeem them for booking discounts.
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
            <Text style={styles.loyaltyNoticeTitle}>AppointIE Pro required</Text>
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
                {Math.max(1, Number(pointsPerUnit) || 10)} points = ₹1 · max {Math.min(100, Math.max(0, Number(maxRedeemPercent) || 0))}% of
                service price · min {Math.max(0, Number(minRedeemPoints) || 0)} pts to redeem
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
                hint="Share of service price customers can cover"
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

      <Card style={styles.catalogCard}>
        <SectionHeader title="Catalog" />
        {PRODUCT_CATALOG.map((product, index) => (
          <View key={product.id} style={[styles.catalogRow, index === 0 && styles.catalogRowFirst]}>
            <Text style={styles.catalogName}>{product.name}</Text>
            <Text style={styles.catalogDesc}>{product.description}</Text>
          </View>
        ))}
      </Card>
    </RefreshableScrollView>
    </DesktopPage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
