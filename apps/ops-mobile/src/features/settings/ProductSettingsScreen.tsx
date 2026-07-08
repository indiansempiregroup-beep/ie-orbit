import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BusinessProductSubscription } from '@ie-platform/sdk';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenState } from '../../components/ScreenState';
import { SelectField } from '../../components/SelectField';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBillingStatus, useProductMutations, useProductPlans, useTenantSettings } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { getAvailableProducts, getProductName, getSubscribedProducts, PRODUCT_CATALOG } from '../../utils/products';

function getDefaultPlanCode(plans: { code?: string; is_default?: boolean }[]) {
  return plans.find((plan) => plan.is_default)?.code ?? plans[0]?.code ?? '';
}

export function ProductSettingsScreen() {
  const { activeBusiness, refreshWorkspace } = useWorkspace();
  const { settings, loading } = useTenantSettings();
  const { status: billing } = useBillingStatus();
  const { plans } = useProductPlans();
  const mutations = useProductMutations();

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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProduct(activeBusiness?.selected_product ?? subscribedProducts[0]?.id ?? '');
  }, [activeBusiness?.selected_product, subscribedProducts]);

  useEffect(() => {
    const next: Record<string, string> = {};
    availableProducts.forEach((product) => {
      const productPlans = plansByProduct.get(product.id) ?? [];
      next[product.id] = getDefaultPlanCode(productPlans);
    });
    setPendingPlanByProduct((current) => ({ ...next, ...current }));
  }, [availableProducts, plansByProduct]);

  if (loading && !settings) return <ScreenState loading />;

  async function afterMutation(successMessage: string) {
    await refreshWorkspace();
    setMessage(successMessage);
    setError(null);
  }

  return (
    <RefreshableScrollView contentContainerStyle={styles.wrap} onRefresh={refreshWorkspace}>
      <Card>
        <Text style={styles.title}>Active product</Text>
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
            setError(null);
            try {
              await mutations.setActiveProduct(selectedProduct);
              await afterMutation(`Active product set to ${getProductName(selectedProduct)}.`);
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to save product selection.'));
            } finally {
              setBusy(null);
            }
          }}
        />
        <Detail label="Plan" value={settings?.subscription?.plan_name ?? settings?.subscription?.plan ?? '—'} />
        <Detail label="Status" value={settings?.subscription?.status ?? '—'} />
      </Card>

      <Card>
        <Text style={styles.title}>Subscribed products</Text>
        {subscribedProducts.length === 0 ? (
          <Text style={styles.meta}>No active subscriptions.</Text>
        ) : (
          subscribedProducts.map((product) => {
            const subscription = subscriptionByProduct.get(product.id);
            const productPlans = plansByProduct.get(product.id) ?? [];
            const currentPlan = subscription?.plan_code ?? getDefaultPlanCode(productPlans);
            return (
              <View key={product.id} style={styles.productBlock}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.meta}>
                  {subscription?.plan_name ?? subscription?.plan_code ?? 'Trial'} · {subscription?.status ?? '—'}
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
                      label="Update plan"
                      variant="outline"
                      loading={busy === `plan-${product.id}`}
                      onPress={async () => {
                        const planCode = pendingPlanByProduct[product.id] ?? currentPlan;
                        if (!planCode) return;
                        setBusy(`plan-${product.id}`);
                        try {
                          await mutations.changePlan(product.id, planCode);
                          await afterMutation(`Plan updated for ${product.name}.`);
                        } catch (err) {
                          setError(getApiErrorMessage(err, 'Unable to change plan.'));
                        } finally {
                          setBusy(null);
                        }
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
                        setError(getApiErrorMessage(err, 'Unable to unsubscribe.'));
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
          <Text style={styles.title}>Add product</Text>
          {availableProducts.map((product) => {
            const productPlans = plansByProduct.get(product.id) ?? [];
            return (
              <View key={product.id} style={styles.productBlock}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.meta}>{product.description}</Text>
                {productPlans.length > 0 ? (
                  <SelectField
                    label="Plan"
                    value={pendingPlanByProduct[product.id] ?? getDefaultPlanCode(productPlans)}
                    options={productPlans.map((plan) => ({ value: plan.code, label: plan.name ?? plan.code }))}
                    onChange={(value) => setPendingPlanByProduct((current) => ({ ...current, [product.id]: value }))}
                  />
                ) : null}
                <Button
                  label="Subscribe"
                  loading={busy === `sub-${product.id}`}
                  fullWidth
                  onPress={async () => {
                    setBusy(`sub-${product.id}`);
                    try {
                      await mutations.subscribe(
                        product.id,
                        pendingPlanByProduct[product.id] ?? getDefaultPlanCode(productPlans),
                        subscribedProducts.length === 0,
                      );
                      await afterMutation(`Subscribed to ${product.name}.`);
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'Unable to subscribe.'));
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.title}>Catalog</Text>
        {PRODUCT_CATALOG.map((product) => (
          <Text key={product.id} style={styles.catalogRow}>
            {product.name}: {product.description}
          </Text>
        ))}
      </Card>

      <Card>
        <Text style={styles.title}>Billing</Text>
        <Detail label="Provider" value={billing?.provider ?? '—'} />
        <Detail label="Currency" value={billing?.currency ?? '—'} />
        <Detail label="Mock mode" value={billing?.mock_mode ? 'Yes' : 'No'} />
      </Card>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </RefreshableScrollView>
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

const styles = StyleSheet.create({
  wrap: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.sm },
  meta: { ...typography.body, color: colors.mutedForeground },
  productBlock: { marginTop: spacing.md, gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  productName: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  catalogRow: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  detail: { marginTop: spacing.md, gap: 4 },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
